# syntax=docker/dockerfile:1

# --- Dependencies stage -----------------------------------------------------
# Debian (glibc) so better-sqlite3 can use its prebuilt binary — no compiler
# toolchain needed in the image.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime stage ----------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/courses.db
WORKDIR /app

# Bring in installed dependencies, then the application source
# (node_modules and other noise are excluded via .dockerignore).
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The SQLite database lives on a writable volume owned by the non-root user.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

# Probe the /health endpoint using Node's global fetch (no curl in the image).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
