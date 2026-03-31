FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js yoga-schedule.json ./
RUN mkdir -p /app/secrets /app/data && chown node:node /app/data
COPY wellness-architect-485214-800886c92a64.json /app/secrets/google-service-account.json

ENV NODE_ENV=production

USER node

CMD ["node", "index.js"]
