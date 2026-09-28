# Stage 1: Build Frontend Assets
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve via Alpine container with static files volume
FROM alpine:latest
WORKDIR /var/www/frontend
COPY --from=build /app/dist ./dist

CMD ["tail", "-f", "/dev/null"]
