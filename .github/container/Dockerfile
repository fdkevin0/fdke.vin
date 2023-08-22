FROM node:alpine AS builder
WORKDIR /app

RUN npm i -g pnpm
COPY package.json ./
RUN pnpm i

COPY . .
RUN pnpm build \
  # remove source maps - people like small image
  && rm dist/*.map || true

FROM ghcr.io/static-web-server/static-web-server:latest
COPY --from=builder /app/dist /public