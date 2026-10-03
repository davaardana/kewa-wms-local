# Stage 1: Build Frontend Assets
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Keep the artifact available for the development bind mount.
FROM alpine:3.20
WORKDIR /var/www/frontend
COPY --from=build /app/dist ./dist

CMD ["tail", "-f", "/dev/null"]
