FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854 AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN corepack enable && pnpm install --frozen-lockfile

COPY client client
COPY server server
RUN pnpm run build \
  && pnpm --filter beebaby-server deploy --prod --legacy /runtime

FROM node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854

ARG VCS_REF
ARG BUILD_DATE
LABEL org.opencontainers.image.source="https://github.com/breeze4/tmux-ws-server" \
  org.opencontainers.image.revision="${VCS_REF}" \
  org.opencontainers.image.created="${BUILD_DATE}"

RUN apt-get update \
  && apt-get install --yes --no-install-recommends tmux \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/tmux \
  && chown node:node /run/tmux

WORKDIR /app
COPY --from=build --chown=node:node /runtime ./

ENV NODE_ENV=production \
  PORT=8080 \
  TMUX_SOCKET=/run/tmux/default

USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
