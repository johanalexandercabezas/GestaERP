# ============================================================
# GestaERP — Dockerfile (Build + Runtime)
# ============================================================
# Etapa 1: Construcción del frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Etapa 2: Construcción del backend Rust
FROM rust:1.85-alpine AS backend-builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./
COPY src-tauri/src/ ./src/
COPY src-tauri/build.rs ./
COPY src-tauri/tauri.conf.json ./
COPY src-tauri/icons/ ./icons/
RUN cargo build --release

# Etapa 3: Imagen final (runtime)
FROM alpine:3.21
RUN apk add --no-cache ca-certificates libgcc libstdc++
WORKDIR /app
COPY --from=frontend-builder /app/dist ./dist
COPY --from=backend-builder /app/target/release/appsdesktop ./appsdesktop
COPY --from=backend-builder /app/target/release/generate_keys ./generate_keys

VOLUME ["/data"]
ENV GESTAERP_ENV=production
ENV GESTAERP_LOG_LEVEL=info
# GESTAERP_SECRET_KEY debe configurarse en docker-compose.yml o .env

EXPOSE 8080
CMD ["./appsdesktop"]