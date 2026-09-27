# @appspec:generated — do not edit
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/
RUN cd web && npm install
COPY contract contract
COPY web web
RUN cd web && npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
