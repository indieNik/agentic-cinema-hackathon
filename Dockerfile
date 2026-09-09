# Built by Cloud Build via `gcloud run deploy --source .` — no local Docker needed.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
# Cloud Run injects PORT; the server reads it.
CMD ["node", "server/index.js"]
