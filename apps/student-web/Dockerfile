FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tooling/vite-encode-fs.ts tooling/vite-encode-fs.ts
COPY packages packages
COPY apps/student-web apps/student-web
COPY apps/teacher-web apps/teacher-web
RUN pnpm install --frozen-lockfile --filter @sys112/student-web...
RUN pnpm --filter @sys112/student-web exec vite build

FROM nginx:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/student-web/dist /usr/share/nginx/html
EXPOSE 5173
