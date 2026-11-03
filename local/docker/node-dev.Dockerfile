# Dev image for the API (build context = repo root, npm workspaces).
# Source is bind-mounted at /repo; node_modules stays inside the image/volume.
FROM node:22-bookworm-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY worker/package.json worker/
RUN npm ci --no-audit --no-fund
USER node
WORKDIR /repo/api
CMD ["npm", "run", "dev"]
