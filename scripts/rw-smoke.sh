#!/bin/sh
# Smoke test for the LCC <-> RootWatch endpoints.
# Starts pending cli-auth + device-enrollment sessions against a live instance —
# approve (or deny) them in the RootWatch dashboard to complete the loop.
#
# Usage: RW_URL=http://localhost:5000 scripts/rw-smoke.sh
set -e
BASE="${RW_URL:-http://localhost:5000}"

echo "== GET /api/capabilities (reachable check) =="
curl -sf -m 5 "$BASE/api/capabilities" >/dev/null && echo "instance reachable" || { echo "NOT REACHABLE at $BASE"; exit 1; }

echo
echo "== POST /api/v1/cli-auth/start =="
curl -s -X POST "$BASE/api/v1/cli-auth/start" \
  -H 'content-type: application/json' \
  -d '{"label":"lcc-smoke-test"}'
echo

echo
echo "== POST /api/v1/enroll/start =="
curl -s -X POST "$BASE/api/v1/enroll/start" \
  -H 'content-type: application/json' \
  -d "{\"hostname\":\"$(hostname)\",\"os\":\"smoke\"}"
echo

echo
echo "Both calls should return {code, secret, verifyUrl, expiresAt}."
echo "Approve them in the dashboard to exercise the claim paths, or deny to test rejection."
