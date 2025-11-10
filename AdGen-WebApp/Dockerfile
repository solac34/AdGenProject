# Next.js Cloud Run Dockerfile for AdGen WebApp
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
# Use npm install to generate/update lockfile in container
RUN npm install --omit=dev

# Build the app
FROM base AS builder
WORKDIR /app
COPY package*.json ./
# Install all deps (including dev) for building
RUN npm install
COPY . .

# Ensure public directory exists
RUN mkdir -p ./public

# Build Next.js app
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public directory
COPY --from=builder /app/public ./public

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Ensure runtime has production dependencies and scripts folder for seeders
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

# Cloud Run will set the PORT environment variable dynamically
EXPOSE 8080

CMD ["node", "server.js"]
