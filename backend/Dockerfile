# Pinned to the patched 22.x LTS (2026-10-21 security release: Brotli RCE,
# TLS hostname bypasses, dns NUL truncation, c-ares/OpenSSL/Undici updates).
FROM node:22.23.4-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4141

CMD ["npm", "run", "start"]
