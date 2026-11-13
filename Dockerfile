FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html style.css ./
COPY src ./src
COPY shared ./shared
COPY public ./public
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
