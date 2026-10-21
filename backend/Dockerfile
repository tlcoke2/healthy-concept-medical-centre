FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs assistant.mjs news.mjs ./
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/data/hcmc.sqlite
EXPOSE 8080
CMD ["node", "server.mjs"]
