# Stage 1: Build the application
FROM node:24-slim AS build

WORKDIR /app

# Install necessary build tools
RUN apt-get update && apt-get install -y build-essential

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies based on the lockfile
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && \
      pnpm install --frozen-lockfile && \
      echo "Dependencies installed with pnpm"; \
    else \
      npm install && \
      echo "Dependencies installed with npm"; \
    fi

# Copy the rest of the application
COPY . .

# Build the Vite app and compile the server
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build && \
      pnpm exec tsc --project tsconfig.server.json && \
      echo "Build completed with pnpm"; \
    else \
      npm run build && \
      npx tsc --project tsconfig.server.json && \
      echo "Build completed with npm"; \
    fi

# Stage 2: Create the runtime image
FROM node:24-slim

WORKDIR /app

# Install necessary runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils bash curl unzip \
    coreutils bash curl unzip \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Create a non-root user to run the container
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser

# Set Node environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Copy the built files with correct ownership
COPY --chown=appuser:appuser --from=build /app/dist ./dist
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser --from=build /app/package*.json ./

# Copy startup script
COPY --chown=appuser:appuser docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create and prepare directories with proper permissions
RUN mkdir -p /home/appuser/data && \
    chown -R appuser:appuser /home/appuser

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Set the entrypoint
ENTRYPOINT ["/app/start.sh"]
