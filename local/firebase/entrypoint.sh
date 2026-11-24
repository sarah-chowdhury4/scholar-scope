#!/bin/sh
# Starts the emulators. Data survives restarts: it is exported on shutdown and imported on the next start.
# The export goes to a SUBFOLDER of the volume: firebase-tools replaces the whole export folder, and the
# volume's mount point (/data itself) cannot be removed, so exporting straight to /data always failed (EBUSY).
set -e
DIR=/data/export
IMPORT=""
if [ -f "$DIR/firebase-export-metadata.json" ]; then
  IMPORT="--import=$DIR"
elif [ -f /data/firebase-export-metadata.json ]; then
  IMPORT="--import=/data"   # data saved by an older version of this script
fi
# "demo-" project ids never touch a real Firebase/GCP project.
exec firebase emulators:start --project demo-scholarscope --only auth,firestore $IMPORT --export-on-exit="$DIR"
