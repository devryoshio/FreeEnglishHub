FROM node:22-alpine
WORKDIR /app
COPY package*.json ./

RUN npm install react-youtube
COPY . .
CMD ["npm","run","dev","--","--host","0.0.0.0"]
