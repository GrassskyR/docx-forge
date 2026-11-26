#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 && [[ -d "$HOME/.nvm/versions/node" ]]; then
  latest_node="$(ls -1 "$HOME/.nvm/versions/node" | tail -n 1)"
  if [[ -n "$latest_node" ]]; then
    export PATH="$HOME/.nvm/versions/node/$latest_node/bin:$PATH"
  fi
fi

for bin in node soffice pdftoppm pdftohtml pdfinfo; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "缺少运行依赖: $bin（需要 Node 22+、LibreOffice 与 Poppler 工具链）" >&2
    exit 1
  fi
done

if [[ ! -d node_modules ]]; then
  echo "缺少依赖，请先执行: npm install && npm run build" >&2
  exit 1
fi

if [[ ! -f packages/web/dist/index.html ]]; then
  echo "未检测到前端构建产物 packages/web/dist/index.html，正在执行构建..."
  npm run build
fi

PORT="${PORT:-${ENGINE_PORT:-8000}}"

node --input-type=module - "$PORT" <<'JS'
import net from "node:net";
const port = Number(process.argv[2]);
const srv = net.createServer();
srv.once("error", () => {
  console.error(`端口 ${port} 已被占用。请改用 PORT=18000 ./start.sh（或 ENGINE_PORT=18000 ./start.sh）。`);
  process.exit(1);
});
srv.listen(port, "127.0.0.1", () => srv.close());
JS

mkdir -p data/logs data/template_assets
server_pid=""
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$server_pid" ]] || kill "$server_pid" 2>/dev/null || true
  [[ -z "$server_pid" ]] || wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PORT="$PORT" node --import ./node_modules/tsx/dist/loader.mjs ./packages/server/src/main.ts &
server_pid=$!

for _ in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:$PORT/health" >/dev/null && \
     curl --silent --fail "http://127.0.0.1:$PORT/" >/dev/null; then
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat data/logs/server.log >&2
    exit 1
  fi
  sleep 0.25
done

curl --silent --fail "http://127.0.0.1:$PORT/health" >/dev/null
curl --silent --fail "http://127.0.0.1:$PORT/" >/dev/null
echo "DocForge V3 单进程工作台: http://localhost:$PORT （Ctrl+C 停止服务）"
wait "$server_pid"
