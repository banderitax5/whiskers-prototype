# Production image: build the SPA once, then serve the static output with nginx.
# The dev server must never be the public origin: it ships unminified source,
# enables react-refresh/unsafe-eval, and has no service worker or manifest.

# Pinned to the patched 22.x LTS (2026-10-21 security release).
FROM node:22.23.4-alpine AS build

WORKDIR /app

# VITE_* values are read at build time and inlined into the bundle.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.28-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173
