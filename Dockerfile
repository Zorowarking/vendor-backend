FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files and install (needed for Prisma CLI stability)
# Using --legacy-peer-deps to ignore frontend/expo dependency conflicts during backend build
COPY package*.json ./
RUN npm install --ignore-scripts --legacy-peer-deps

# Copy the prisma schema
COPY prisma/ ./prisma/

# Copy server package files and install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --ignore-scripts

# Generate Prisma client
# Since the schema defines output as "../server/node_modules/.prisma/client",
# running this from the root will correctly place it in the server's node_modules.
RUN npx prisma generate --schema=prisma/schema.prisma

# Prune server dependencies
RUN cd server && npm prune --omit=dev

# ─── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# openssl is required by the Prisma query engine
RUN apk add --no-cache openssl

# Copy the pruned node_modules from builder
COPY --from=builder /app/server/node_modules ./server/node_modules

# Copy server source code
COPY server/ ./server/

# Copy Prisma schema (needed if Prisma runs at startup)
COPY prisma/ ./prisma/

EXPOSE 3000
ENV NODE_ENV=production

# Run from /app so relative paths in server code resolve correctly
CMD ["node", "server/index.js"]
