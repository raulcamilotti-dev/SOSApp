FROM nginx:alpine

COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
# This Dockerfile sets up an Nginx server to serve static files from the 'dist' directory.
# It copies the contents of the 'dist' directory into the Nginx HTML directory
# and uses a custom Nginx configuration file.
# The server listens on port 80 and runs in the foreground.
# The 'nginx.conf' file should be provided alongside this Dockerfile.
# Make sure to create an appropriate 'nginx.conf' file to configure Nginx as needed.

# Example nginx.conf content:
# server {
#     listen       80;
#     server_name  localhost;
#     location / {
#         root   /usr/share/nginx/html;
#         index  index.html index.htm;
#         try_files $uri $uri/ /index.html;
#     }
#     error_page   500 502 503 504  /50x.html;
#     location = /50x.html {
#         root   /usr/share/nginx/html; 
#     }
# }
    