# syntax=docker/dockerfile:1
# Grant Engine — single container that serves the API + built SPA on Cloud Run.

# ── Build stage: install ALL deps (vite is a devDependency) and build the frontend ──
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # vite build → /app/dist

# ── Runtime stage: production deps + server + built assets ──
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (8080); server/index.js reads process.env.PORT. Do NOT hardcode it.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
# server/jobs/scout.js imports src/prompts.js and server/seed-fn.js imports
# src/data/context.js, so src/ must ship in the runtime image too.
COPY --from=build /app/src ./src
EXPOSE 8080
CMD ["node", "server/index.js"]
