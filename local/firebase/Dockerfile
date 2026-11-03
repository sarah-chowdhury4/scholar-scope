# Firebase Local Emulator Suite (Firestore + Auth + UI).
# Recent firebase-tools need Java 21 and Node 20+, so take Java from Temurin and Node from the official image.
FROM node:22-bookworm-slim AS node

FROM eclipse-temurin:21-jre-jammy
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && npm install -g firebase-tools@14 \
 && firebase setup:emulators:firestore \
 && firebase setup:emulators:ui

WORKDIR /app
COPY firebase.json firestore.rules firestore.indexes.json entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
