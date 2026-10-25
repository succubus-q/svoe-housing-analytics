FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY prisma ./prisma
RUN npm ci && npm run prisma:generate

FROM dependencies AS backend
COPY . .
RUN npm run typecheck && mkdir -p /app/data/sync-raw && chown -R node:node /app/data
USER node
EXPOSE 3001
CMD ["sh", "-c", "npm run prisma:migrate && exec node src/server.ts"]

FROM dependencies AS frontend-build
COPY frontend ./frontend
RUN npm run build --workspace frontend

FROM nginx:stable-alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
