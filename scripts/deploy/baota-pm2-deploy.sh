#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/www/wwwroot/uml-platform}"
RELEASE_SHA="${RELEASE_SHA:-$(date +%Y%m%d%H%M%S)}"
RELEASE_ARCHIVE="${RELEASE_ARCHIVE:-}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

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

mkdir -p "$DEPLOY_PATH/releases" "$DEPLOY_PATH/incoming" "$DEPLOY_PATH/shared"

RELEASE_DIR="$DEPLOY_PATH/releases/$RELEASE_SHA"
TMP_DIR="$DEPLOY_PATH/incoming/$RELEASE_SHA"
RELEASE_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PRODUCTION_ENV_FILE="$DEPLOY_PATH/shared/production.env"

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

echo "Installing production dependencies from $NPM_REGISTRY ..."
(
  cd "$TMP_DIR"
  npm ci \
    --omit=dev \
    --no-audit \
    --no-fund \
    --ignore-scripts \
    --workspace @uml-platform/api \
    --workspace @uml-platform/render-service \
    --include-workspace-root=false \
    --registry="$NPM_REGISTRY"
)

mv "$TMP_DIR" "$RELEASE_DIR"
ln -sfnT "$RELEASE_DIR" "$DEPLOY_PATH/current"

echo "Reloading PM2 processes ..."
(
  cd "$DEPLOY_PATH/current"
  if [[ -f "$PRODUCTION_ENV_FILE" ]]; then
    echo "Loading production environment: $PRODUCTION_ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    . "$PRODUCTION_ENV_FILE"
    set +a
  else
    echo "Warning: production environment file not found: $PRODUCTION_ENV_FILE" >&2
    echo "OnlyOffice and other optional production integrations may be unavailable." >&2
  fi
  export UML_RELEASE_SHA="$RELEASE_SHA"
  export UML_RELEASE_DIR="$RELEASE_DIR"
  export UML_RELEASE_STARTED_AT="$RELEASE_STARTED_AT"

  pm2 delete uml-api >/dev/null 2>&1 || true
  pm2 delete uml-render-service >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs --env production
  sleep 2

  check_pm2_cwd() {
    local process_name="$1"
    local expected_cwd="$2"
    local pid
    local actual_cwd

    pid="$(pm2 pid "$process_name" | tr -d '[:space:]')"
    if [[ -z "$pid" || "$pid" == "0" ]]; then
      echo "$process_name is not running" >&2
      pm2 status || true
      exit 1
    fi

    actual_cwd="$(readlink -f "/proc/$pid/cwd")"
    if [[ "$actual_cwd" != "$expected_cwd" ]]; then
      echo "$process_name is running from the wrong directory" >&2
      echo "Expected cwd: $expected_cwd" >&2
      echo "Actual cwd:   $actual_cwd" >&2
      pm2 status || true
      pm2 logs "$process_name" --nostream --lines 80 || true
      exit 1
    fi
  }

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

  echo "Checking PM2 process directories ..."
  EXPECTED_RELEASE_DIR="$(readlink -f "$RELEASE_DIR")"
  check_pm2_cwd uml-render-service "$EXPECTED_RELEASE_DIR"
  check_pm2_cwd uml-api "$EXPECTED_RELEASE_DIR"

  echo "Checking API version ..."
  VERSION_JSON="$(curl -fsS http://127.0.0.1:4001/api/version)"
  echo "API version: $VERSION_JSON"
  if [[ "$VERSION_JSON" != *'"supportsDesignTableDiagram":true'* ]]; then
    echo "API version check failed: design table diagram support is not enabled" >&2
    pm2 status || true
    pm2 logs uml-api --nostream --lines 80 || true
    exit 1
  fi

  pm2 save
)

echo "Cleaning old releases, keeping latest $KEEP_RELEASES ..."
CURRENT_RELEASE="$(readlink -f "$DEPLOY_PATH/current" || true)"
if [[ -z "$CURRENT_RELEASE" || ! -d "$CURRENT_RELEASE" ]]; then
  echo "Current release symlink is invalid after deploy: $DEPLOY_PATH/current" >&2
  exit 1
fi

release_rank=0
while read -r _ release_dir; do
  release_rank="$((release_rank + 1))"
  release_real="$(readlink -f "$release_dir" || true)"

  if [[ "$release_rank" -le "$KEEP_RELEASES" || "$release_real" == "$CURRENT_RELEASE" ]]; then
    continue
  fi

  if ! rm -rf -- "$release_dir"; then
    echo "Warning: failed to remove old release, keeping it: $release_dir" >&2
  fi
done < <(find "$DEPLOY_PATH/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn)

if [[ ! -f "$DEPLOY_PATH/current/apps/web/dist/index.html" ]]; then
  echo "Current release is missing web dist after cleanup: $DEPLOY_PATH/current/apps/web/dist/index.html" >&2
  exit 1
fi

rm -f "$RELEASE_ARCHIVE"

echo "Deploy finished: $RELEASE_SHA"
echo "Check API: curl http://127.0.0.1:4001/api/health"
echo "Check render-service: curl http://127.0.0.1:4002/health"
