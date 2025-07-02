FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN apk add --no-cache git ffmpeg && \
npm install --production

COPY . .

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm","run", "start"]