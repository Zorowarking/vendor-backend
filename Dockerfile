# ─── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the prisma schema first so postinstall can find it
COPY prisma/ ./prisma/

# Copy server package files and install dependencies
# This will automatically trigger the 'postinstall' prisma generate script
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy server source code
COPY server/ ./server/

# Prune dev dependencies now that client is generated
RUN cd server && npm prune --omit=dev

# ─── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

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
