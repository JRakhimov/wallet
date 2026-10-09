# Builds any mini app frontend: docker build --build-arg APP=web -f docker/mini-app.Dockerfile .
FROM node:22-alpine AS builder

ARG APP
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/${APP} ./apps/${APP}

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npx vite build --config apps/${APP}/vite.config.ts

FROM nginx:alpine

ARG APP
COPY docker/mini-app.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/${APP}/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
