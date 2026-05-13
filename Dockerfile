FROM node:22-alpine AS builder

WORKDIR /app

# Copy ONLY the prisma schema and config (not root package.json with all Expo deps)
COPY prisma/ ./prisma/
COPY prisma.config.js ./

# Install ONLY prisma CLI at root level — NOT the full Expo/RN app deps
# This is the key optimization: avoids installing 500+ frontend packages just for prisma generate
RUN npm install --ignore-scripts prisma@7.7.0 @prisma/client@7.7.0 @prisma/config@7.7.0

# Copy server package files and install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --ignore-scripts

# Generate Prisma client
# Schema output is "../server/node_modules/.prisma/client" so generate from /app
RUN npx prisma generate --schema=prisma/schema.prisma

# Prune server dev dependencies
RUN cd server && npm prune --omit=dev

# ─── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# openssl is required by the Prisma query engine
RUN apk add --no-cache openssl

# Copy the pruned server node_modules (includes generated Prisma client)
COPY --from=builder /app/server/node_modules ./server/node_modules

# Copy server source code
COPY server/ ./server/

# Copy Prisma schema (needed if Prisma runs at startup)
COPY prisma/ ./prisma/
COPY prisma.config.js ./

EXPOSE 3000
ENV NODE_ENV=production

# Run from /app so relative paths in server code resolve correctly
CMD ["node", "server/index.js"]
