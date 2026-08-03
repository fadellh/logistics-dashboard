# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# lib/db/client.ts and lib/ai/client.ts both throw at import time if their env var is
# missing (fail-fast in production) — and Next's build "collect page data" step imports
# every route module, including /api/ask, to analyze it, even though the route itself is
# request-time dynamic. These placeholders exist only to satisfy that import-time check;
# no network call happens at build. The real values from `docker run --env-file .env`
# override these at container start (runtime env always wins over image-baked ENV).
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost/placeholder"
ENV DEEPSEEK_API_KEY="build-placeholder"
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
