# shellcheck disable=SC2148
# shellcheck disable=SC1089
set dotenv-filename := ".env.local" # Look for .env.local in the project root
set dotenv-load := true

# Variables for the p3fo project
PROJECT_NAME := "p3fo"
DOCKER_IMAGE_NAME := "git.at-it.ch/advance-ticket/p3fo"
PORT := "5173"

# Check for environment variable presence
_check-env var:
    #!/usr/bin/env bash
    if [ -z "${var}" ]; then
        echo "Error: ${var} environment variable is not set" >&2
        exit 1
    fi

# --- Development Task ---
# Starts the development environment
dev:
  @echo "--- Starting P3FO Development Environment ---"
  @echo "[1/2] Starting development server..."
  pnpm run dev:all

dev-otel:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "--- Starting P3FO Development Environment with local OpenTelemetry ---"
  echo "[1/3] Starting OTel stack..."
  docker compose -f docker-compose.hyperdx.yml up -d
  echo "[2/3] Waiting for the OTel collector on :14318..."
  for _ in $(seq 1 240); do
    if curl -s --max-time 1 -o /dev/null "http://localhost:14318/"; then
      break
    fi
    sleep 0.5
  done
  if ! curl -s --max-time 1 -o /dev/null "http://localhost:14318/"; then
    echo "OTel collector did not become ready on :14318" >&2
    echo "Hint: docker compose -f docker-compose.hyperdx.yml logs --tail=40 otel-collector" >&2
    exit 1
  fi
  echo "HyperDX UI: http://localhost:18088"
  echo "[3/3] Starting development server..."
  VITE_OTEL_ENABLED=true \
    OTEL_COLLECTOR_URL=http://localhost:14318 \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:14318/v1/traces \
    pnpm run dev:all

# --- Browser-Only Development Task ---
# Reproduce the deployed browser-only mode locally for debugging
dev-browser:
  @echo "--- Starting P3FO Browser-Only Development Environment ---"
  @echo "[1/1] Starting frontend in browser-only mode..."
  VITE_P3FO_FORCE_BROWSER="true" VITE_BASE_URL="/p3fo" pnpm run dev

# Run all tests. Heavy suites are opt-OUT, mirroring omniticket's tests recipe:
#
#   just tests                - unit tests + load bench
#   just tests --skip load    - unit tests only
#
# The load bench skips gracefully when locust or Chrome is unavailable so the
# suite stays green on machines without the load-test prerequisites.
tests *args="":
  #!/usr/bin/env bash
  set -euo pipefail

  skip_set=""
  set -- {{args}}
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --skip)
        if [ "$#" -ge 2 ]; then
          skip_set="$2"
          shift 2
        else
          shift
        fi
        ;;
      --skip=*)
        skip_set="${1#--skip=}"
        shift
        ;;
      *)
        echo "Unknown argument: $1" >&2
        echo "Usage: just tests [--skip load]" >&2
        exit 2
        ;;
    esac
  done

  echo "▶ Unit tests..."
  pnpm test --run

  chrome_bin="${CHROME_BIN:-google-chrome}"
  clickhouse_url="${CLICKHOUSE_URL:-http://localhost:18123}"
  if [[ ",${skip_set}," == *",load,"* ]]; then
    echo "⏭  Load bench skipped (--skip load)"
  elif ! command -v locust > /dev/null 2>&1; then
    echo "⏭  Load bench skipped (locust not installed)"
  elif ! command -v "${chrome_bin}" > /dev/null 2>&1; then
    echo "⏭  Load bench skipped (${chrome_bin} not found)"
  elif ! curl -sf --max-time 2 "${clickhouse_url%/}/ping" > /dev/null 2>&1; then
    echo "⏭  Load bench skipped (ClickHouse/OTel not reachable; start 'just dev-otel' to enforce paint gates)"
  else
    echo "▶ Load bench..."
    just bench-check
  fi

# --- Load bench ---
bench users="25" duration="30":
  python3 bench/orchestrator.py --users {{users}} --duration {{duration}}

bench-browser users="25" duration="30":
  python3 bench/orchestrator.py --users {{users}} --duration {{duration}} --browser

bench-check users="25" duration="30":
  python3 bench/orchestrator.py --users {{users}} --duration {{duration}} --browser --enforce

