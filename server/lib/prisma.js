// Load environment variables if they are not already set (e.g., in local development)
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
}

// Standard require for @prisma/client works best when properly generated in the local node_modules
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

let prismaClientInstance;

/**
 * Shared Prisma Client Initialization
 * Uses the standard 'pg' driver adapter for robust PostgreSQL connectivity.
 */
function getPrismaClient() {
  if (prismaClientInstance) return prismaClientInstance;

  let connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    connectionString = connectionString.replace(/^["'](.+)["']$/, '$1').trim();
  }

  if (!connectionString) {
    console.error('[PRISMA] CRITICAL: DATABASE_URL is not defined.');
    return new PrismaClient();
  }

  // Set the environment variable for the internal engine
  process.env.DATABASE_URL = connectionString;

  console.log('[PRISMA] Initializing standard Prisma Client with Driver Adapter...');
  const pool = new Pool({ 
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000, // 60s to handle NeonDB cold starts
    ssl: {
      rejectUnauthorized: false
    }
  });
  const adapter = new PrismaPg(pool);

  prismaClientInstance = new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
  
  return prismaClientInstance;
}

// Global instance management
const prisma = getPrismaClient();

/**
 * Helper to retry database operations if they fail due to transient issues (timeouts, etc.)
 */
async function withRetry(operation, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isTimeout = error.code === 'ETIMEDOUT' || 
                        error.message?.includes('timeout') || 
                        error.message?.includes('ETIMEDOUT') ||
                        error.code === 'P2024'; // Prisma timeout code
      
      if (isTimeout && i < maxRetries - 1) {
        console.warn(`[PRISMA] Operation failed (timeout), retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      console.error('[PRISMA] Operation failed with non-retryable error:', error.message || error);
      throw error;
    }
  }
  console.error('[PRISMA] Operation failed after max retries:', lastError.message || lastError);
  throw lastError;
}

/**
 * Self-Healing Profile Utility
 * Ensures a Profile and Customer record exist for the authenticated user.
 */
async function getOrCreateCustomerProfile(user) {
  const { uid, phoneNumber, name } = user;
  const normalizedPhone = phoneNumber || 'unknown';
  
  // 1. Ensure Profile exists (Self-Healing Lookup)
  let profile = await withRetry(async () => {
    // A. Check by Firebase UID first
    let p = await prisma.profile.findUnique({
      where: { firebaseUid: uid },
      include: { customer: true }
    });

    if (p) return p;

    // B. Check by Phone Number if UID didn't match
    if (normalizedPhone !== 'unknown') {
      p = await prisma.profile.findFirst({
        where: { phoneNumber: normalizedPhone },
        include: { customer: true }
      });

      if (p) {
        console.log(`[PRISMA] Identity adopt: Link phone ${normalizedPhone} to new UID ${uid}`);
        return await prisma.profile.update({
          where: { id: p.id },
          data: { firebaseUid: uid },
          include: { customer: true }
        });
      }
    }

    // C. Fresh Create if nothing found (Race-Condition Safe)
    console.log(`[PRISMA] Fresh identity: Create profile for UID ${uid}`);
    try {
      return await prisma.profile.create({
        data: {
          firebaseUid: uid,
          phoneNumber: normalizedPhone,
          role: 'CUSTOMER'
        },
        include: { customer: true }
      });
    } catch (createError) {
      if (createError.code === 'P2002') {
        console.warn(`[PRISMA] Race condition detected for UID ${uid}. Re-fetching...`);
        // Someone else created it in the few milliseconds between our check and our create.
        // Return the one that now exists.
        return await prisma.profile.findFirst({
          where: {
            OR: [
              { firebaseUid: uid },
              { phoneNumber: normalizedPhone }
            ]
          },
          include: { customer: true }
        });
      }
      throw createError;
    }
  });

  // 2. Ensure Customer record exists (with Retry for reliability)
  if (!profile.customer) {
    console.log(`[PRISMA] Creating missing customer record for UID: ${uid}`);
    const newCustomer = await withRetry(() => prisma.customer.create({
      data: {
        profileId: profile.id,
        phone: profile.phoneNumber,
        fullName: name || 'Customer'
      }
    }));
    profile.customer = newCustomer;
  } else {
    // 3. Sync profile/customer if phone number was mock (+1000) or differs
    const needsPhoneSync = profile.phoneNumber !== normalizedPhone && normalizedPhone !== 'unknown';
    if (needsPhoneSync || (name && profile.customer.fullName === 'Customer')) {
        console.log(`[PRISMA] Syncing profile phone to ${normalizedPhone}`);
        const updatedProfile = await prisma.profile.update({
            where: { id: profile.id },
            data: { phoneNumber: normalizedPhone },
            include: { customer: true }
        });
        
        await prisma.customer.update({
            where: { id: profile.customer.id },
            data: { 
                phone: normalizedPhone,
                fullName: name || profile.customer.fullName
            }
        });
        profile = updatedProfile;
    }
  }

  return profile;
}

module.exports = { prisma, withRetry, getOrCreateCustomerProfile };
