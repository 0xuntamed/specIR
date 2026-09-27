import type { Spec } from "../../ir/types";
import { MARKER } from "../names";

const HASH_HEADER = `# ${MARKER} — do not edit`;

export function dockerfile(): string {
  return `${HASH_HEADER}
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
CMD ["node", "dist/server.js"]
`;
}

// Only web is published. It serves the frontend and proxies /api to the api
// service, so the API and Postgres stay on the compose network.
export function dockerCompose(spec: Spec): string {
  return `${HASH_HEADER}
name: ${spec.app.name}

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $\${POSTGRES_USER} -d $\${POSTGRES_DB}"]
      interval: 2s
      timeout: 5s
      retries: 30
    restart: unless-stopped

  api:
    build: ./api
    env_file: .env
    environment:
      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@db:5432/\${POSTGRES_DB}
      PORT: "3000"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: web/Dockerfile
    ports:
      - "\${WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  db-data:
`;
}

export function envExample(spec: Spec): string {
  const lines = [
    HASH_HEADER,
    "# Copy to .env and fill in. docker-compose builds DATABASE_URL from the POSTGRES_* values.",
    "POSTGRES_USER=app",
    "POSTGRES_PASSWORD=change-me",
    `POSTGRES_DB=${spec.app.name.replaceAll("-", "_")}`,
    "# The app is served at http://localhost:$WEB_PORT, with the API under /api.",
    "WEB_PORT=8080",
  ];
  if (spec.auth) lines.push("# At least 32 random characters, e.g. `openssl rand -hex 32`.", "JWT_SECRET=");
  if (spec.integrations.some((i) => i.kind === "email")) lines.push("RESEND_API_KEY=", "EMAIL_FROM=");
  return `${lines.join("\n")}\n`;
}

export function ignoreFile(entries: string[]): string {
  return `${HASH_HEADER}\n${entries.join("\n")}\n`;
}
