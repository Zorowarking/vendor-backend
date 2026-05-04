const Redis = require('ioredis');

// Shared Redis connection logic
let connection;
const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  console.log('[REDIS] Initializing with REDIS_URL');
  connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    // Add TLS for rediss:// URLs
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    }
  });
} else {
  const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    lazyConnect: false,
    connectTimeout: 5000, 
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  };
  connection = new Redis(redisConfig);
}

connection.on('error', (err) => {
  // Silent error unless explicitly debugging to prevent terminal spam
  if (process.env.DEBUG_REDIS) {
    console.error('[REDIS] Connection Error:', err.message);
  }
});

connection.on('connect', () => {
  console.log('[REDIS] Connected successfully to Redis');
});

module.exports = {
  connection
};
