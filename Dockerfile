FROM node:10-alpine

RUN apk update && \
    apk upgrade && \
    apk add --no-cache

RUN npm install -g firebase-tools

WORKDIR /app
