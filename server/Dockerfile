# ---- Construction ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Exécution ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/app/uploads
WORKDIR /app
RUN apk add --no-cache wget && mkdir -p /app/uploads && chown -R node:node /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Les migrations sont appliquées automatiquement au démarrage
CMD ["node", "dist/index.js"]
