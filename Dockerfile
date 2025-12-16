FROM oven/bun:1-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN bun install

COPY . .

EXPOSE 5000
