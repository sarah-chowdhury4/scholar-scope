# Dev image for the worker (build context = repo root, npm workspaces).
# Adds Tesseract (local stand-in for Cloud Vision OCR) and poppler-utils (pdftoppm, to OCR
# scanned PDFs). ClamAV runs in its own container locally (service "clamav").
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng poppler-utils \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --no-audit --no-fund
USER node
WORKDIR /repo/worker
CMD ["npm", "run", "dev"]
