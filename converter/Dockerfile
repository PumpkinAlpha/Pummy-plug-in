FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-impress fonts-dejavu-core fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY lib ./lib
COPY worker/presentation-converter.js ./worker/presentation-converter.js
COPY scripts/presentation-converter.mjs scripts/converter-server.mjs ./scripts/
ENV NODE_ENV=production PUMMY_CONVERTER_HOST=0.0.0.0 PUMMY_CONVERTER_PORT=8080 PUMMY_SOFFICE=/usr/bin/soffice
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/health',{headers:{Authorization:'Bearer '+process.env.PRESENTATION_CONVERTER_TOKEN}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/converter-server.mjs"]
