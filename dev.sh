#!/bin/bash
docker network create crowi_network
docker run -p 27016:27017 --name mongodb --restart=unless-stopped -v `pwd`/data/mongodb:/data/db --net="crowi_network" -d mongo:3.6.13
docker-compose -f docker-compose.windows.development.yml up
docker-compose -f docker-compose.windows.development.yml down
docker stop mongodb
docker rm mongodb
docker network rm crowi_network