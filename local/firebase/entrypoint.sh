#!/bin/sh
# Starts the emulators. Data survives restarts: it is exported to /data on shutdown
# and imported again on the next start (first start has nothing to import).
set -e
IMPORT=""
if [ -f /data/firebase-export-metadata.json ]; then
  IMPORT="--import=/data"
fi
# "demo-" project ids never touch a real Firebase/GCP project.
exec firebase emulators:start --project demo-scholarscope --only auth,firestore $IMPORT --export-on-exit=/data
