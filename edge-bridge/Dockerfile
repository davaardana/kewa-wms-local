FROM node:20.18.0-alpine3.20

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 2078

CMD ["node", "src/index.js"]
