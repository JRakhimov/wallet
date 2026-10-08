FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY apps/api ./apps/api

RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx tsc -p apps/api/tsconfig.json

EXPOSE 3011

CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
