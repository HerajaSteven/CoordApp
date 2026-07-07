#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# URL precedence: CLI arg > EXPO_PUBLIC_API_URL env > .env file
URL="${1:-${EXPO_PUBLIC_API_URL:-}}"

if [[ -z "$URL" && -f "$ENV_FILE" ]]; then
  URL="$(grep -E '^EXPO_PUBLIC_API_URL=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
fi

if [[ -z "$URL" ]]; then
  echo "FAIL: EXPO_PUBLIC_API_URL is not set."
  echo "Set it in .env or pass URL directly: npm run health:check -- https://your-backend.up.railway.app"
  exit 1
fi

if [[ "$URL" == *"localhost"* || "$URL" == *"127.0.0.1"* ]]; then
  echo "FAIL: EXPO_PUBLIC_API_URL points to localhost: $URL"
  echo "Use your deployed backend URL for real devices."
  exit 1
fi

if [[ "$URL" != https://* ]]; then
  echo "FAIL: EXPO_PUBLIC_API_URL must use HTTPS for modern Android devices: $URL"
  exit 1
fi

HEALTH_URL="${URL%/}/health"
MAX_TIME=12
CONNECT_TIMEOUT=5
RETRIES=2

echo "Checking backend health at: $HEALTH_URL"

set +e
HTTP_CODE="$(curl -sS \
  --max-time "$MAX_TIME" \
  --connect-timeout "$CONNECT_TIMEOUT" \
  --retry "$RETRIES" \
  --retry-all-errors \
  --retry-delay 1 \
  -o /tmp/zimo-health-body.txt \
  -w '%{http_code}' \
  "$HEALTH_URL")"
CURL_EXIT=$?
set -e

if [[ $CURL_EXIT -ne 0 ]]; then
  echo "FAIL: Could not reach backend health endpoint (curl exit $CURL_EXIT)."
  echo "Possible causes: service not running, app not listening on PORT, startup crash, or network block."
  exit 1
fi

if [[ "$HTTP_CODE" != 2* ]]; then
  echo "FAIL: Health endpoint returned HTTP $HTTP_CODE"
  echo "Response body:"
  cat /tmp/zimo-health-body.txt
  exit 1
fi

BODY="$(cat /tmp/zimo-health-body.txt)"
if [[ "$BODY" == *'"status":"ok"'* || "$BODY" == *'"ok":true'* || "$BODY" == *'healthy'* ]]; then
  echo "PASS: Backend reachable and healthy (HTTP $HTTP_CODE)."
else
  echo "PASS: Backend reachable (HTTP $HTTP_CODE), but response is non-standard."
  echo "Response body:"
  cat /tmp/zimo-health-body.txt
fi
