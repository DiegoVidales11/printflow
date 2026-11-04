# ---------- etapa 1: compilación ----------
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npx tsc -p tsconfig.build.json && npm prune --omit=dev

# ---------- etapa 2: ejecución ----------
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# Usuario sin privilegios (ya existe en la imagen oficial de Node)
USER node
EXPOSE 3000
# La misma imagen sirve para: API (por defecto), worker (node dist/worker.js),
# migraciones (npx prisma migrate deploy) y semilla (node dist/seed.js).
CMD ["node", "dist/main.js"]
