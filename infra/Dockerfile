# Build en dos etapas, mismo patrón que web/solicitudes-web/celesol-backend.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
# Aplica migraciones pendientes y arranca. El worker corre en el mismo proceso.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
