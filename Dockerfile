FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY db ./db
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
