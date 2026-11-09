#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

for tool in docker curl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required command not found: $tool. See README.md for local setup." >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker is unavailable. Start Docker in Ubuntu and check 'docker info'." >&2
  exit 1
fi
docker compose version >/dev/null

if [[ ! -s .https/local.crt || ! -s .https/local.key || ! -s .https/local.pfx ]]; then
  if ! command -v dotnet >/dev/null 2>&1; then
    echo "Install the .NET 10 SDK to create the local HTTPS certificate." >&2
    exit 1
  fi
  bash infra/create-local-cert.sh
fi

docker compose up --build --wait --wait-timeout 180

# Compose waits for Keycloak; also wait for the application to accept HTTPS.
echo "Waiting for OIDC Lens at https://localhost:7443 ..."
deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  if curl --fail --silent --connect-timeout 2 --max-time 3 \
    --cacert .https/local.crt https://localhost:7443/ --output /dev/null; then
    echo "OIDC Lens is ready: https://localhost:7443"
    exit 0
  fi
  sleep 1
done

echo "OIDC Lens did not become ready. Recent application logs:" >&2
docker compose logs --tail=50 bff resource-api
exit 1
