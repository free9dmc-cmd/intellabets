# IntellaBets API — production image
FROM node:20-slim

# Prisma needs openssl at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (backend is self-contained; isolated build context = no workspace)
COPY package.json ./
RUN npm install --legacy-peer-deps

# Generate Prisma client + build
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production

# Sync schema then boot. (For a first launch db push is fine; switch to
# `prisma migrate deploy` once you introduce migration files.)
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/main"]
