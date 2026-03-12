FROM node:20-alpine

WORKDIR /app

# Install build deps for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# data/ directory is mounted as volume — create it so it exists in image
RUN mkdir -p /app/data

CMD ["node", "src/bot.js"]
