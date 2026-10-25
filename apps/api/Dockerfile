# Image de l'API pour Dokku (aura-vps). Contexte de build : racine du dépôt,
# réduit à package.json, bun.lock, packages/contract et apps/api.
FROM node:22-bookworm-slim

RUN npm install -g bun@1.3.14

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/contract packages/contract
COPY apps/api apps/api

# Le lockfile décrit aussi apps/dashboard, absent de ce contexte : pas de --frozen-lockfile.
RUN bun install
RUN bun run --cwd packages/contract build && bun run --cwd apps/api build

WORKDIR /app/apps/api
ENV HOST=0.0.0.0 PORT=5000
EXPOSE 5000
CMD ["node", "dist/server.js"]