# --- Code Quality Checks ---
check:
  @echo "Running TypeScript type check..."
  npx tsc -b --noEmit
  @echo "Running mcp-server TypeScript type check..."
  pnpm exec tsc -p mcp-server/tsconfig.json --noEmit
  @echo "Running ESLint..."
  npx eslint --max-warnings 0
  just check-node-versions

# --- Pre-commit checks ---
# Mirrors omniticket's pre-commit: build, run the full test suite (including
# the load bench), then typecheck/lint/node-version alignment via check.
pre-commit: build tests check
  @echo "✅ Pre-commit checks passed"

alias pre := pre-commit

# --- Version Management Tasks ---
sync-versions version:
  #!/usr/bin/env bash
  echo "{{version}}" > VERSION
  # add it to package.json
  jq --arg version "{{version}}" '.version = $version' package.json > tmp.json && mv tmp.json package.json

  if [ -z "$(git status --porcelain VERSION package.json)" ]; then
    echo "No changes in VERSION or package.json, skipping commit."
    exit 0
  fi
  git add VERSION package.json
  git commit -m "ci: bump p3fo to v{{version}}"

# --- Changelog Generation Tasks ---
changelog:
  #!/bin/bash
  # if on main, exit
  if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
    echo "You are on main branch, you should be on another branch"
    exit 1
  fi
  git-sv cgl --add-next-version > CHANGELOG.md
  if [ -n "$(git status --porcelain CHANGELOG.md)" ]; then
    git add CHANGELOG.md
    git commit -m "chore: update CHANGELOG.md to $(git-sv nv)"
    if [ -z "$(git rev-parse --abbrev-ref '@{upstream}')" ]; then
      git push --set-upstream origin "$(git rev-parse --abbrev-ref HEAD)"
    else
      git push
    fi
  fi

docker-build version="$(git-sv cv)":
  #!/usr/bin/env bash
  echo "Using version: {{version}}"
  set -e
  set -o pipefail
  echo "Creating tar files for deployment..."
  mkdir -p ~/Dev/itpark/infrastructure-as-code/ansible/dist/

  if ! command -v zstd >/dev/null 2>&1; then
    echo "Error: zstd is required to compress the deployment archive (brew install zstd / apt install zstd)." >&2
    exit 1
  fi

  echo "Building p3fo docker image with version {{version}}..."

  LAST_P3FO_HASH="$(docker images --format '{{{{.ID}}' p3fo)"
  echo "Last p3fo hash: $LAST_P3FO_HASH"
  LAST_P3FO_VERSION="$(docker images --format '{{{{.Tag}}' '{{DOCKER_IMAGE_NAME}}' | sort -V | tail -n 1)"
  echo "Last p3fo version: $LAST_P3FO_VERSION"

  # Build with version tag.
  # VITE_OTEL_ENABLED=true keeps OTel instrumentation in the production bundle
  # (lazy-loaded after first paint) so traces are available in prod without
  # blocking the initial render.
  docker build --build-arg VITE_OTEL_ENABLED=true -t "{{DOCKER_IMAGE_NAME}}":"{{version}}" .

  P3FO_CHANGED="$(docker images --format '{{{{.ID}}' p3fo)"
  echo "New p3fo hash: $P3FO_CHANGED"

  if [ "$LAST_P3FO_HASH" != "$P3FO_CHANGED" ] || [ "$LAST_P3FO_VERSION" != "{{version}}" ]; then
    echo "Tagging p3fo docker image with version {{version}}..."
    # docker tag is already done above, but ensuring latest is updated
    docker tag p3fo:latest p3fo:latest
    echo "Saving p3fo docker image to compressed tar file (zstd)..."
    docker save "{{DOCKER_IMAGE_NAME}}":"{{version}}" \
      | zstd -T0 -3 -q -f -o ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst
    rm -f ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar
    echo "Compressed tar file created: ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst ($(du -h --apparent-size ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst | cut -f1))"
  else
    echo "p3fo docker image has not changed"
    # Migrate an existing uncompressed archive once, so repeated deploys also
    # benefit from the smaller upload.
    if [ ! -f ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst ] \
       && [ -f ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar ]; then
      echo "Compressing existing p3fo.tar (one-off migration)..."
      zstd -T0 -3 -q -f -o ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst \
        ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar
      rm -f ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar
      echo "Compressed tar file created: ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst ($(du -h --apparent-size ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar.zst | cut -f1))"
    fi
  fi

# --- Docker Compose Run Task (with build) ---
docker-build-run:
  @echo "Building and starting {{PROJECT_NAME}} stack..."
  docker compose up -d --build

