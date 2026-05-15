#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/uml-platform}"
RELEASE_SHA="${RELEASE_SHA:-$(date +%Y%m%d%H%M%S)}"
RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

if [[ -z "$RELEASE_ARCHIVE" ]]; then
  echo "RELEASE_ARCHIVE is required" >&2
  exit 1
fi

if [[ ! -f "$RELEASE_ARCHIVE" ]]; then
  echo "Release archive not found: $RELEASE_ARCHIVE" >&2
  exit 1
fi

command -v node >/dev/null || {
  echo "node is required. Install Node.js 22 in BaoTa first." >&2
  exit 1
}
command -v npm >/dev/null || {
  echo "npm is required. Install Node.js/npm in BaoTa first." >&2
  exit 1
}
command -v pm2 >/dev/null || {
  echo "pm2 is required. Run: npm i -g pm2" >&2
  exit 1
}
command -v java >/dev/null || {
  echo "java is required for PlantUML rendering. Install a JRE first." >&2
  exit 1
}

mkdir -p "$DEPLOY_PATH/releases" "$DEPLOY_PATH/incoming"

RELEASE_DIR="$DEPLOY_PATH/releases/$RELEASE_SHA"
TMP_DIR="$DEPLOY_PATH/incoming/$RELEASE_SHA"

rm -rf "$TMP_DIR" "$RELEASE_DIR"
mkdir -p "$TMP_DIR"

echo "Extracting $RELEASE_ARCHIVE ..."
tar -xzf "$RELEASE_ARCHIVE" -C "$TMP_DIR"

if [[ ! -f "$TMP_DIR/package.json" || ! -f "$TMP_DIR/package-lock.json" ]]; then
  echo "Invalid release archive: missing package.json or package-lock.json" >&2
  exit 1
fi

if [[ ! -f "$TMP_DIR/apps/web/dist/index.html" ]]; then
  echo "Invalid release archive: missing apps/web/dist/index.html" >&2
  exit 1
fi

if [[ ! -f "$TMP_DIR/plantuml/build/libs/plantuml-1.2026.3beta8.jar" ]]; then
  echo "Invalid release archive: missing PlantUML jar" >&2
  exit 1
fi

echo "Installing production dependencies ..."
(
  cd "$TMP_DIR"
  npm ci --omit=dev
)

mv "$TMP_DIR" "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$DEPLOY_PATH/current"

echo "Reloading PM2 processes ..."
(
  cd "$DEPLOY_PATH/current"
  pm2 startOrReload ecosystem.config.cjs --env production
  sleep 2

  echo "Checking render-service health ..."
  if ! curl -fsS http://127.0.0.1:4002/health >/dev/null; then
    echo "render-service health check failed" >&2
    pm2 status || true
    pm2 logs uml-render-service --nostream --lines 80 || true
    exit 1
  fi

  echo "Checking API health ..."
  if ! curl -fsS http://127.0.0.1:4001/api/health >/dev/null; then
    echo "API health check failed" >&2
    pm2 status || true
    pm2 logs uml-api --nostream --lines 80 || true
    exit 1
  fi

  pm2 save
)

echo "Cleaning old releases, keeping latest $KEEP_RELEASES ..."
find "$DEPLOY_PATH/releases" -mindepth 1 -maxdepth 1 -type d \
  | sort -r \
  | tail -n +"$((KEEP_RELEASES + 1))" \
  | xargs -r rm -rf

rm -f "$RELEASE_ARCHIVE"

echo "Deploy finished: $RELEASE_SHA"
echo "Check API: curl http://127.0.0.1:4001/api/health"
echo "Check render-service: curl http://127.0.0.1:4002/health"
