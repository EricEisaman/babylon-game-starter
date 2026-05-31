FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Install language-specific build/runtime deps only when routes/services require them.
RUN set -eux; \
		eval "$(node src/deployment/scripts/runtime-install-plan.mjs)"; \
		if [ "$NEED_GO" = "1" ]; then \
			apk add --no-cache go; \
		fi; \
		if [ "$NEED_RUST" = "1" ]; then \
			apk add --no-cache rust cargo; \
		fi; \
		if [ "$NEED_PYTHON" = "1" ]; then \
			apk add --no-cache python3 py3-pip; \
			for framework in $PYTHON_FRAMEWORKS; do \
				case "$framework" in \
					flask) pip3 install --break-system-packages flask ;; \
					falcon) pip3 install --break-system-packages falcon ;; \
					bottle) pip3 install --break-system-packages bottle ;; \
				esac; \
			done; \
		fi

RUN npm run deploy:prepare && npm run build

# Static Go binary for multiplayer (listens on :5000; nginx proxies /api/multiplayer/ here).
FROM golang:1.24-alpine AS go-builder
WORKDIR /build
COPY src/server/multiplayer/go.mod src/server/multiplayer/go.sum ./
COPY src/server/multiplayer/*.go ./
RUN CGO_ENABLED=0 go build -o /multiplayer-server .

FROM nginx:alpine

RUN apk add --no-cache gettext && mkdir -p /etc/nginx/snippets

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

COPY --from=go-builder /multiplayer-server /usr/local/bin/multiplayer-server

# Copy nginx config and chat proxy artifacts (from deploy:prepare in builder)
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/deploy/chat-proxy.env.defaults /etc/nginx/chat-proxy.env.defaults
COPY --from=builder /app/src/deployment/templates/nginx.chat-proxy.conf.template /etc/nginx/templates/chat-proxy.conf.template

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh /usr/local/bin/multiplayer-server

# Render web services commonly use 10000 on free plan (nginx listens here; Go uses 5000).
ENV PORT=10000
EXPOSE 10000

ENTRYPOINT ["/docker-entrypoint.sh"]