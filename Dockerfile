FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY scripts/create-admin.js \
  scripts/db-apply-schema.sh \
  scripts/db-backup.sh \
  scripts/db-migrate.js \
  scripts/db-restore-drill.sh \
  scripts/db-restore.sh \
  ./scripts/
COPY database ./database
COPY database_schema.sql ./database_schema.sql

RUN node -e "\
const fs = require('fs'); \
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
const runtimeScripts = ['start', 'admin:create', 'db:backup', 'db:restore', 'db:restore:drill', 'db:apply-schema', 'db:migrate', 'db:migrate:status', 'db:rollback']; \
const missing = runtimeScripts.filter((name) => !pkg.scripts[name]); \
if (missing.length > 0) throw new Error('Missing runtime npm scripts: ' + missing.join(', ')); \
pkg.scripts = Object.fromEntries(runtimeScripts.map((name) => [name, pkg.scripts[name]])); \
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n'); \
"

RUN mkdir -p logs uploads/menus && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/readyz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
