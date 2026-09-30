FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && cp package-lock.json node_modules/.package-lock.sha

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY . .

EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
