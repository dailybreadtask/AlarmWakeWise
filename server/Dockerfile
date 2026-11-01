# Builds only what the server needs: its own packages, and the few shared files it imports from src/.
# Build context is the repository root (see railway.toml).
FROM node:22-slim
WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY src/domain ./src/domain
COPY src/journey ./src/journey

ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 8787
CMD ["npx", "tsx", "index.ts"]
