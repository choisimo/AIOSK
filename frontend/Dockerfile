FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_USE_MOCK_DATA=false
ARG VITE_APP_VERSION=docker
ARG VITE_ALLOW_LOCAL_API_URL=false
ARG VITE_KIOSK_STATUS_TOKEN

RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL is required for frontend image builds." >&2; exit 1); \
    if [ -n "$VITE_ALLOW_LOCAL_API_URL" ] && [ "$VITE_ALLOW_LOCAL_API_URL" != "true" ] && [ "$VITE_ALLOW_LOCAL_API_URL" != "false" ]; then \
      echo "VITE_ALLOW_LOCAL_API_URL must be true or false for frontend image builds." >&2; \
      exit 1; \
    fi; \
    if [ -n "$VITE_USE_MOCK_DATA" ] && [ "$VITE_USE_MOCK_DATA" != "true" ] && [ "$VITE_USE_MOCK_DATA" != "false" ]; then \
      echo "VITE_USE_MOCK_DATA must be true or false for frontend image builds." >&2; \
      exit 1; \
    fi; \
    if [ "$VITE_USE_MOCK_DATA" = "true" ]; then \
      echo "VITE_USE_MOCK_DATA must be false for frontend image builds." >&2; \
      exit 1; \
    fi; \
    vite_api_url_lower="$(printf '%s' "$VITE_API_URL" | tr '[:upper:]' '[:lower:]')"; \
    case "$vite_api_url_lower" in \
      http://localhost|https://localhost|http://localhost[:/]*|https://localhost[:/]*|http://127.0.0.1|https://127.0.0.1|http://127.0.0.1[:/]*|https://127.0.0.1[:/]*|http://0.0.0.0|https://0.0.0.0|http://0.0.0.0[:/]*|https://0.0.0.0[:/]*|http://\[::1\]|https://\[::1\]|http://\[::1\][:/]*|https://\[::1\][:/]*) \
        if [ "$VITE_ALLOW_LOCAL_API_URL" != "true" ]; then \
          echo "VITE_API_URL must not point to a local address for frontend image builds." >&2; \
          exit 1; \
        fi \
        ;; \
    esac

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_MOCK_DATA=$VITE_USE_MOCK_DATA
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_ALLOW_LOCAL_API_URL=$VITE_ALLOW_LOCAL_API_URL
ENV VITE_KIOSK_STATUS_TOKEN=$VITE_KIOSK_STATUS_TOKEN

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
