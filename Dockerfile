# Stage 1: Build the application
FROM node:26-slim AS build

ARG VITE_BASE_URL=/
ENV VITE_BASE_URL=$VITE_BASE_URL

WORKDIR /app

# Install necessary build tools
RUN apt-get update && apt-get install -y build-essential

# Install pnpm directly (corepack was removed in Node 26)
RUN npm install -g pnpm@11.5.3

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the Vite app and compile the server
RUN pnpm run build && \
    pnpm exec tsc --project tsconfig.server.json

# Stage 2: Create data directory (distroless has no shell)
FROM node:26-slim AS prep
RUN mkdir -p /home/nonroot/data && chown -R 65534:65534 /home/nonroot

# Stage 3: Create the runtime image
FROM gcr.io/distroless/nodejs26-debian13:nonroot

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173
ENV VITE_BASE_URL=/

COPY --chown=nonroot:nonroot --from=build /app/dist ./dist
COPY --chown=nonroot:nonroot --from=build /app/node_modules ./node_modules
COPY --chown=nonroot:nonroot --from=build /app/package*.json ./
COPY --chown=nonroot:nonroot --from=prep /home/nonroot /home/nonroot

USER nonroot:nonroot

EXPOSE 5173

CMD ["dist/server/server/index.js"]