# --- Docker Compose Run Task ---
docker-run:
  @echo "Starting {{PROJECT_NAME}} stack..."
  docker compose up -d

# --- Docker Compose Logs Task ---
docker-logs:
  docker compose logs -f

# --- Docker Compose Frontend Logs Task ---
docker-logs-front:
  docker compose logs -f p3fo

# --- Docker Compose Backend Logs Task ---
docker-logs-back:
  docker compose logs -f p3fo-api

# --- Docker Compose Clean Task ---
docker-clean:
  @echo "Cleaning up {{PROJECT_NAME}} stack..."
  docker compose down -v

# --- Production Deployment Tasks ---
prod-push host='adt-vmg-202': _check-BW_SESSION
  @echo "Pushing {{PROJECT_NAME}} to production host {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t push -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-load host='adt-vmg-202': _check-BW_SESSION
  @echo "Loading {{PROJECT_NAME}} on production host {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t load -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-restart host='adt-vmg-202': _check-BW_SESSION
  @echo "Restarting {{PROJECT_NAME}} on production host {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t restart -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-stop host='adt-vmg-202': _check-BW_SESSION
  @echo "Stopping {{PROJECT_NAME}} on production host {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t stop -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

prod-status host='adt-vmg-202': _check-BW_SESSION
  @echo "Checking {{PROJECT_NAME}} status on production host {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t status -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"

# --- Full Deploy Task ---
deploy host='adt-vmg-202': _check-BW_SESSION docker-build
  @echo "Full deployment of {{PROJECT_NAME}} on {{host}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"
  just finish

# --- Deploy with version ---
deploy-version version host='adt-vmg-202': _check-BW_SESSION
  #!/usr/bin/env bash
  VERSION="{{version}}"
  just sync-versions "$VERSION"
  just docker-build "$VERSION"
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit "{{host}}"
  just finish

# --- Release Task (Complete Release Workflow) ---
release:
  #!/bin/bash
  # if on main, exit
  if [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ]; then
    echo "You are on main branch, you should be on another branch"
    exit 1
  fi
  VERSION=$(git-sv nv)
  just sync-versions "$VERSION"
  just changelog
  just create-github-release "$VERSION"
  git pull

create-github-release version:
    #!/bin/bash
    if [ "{{version}}" != "$(git-sv rn)" ]; then
        echo "Creating new release {{version}}"
        NOTES_FILE=$(mktemp)
        git-sv rn > "$NOTES_FILE"
        gcli -t github releases create -t "{{version}}" -c "$(git rev-parse --abbrev-ref HEAD)" -T "$NOTES_FILE"
    fi

# --- Check if BW_SESSION is set (for production tasks)
@_check-BW_SESSION:
    if [ -z "${BW_SESSION}" ]; then \
        echo "Error: BW_SESSION is not set. This is required for production deployment." >&2; \
        echo "Please ensure you have Bitwarden CLI configured and logged in." >&2; \
        exit 1; \
    fi

# --- Utility Tasks ---
clean:
  @echo "Cleaning up build artifacts and Docker resources..."
  rm -rf dist/
  rm -rf node_modules/
  docker compose down -v
  docker system prune -f

build:
  @echo "Building {{PROJECT_NAME}} frontend and backend..."
  VITE_OTEL_ENABLED=true pnpm build
  pnpm exec tsc --project tsconfig.server.json
  @echo "Building mcp-server..."
  pnpm -C mcp-server build

install:
  @echo "Installing dependencies..."
  pnpm install --config.minimumReleaseAge=168h
  @echo "Installing mcp-server dependencies (standalone package, not a pnpm workspace member)..."
  npm --prefix mcp-server ci --no-audit --no-fund

