FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

RUN npm run prisma:generate:postgres && npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate:postgres && npm run start"]

