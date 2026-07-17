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
  @echo "--- Starting P3FO Development Environment with local OpenTelemetry ---"
  @echo "[1/2] Starting development server..."
  docker compose -f docker-compose.hyperdx.yml up -d
  VITE_OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces pnpm run dev:all

# --- Browser-Only Development Task ---
# Reproduce the deployed browser-only mode locally for debugging
dev-browser:
  @echo "--- Starting P3FO Browser-Only Development Environment ---"
  @echo "[1/1] Starting frontend in browser-only mode..."
  VITE_P3FO_FORCE_BROWSER="true" VITE_BASE_URL="/p3fo" pnpm run dev

tests:
  pnpm test --run

# --- Code Quality Checks ---
check:
  @echo "Running TypeScript type check..."
  npx tsc -b --noEmit
  @echo "Running mcp-server TypeScript type check..."
  pnpm exec tsc -p mcp-server/tsconfig.json --noEmit
  @echo "Running ESLint..."
  npx eslint --max-warnings 0
  just check-node-versions

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
  @echo "Using version: {{version}}"
  set -e
  echo "Creating tar files for deployment..."
  mkdir -p ~/Dev/itpark/infrastructure-as-code/ansible/dist/

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
    echo "Saving p3fo docker image to tar file..."
    docker save -o ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar "{{DOCKER_IMAGE_NAME}}":"{{version}}"
    echo "Tar file created successfully: ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar"
  else
    echo "p3fo docker image has not changed"
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
