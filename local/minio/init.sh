#!/bin/sh
# Runs once per `docker compose up`. Safe to re-run.
# Mirrors the production Cloud Storage design:
#   uploads   = quarantine, objects expire after 7 days
#   originals = versioned; services can add but never delete (write-once by policy)
#   exports   = generated files and backups, expire after 30 days
set -eu

# mc would read a value starting with "-" as a command-line flag; stop with a clear message instead.
for V in "$MINIO_ROOT_PASSWORD" "$MINIO_API_SECRET_KEY" "$MINIO_WORKER_SECRET_KEY" "$MINIO_DELETER_SECRET_KEY"; do
  case "$V" in -*) echo "A MinIO secret in .env starts with '-'. Regenerate it (hex values never do)." >&2; exit 1 ;; esac
done

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

for B in uploads originals exports; do
  mc mb --ignore-existing "local/$B"
  mc anonymous set none "local/$B" >/dev/null
done

mc version enable local/originals
mc ilm import local/uploads   < /init/lifecycle-uploads.json
mc ilm import local/originals < /init/lifecycle-originals.json
mc ilm import local/exports   < /init/lifecycle-exports.json

add_user() {  # $1=policy name  $2=access key  $3=secret key
  mc admin policy create local "$1" "/init/policies/$1.json" >/dev/null
  mc admin user add local "$2" "$3" >/dev/null
  mc admin policy attach local "$1" --user "$2" >/dev/null 2>&1 || true   # already attached
}
add_user ss-api     "$MINIO_API_ACCESS_KEY"     "$MINIO_API_SECRET_KEY"
add_user ss-worker  "$MINIO_WORKER_ACCESS_KEY"  "$MINIO_WORKER_SECRET_KEY"
add_user ss-deleter "$MINIO_DELETER_ACCESS_KEY" "$MINIO_DELETER_SECRET_KEY"

echo "MinIO ready: buckets, versioning, lifecycle and 3 service users configured."
