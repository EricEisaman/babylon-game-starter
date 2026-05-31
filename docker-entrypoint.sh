#!/bin/sh
set -e

# Render chat proxy config from template. Defaults from deploy/chat-proxy.env.defaults;
# override upstream at runtime with CHAT_UPSTREAM_URL (https origin only).
if [ -f /etc/nginx/chat-proxy.env.defaults ]; then
  _saved_upstream="${CHAT_UPSTREAM_URL:-}"
  _saved_prefix="${CHAT_PROXY_PREFIX:-}"
  _saved_host="${CHAT_PROXY_HOST:-}"
  set -a
  # shellcheck disable=SC1091
  . /etc/nginx/chat-proxy.env.defaults
  set +a
  if [ -n "$_saved_upstream" ]; then
    export CHAT_UPSTREAM_URL="$_saved_upstream"
  fi
  if [ -n "$_saved_prefix" ]; then
    export CHAT_PROXY_PREFIX="$_saved_prefix"
  fi
  if [ -n "$_saved_host" ]; then
    export CHAT_PROXY_HOST="$_saved_host"
  fi
fi

export CHAT_UPSTREAM_URL="${CHAT_UPSTREAM_URL:?CHAT_UPSTREAM_URL is required}"
export CHAT_PROXY_PREFIX="${CHAT_PROXY_PREFIX:?CHAT_PROXY_PREFIX is required}"
export CHAT_PROXY_HOST="${CHAT_PROXY_HOST:?CHAT_PROXY_HOST is required}"

envsubst '${CHAT_UPSTREAM_URL} ${CHAT_PROXY_PREFIX} ${CHAT_PROXY_HOST}' \
  < /etc/nginx/templates/chat-proxy.conf.template \
  > /etc/nginx/conf.d/chat-proxy.conf

# Go multiplayer binds :5000; nginx proxies /api/multiplayer/ there.
PORT=5000 /usr/local/bin/multiplayer-server &
exec nginx -g "daemon off;"
