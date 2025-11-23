# shellcheck disable=SC2148
# shellcheck disable=SC1089
set dotenv-filename := ".env.local" # Look for .env.local in the project root
set dotenv-load := true

# Variables for the p3fo project
PROJECT_NAME := "p3fo"
DOCKER_IMAGE_NAME := "git.at-it.ch/advance-ticket/p3fo"
PORT := "3000"

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
  npm run dev

  @echo "[2/2] Starting development server (separate terminal)..."
  npm run dev:server

# --- Docker Build Task ---
docker-build:
  @echo "Building docker images for {{PROJECT_NAME}} stack..."
  docker compose build

# --- Docker Save Task ---
docker-save:
  #!/usr/bin/env bash
  set -e
  echo "Creating tar files for deployment..."
  mkdir -p ~/Dev/itpark/infrastructure-as-code/ansible/dist/
  echo "Building images with explicit tags..."
  # Build both services with explicit tags that match the ansible expectations
  docker build -t p3fo:latest .
  echo "Saving p3fo image to tar file..."
  docker save -o ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar p3fo:latest
  echo "Tar file created successfully: ~/Dev/itpark/infrastructure-as-code/ansible/dist/p3fo.tar"

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
prod-push: _check-BW_SESSION
  @echo "Pushing {{PROJECT_NAME}} to production..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t push -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202

prod-load: _check-BW_SESSION
  @echo "Loading {{PROJECT_NAME}} on production..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t load -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202

prod-restart: _check-BW_SESSION
  @echo "Restarting {{PROJECT_NAME}} on production..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t restart -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202

prod-stop: _check-BW_SESSION
  @echo "Stopping {{PROJECT_NAME}} on production..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t stop -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202

prod-status: _check-BW_SESSION
  @echo "Checking {{PROJECT_NAME}} status on production..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -t status -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202

# --- Full Deploy Task ---
deploy: _check-BW_SESSION docker-build
  @echo "Full deployment of {{PROJECT_NAME}}..."
  ansible-playbook -i ~/Dev/itpark/infrastructure-as-code/ansible/inventory ~/Dev/itpark/infrastructure-as-code/ansible/playbook-deploy-docker.yml -e "docker_project_to_deploy={{PROJECT_NAME}}" --limit adt-vmg-202
  just finish

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
  pnpm build
  npx tsc --project tsconfig.server.json

install:
  @echo "Installing dependencies..."
  pnpm install

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
