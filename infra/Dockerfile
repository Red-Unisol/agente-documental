# Imagen del agente: compila en una etapa y corre sólo con las dependencias de producción.
# No lleva secretos ni datos: el .env, el archivo de tokens de Bitrix y las conversaciones van por fuera (ver docs/despliegue.md).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# El panel muestra las corridas de evals guardadas en el repo.
COPY evals/corridas ./evals/corridas
RUN mkdir -p /datos && chown node:node /datos
USER node
EXPOSE 3000
CMD ["node", "dist/cli/bitrix.js", "servir"]
