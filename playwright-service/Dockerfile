# Playwright's official image includes Chromium + system deps
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev
# The base image's bundled browsers can lag the installed playwright version
# (package.json uses ^1.48 so the lockfile may resolve newer). Install the
# matching Chromium + headless shell into PLAYWRIGHT_BROWSERS_PATH (/ms-playwright)
# so browserType.launch() finds the executable at runtime.
RUN npx playwright install chromium

# Copy app code
COPY . .

# Cloud Run expects the server on port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
