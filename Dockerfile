# Stage 1: Build Expo Web Application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy all source files
COPY . .

# Generate Prisma Client & Build static web export
RUN npx prisma generate
RUN npx expo export --platform web --output-dir dist

# Stage 2: Production Web Server with Nginx
FROM nginx:alpine AS runner

# Copy built assets to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx configuration for Single Page Application (SPA) routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    error_page 500 502 503 504 /50x.html; \
    location = /50x.html { \
        root /usr/share/nginx/html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
