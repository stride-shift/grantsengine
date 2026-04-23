# Playwright's official image includes Chromium + system deps
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app code
COPY . .

# Cloud Run expects the server on port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
