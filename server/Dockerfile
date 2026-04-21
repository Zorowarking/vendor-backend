# ─── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the root configuration files (needed by Prisma CLI)
COPY prisma.config.js ./
COPY prisma/ ./prisma/
COPY package*.json ./

# Install dotenv in root so prisma.config.js can load it
RUN npm install dotenv @prisma/config

# Copy server package files and install
COPY server/package*.json ./server/
RUN cd server && npm install && npm install @prisma/client

# Generate Prisma client (will use prisma.config.js and schema.prisma)
# The output path in schema.prisma is "../server/node_modules/.prisma/client"
RUN npx prisma generate --schema=./prisma/schema.prisma

# Prune dev dependencies from the server node_modules
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

# Copy Prisma schema and config (needed if you run CLI in container)
COPY prisma/ ./prisma/
COPY prisma.config.js ./

EXPOSE 3000
ENV NODE_ENV=production

# The server entry point expects to be run from /app
CMD ["node", "server/index.js"]
