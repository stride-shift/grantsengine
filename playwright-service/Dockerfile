# Playwright's official image ships Chromium (incl. chromium-headless-shell) + system
# deps. The tag MUST match the exact playwright version pinned in package.json — a
# mismatch means headless chromium.launch() looks for a browser revision the image
# doesn't contain (the cold-start "Executable doesn't exist" failure). Keep these in lockstep.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install production deps only (browsers already baked into the matched base image)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app code
COPY . .

# Cloud Run expects the server on port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
