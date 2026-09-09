# syntax=docker/dockerfile:1

# ---- Backend: Express 5 API ----
FROM node:22-alpine AS deps
WORKDIR /app
# Only copy manifests first so `npm ci` is cached until deps actually change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as the built-in non-root "node" user, not root.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
# The DDL travels with the image, not just with the repo. Two reasons: a locked-down campus
# server can then apply the schema with `docker compose run --rm backend npm run pg:schema`
# and never needs Node installed on the host; and the schema can no longer be applied from a
# different commit than the code that will query it, because they ship as one artifact.
COPY --chown=node:node db ./db

USER node
EXPOSE 5000

# Lightweight healthcheck hitting the existing /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