# --- Agent tooling: P3FO MCP server + Kilo skill ---
# Builds mcp-server and installs its Kilo skill into the global skills root so
# the p3fo_* tools work in every workspace on this machine.
# Usage: just mcp-setup [--force]   |   just mcp-check
mcp-setup force="":
    #!/usr/bin/env bash
    set -euo pipefail

    repo_root="$(cd "{{justfile_directory()}}" && pwd)"
    cd "${repo_root}"

    case "{{force}}" in
        ""|"--force") ;;
        *) echo "Usage: just mcp-setup [--force]" >&2; exit 1 ;;
    esac

    for cmd in node npm git; do
        command -v "${cmd}" > /dev/null 2>&1 || { echo "Missing required tool: ${cmd}" >&2; exit 1; }
    done

    want_node="$(awk '/^nodejs/ {print $2; exit}' .tool-versions 2>/dev/null || true)"
    have_node="$(node -v | sed 's/^v//')"
    if [ -n "${want_node}" ] && [ "${want_node}" != "${have_node}" ]; then
        echo "WARNING: node ${have_node} in PATH, .tool-versions pins ${want_node}"
    fi

    echo "[1/5] Installing mcp-server dependencies..."
    if [ -f mcp-server/package-lock.json ]; then
        npm --prefix mcp-server ci --no-audit --no-fund
    else
        npm --prefix mcp-server install --no-audit --no-fund
    fi

    echo "[2/5] Building mcp-server..."
    npm --prefix mcp-server run build
    if [ ! -f mcp-server/dist/index.js ]; then
        echo "ERROR: build produced no mcp-server/dist/index.js" >&2
        exit 1
    fi

    echo "[3/5] Smoke-testing the stdio handshake..."
    init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp-setup","version":"1"}}}'
    inited='{"jsonrpc":"2.0","method":"notifications/initialized"}'
    list='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
    tool_count="$(
        { printf '%s\n' "${init}" "${inited}" "${list}"; } \
            | node mcp-server/dist/index.js 2> /dev/null \
            | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{for(const l of d.split("\n")){if(!l.trim())continue;try{const m=JSON.parse(l);if(m.id===2&&m.result&&m.result.tools){console.log(m.result.tools.length);return}}catch{}}console.log(0)})'
    )"
    if [ "${tool_count:-0}" -lt 1 ]; then
        echo "ERROR: MCP server returned no tools" >&2
        exit 1
    fi
    echo "      ${tool_count} tools registered"

    echo "[4/5] Checking the P3FO backend..."
    api_url="${P3FO_API_URL:-https://p3fo.example.com/mcp}"
    if [ -n "${P3FO_API_KEY:-}" ]; then
        if curl -fsS -m 10 "${api_url%/}/api/health" -H "X-API-Key: ${P3FO_API_KEY}" > /dev/null 2>&1; then
            echo "      OK ${api_url%/}/api/health"
        else
            echo "      WARNING: ${api_url%/}/api/health unreachable (local backend not running?)"
        fi
    else
        echo "      WARNING: P3FO_API_KEY not set, skipped health check"
    fi

    echo "[5/5] Installing the Kilo skill..."
    src="skills/p3fo-mcp/SKILL.md"
    if [ ! -f "${src}" ]; then
        echo "ERROR: missing ${src}" >&2
        exit 1
    fi
    dest_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/kilo/skills/p3fo-mcp"
    dest="${dest_dir}/SKILL.md"
    mkdir -p "${dest_dir}"
    if [ -f "${dest}" ] && ! cmp -s "${src}" "${dest}" && [ ! -f "${dest_dir}/.installed-from" ] && [ "{{force}}" != "--force" ]; then
        echo "ERROR: ${dest} differs and was not installed by this recipe." >&2
        echo "       Re-run with: just mcp-setup --force" >&2
        exit 1
    fi
    cp "${src}" "${dest}"
    printf 'repo=%s\ncommit=%s\ninstalled_at=%s\n' \
        "${repo_root}" \
        "$(git -C "${repo_root}" rev-parse --short HEAD 2>/dev/null || echo unknown)" \
        "$(date -Is)" > "${dest_dir}/.installed-from"

    echo
    echo "Done: ${tool_count} tools, skill at ${dest}"
    echo "Start a new agent session (skills and MCP tools load at session start)."

# Verifies the MCP build and that the installed skill matches this repo.
mcp-check:
    #!/usr/bin/env bash
    set -euo pipefail
    repo_root="$(cd "{{justfile_directory()}}" && pwd)"
    cd "${repo_root}"
    rc=0

    if [ -f mcp-server/dist/index.js ]; then
        echo "OK   mcp-server/dist/index.js"
    else
        echo "FAIL mcp-server/dist/index.js missing (run: just mcp-setup)"; rc=1
    fi

    src="skills/p3fo-mcp/SKILL.md"
    dest="${XDG_CONFIG_HOME:-${HOME}/.config}/kilo/skills/p3fo-mcp/SKILL.md"
    if [ ! -f "${dest}" ]; then
        echo "FAIL skill not installed at ${dest} (run: just mcp-setup)"; rc=1
    elif cmp -s "${src}" "${dest}"; then
        echo "OK   skill in sync"
    else
        echo "FAIL skill drift: ${dest} differs from ${src} (run: just mcp-setup)"; rc=1
    fi

    [ "${rc}" -eq 0 ] && echo "MCP setup OK" || echo "MCP setup incomplete"
    exit "${rc}"

