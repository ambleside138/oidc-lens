#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

mkdir -p .https
chmod 700 .https
dotnet dev-certs https --export-path .https/local.pfx --password oidc-lens-local
dotnet dev-certs https --export-path .https/local.crt --format PEM
dotnet dev-certs https --export-path .https/local.pem --format PEM --no-password

# Compose mounts individual files into containers running with different UIDs.
chmod a+r .https/local.crt .https/local.key .https/local.pfx
