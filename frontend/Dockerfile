FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy React app to /app subdirectory
COPY --from=build /app/dist /usr/share/nginx/html/app

# Remove landing.html from app build (it shouldn't be in /app/)
RUN rm -f /usr/share/nginx/html/app/landing.html

# Copy landing page to root as index.html
COPY --from=build /app/public/landing.html /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
