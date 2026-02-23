# Production image: serve static files with Nginx
FROM nginx:alpine

# Copy pre-built static files
COPY dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
    