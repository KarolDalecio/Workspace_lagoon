# ---- build: front-end (Vite) + servidor (esbuild)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Prefixo público do app. Com o domínio em gprgai.top/workspace (Strip Path ligado),
# o navegador precisa pedir tudo com /workspace/; o servidor recebe sem o prefixo.
ARG BASE_PATH=/workspace/
ENV BASE_PATH=$BASE_PATH
RUN npm run build

# ---- runtime: só dependências de produção
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["node", "dist-server/index.js"]
