#!/bin/sh
# Storage permission tests for Herbert (NFR-1.2, NFR-2.2). Run with:
#   docker compose run --rm --entrypoint /bin/sh minio-init /init/test-permissions.sh
# Every line must print PASS.
set -u
mc alias set api     http://minio:9000 "$MINIO_API_ACCESS_KEY"     "$MINIO_API_SECRET_KEY"     >/dev/null
mc alias set worker  http://minio:9000 "$MINIO_WORKER_ACCESS_KEY"  "$MINIO_WORKER_SECRET_KEY"  >/dev/null
mc alias set deleter http://minio:9000 "$MINIO_DELETER_ACCESS_KEY" "$MINIO_DELETER_SECRET_KEY" >/dev/null
mc alias set root    http://minio:9000 "$MINIO_ROOT_USER"          "$MINIO_ROOT_PASSWORD"      >/dev/null

FAILS=0
expect() {  # $1=allow|deny  $2=description  rest=command
  WANT=$1; DESC=$2; shift 2
  if "$@" >/dev/null 2>&1; then GOT=allow; else GOT=deny; fi
  if [ "$GOT" = "$WANT" ]; then echo "PASS  $DESC"; else echo "FAIL  $DESC (expected $WANT, got $GOT)"; FAILS=$((FAILS+1)); fi
}
put() { echo "permission-test" | mc pipe "$1"; }

KEY="u/test-user/perm-test-$$.txt"
expect allow "api can upload to uploads"              put "api/uploads/$KEY"
expect deny  "api cannot read uploads"                mc cat "api/uploads/$KEY"
expect deny  "api cannot write originals"             put "api/originals/$KEY"
expect allow "worker can read uploads"                mc cat "worker/uploads/$KEY"
expect allow "worker can add to originals"            put "worker/originals/$KEY"
expect allow "api can read originals"                 mc cat "api/originals/$KEY"
expect deny  "worker cannot delete from originals"    mc rm "worker/originals/$KEY"
expect deny  "worker cannot delete from uploads"      mc rm "worker/uploads/$KEY"
expect deny  "api cannot delete from originals"       mc rm "api/originals/$KEY"
# Bucket policy: older mc prints "none", newer mc prints "private" — both mean no anonymous access.
expect allow "originals has no anonymous policy"      sh -c "mc anonymous get root/originals | grep -Eqi 'none|private'"
# Real check: an anonymous HTTP request for the file must be refused.
if command -v wget >/dev/null 2>&1; then
  expect deny "anonymous cannot download an original" wget -q -O /dev/null "http://minio:9000/originals/$KEY"
fi
expect allow "deleter can delete all versions"        mc rm --versions --force "deleter/originals/$KEY"
expect allow "deleter can clean uploads"              mc rm --force "deleter/uploads/$KEY"

[ "$FAILS" -eq 0 ] && echo "All storage permission tests passed." || { echo "$FAILS test(s) failed."; exit 1; }
