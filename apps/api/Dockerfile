FROM node:20-bookworm-slim
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared-types packages/shared-types
COPY infra/database/migrations infra/database/migrations
RUN pnpm install --frozen-lockfile --filter @sys112/api...
RUN pnpm --filter @sys112/shared-types build && pnpm --filter @sys112/api build
WORKDIR /repo/apps/api
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000
ENV MIGRATIONS_DIR=/repo/infra/database/migrations
EXPOSE 3000
CMD ["sh", "-c", "node dist/infrastructure/database/migrate.js && node dist/main.js"]
