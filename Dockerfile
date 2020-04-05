FROM node:12.14.1-buster-slim as builder

ARG NODE_ENV="development"

ENV CROWI_VERSION v1.7.9
ENV NODE_ENV ${NODE_ENV}

RUN apt-get update && apt-get install -y git
WORKDIR /crowi

ADD . /crowi
RUN npm install --update npm@6 -g
RUN npm install --unsafe-perm

CMD npm run start
