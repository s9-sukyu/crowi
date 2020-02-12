FROM node:12.14.1-buster-slim as builder

ARG NODE_ENV="production"

ENV CROWI_VERSION v1.7.9
ENV NODE_ENV ${NODE_ENV}

WORKDIR /crowi

ADD . /crowi
RUN npm install --update npm@5 -g
RUN npm install --unsafe-perm

CMD npm run start