# --- Completion Message ---
finish:
  @echo
  @echo "---------------------------------"
  @echo "DEPLOY FINISHED!"
  @echo "---------------------------------"
  @echo "P3FO is now deployed and running."
  @echo

# --- Hardware Key Interaction for Security ---
hwkey-interaction:
  @echo
  @echo "---------------------------------"
  @echo "INTERACT WITH YOUR HW CRYPTO KEY!"
  @echo "---------------------------------"
  @echo

# --- Show current versions ---
version:
  @echo "Current git-sv version (current): $(git-sv cv)"
  @echo "Next git-sv version (next): $(git-sv nv)"
  @if [ -f VERSION ]; then echo "Local VERSION file: $(cat VERSION)"; fi
  @echo "package.json version: $(jq -r '.version' package.json)"

# --- Check that Node and pnpm versions are aligned across all config files ---
check-node-versions:
  #!/usr/bin/env bash
  set -euo pipefail
  errors=0

  echo "Checking version alignment across .tool-versions, package.json, Dockerfile, and deploy.yml..."

  # --- Node.js ---
  node_tool=$(grep '^nodejs' .tool-versions | awk '{print $2}')
  node_pkg=$(jq -r '.engines.node // empty' package.json 2>/dev/null || true)
  node_docker=$(grep -oP 'FROM node:\K[0-9]+' Dockerfile | head -1)
  node_ci=$(grep -oP "node-version: '?\\K[^']*" .github/workflows/deploy.yml | head -1)

  echo "  .tool-versions  node: $node_tool"
  echo "  package.json     node: ${node_pkg:-<not set>}"
  echo "  Dockerfile       node: $node_docker"
  echo "  deploy.yml       node: $node_ci"

  node_major_tool="${node_tool%%.*}"
  if [ "$node_major_tool" != "$node_docker" ]; then
    echo "  ERROR: .tool-versions node major ($node_major_tool) != Dockerfile ($node_docker)" >&2
    errors=$((errors + 1))
  fi
  if [ "$node_major_tool" != "$node_ci" ]; then
    echo "  ERROR: .tool-versions node major ($node_major_tool) != deploy.yml ($node_ci)" >&2
    errors=$((errors + 1))
  fi
  if [ -n "$node_pkg" ] && [ "$node_major_tool" != "${node_pkg%%.*}" ]; then
    echo "  ERROR: .tool-versions node major ($node_major_tool) != package.json engines ($node_pkg)" >&2
    errors=$((errors + 1))
  fi

  # --- pnpm ---
  pnpm_tool=$(grep '^pnpm' .tool-versions | awk '{print $2}')
  pnpm_pkg=$(jq -r '.packageManager' package.json | sed 's/pnpm@//')
  pnpm_docker=$(grep -oP 'pnpm@\K[0-9.]+' Dockerfile | head -1)
  pnpm_ci=$(grep -oP 'pnpm@\K[0-9.]+' .github/workflows/deploy.yml | head -1)

  echo "  .tool-versions  pnpm: $pnpm_tool"
  echo "  package.json     pnpm: $pnpm_pkg"
  echo "  Dockerfile       pnpm: $pnpm_docker"
  echo "  deploy.yml       pnpm: $pnpm_ci"

  if [ "$pnpm_tool" != "$pnpm_pkg" ]; then
    echo "  ERROR: .tool-versions pnpm ($pnpm_tool) != package.json ($pnpm_pkg)" >&2
    errors=$((errors + 1))
  fi
  if [ "$pnpm_tool" != "$pnpm_docker" ]; then
    echo "  ERROR: .tool-versions pnpm ($pnpm_tool) != Dockerfile ($pnpm_docker)" >&2
    errors=$((errors + 1))
  fi
  if [ "$pnpm_tool" != "$pnpm_ci" ]; then
    echo "  ERROR: .tool-versions pnpm ($pnpm_tool) != deploy.yml ($pnpm_ci)" >&2
    errors=$((errors + 1))
  fi

  if [ "$errors" -eq 0 ]; then
    echo "All versions are aligned."
  else
    echo "$errors error(s) found." >&2
    exit 1
  fi
