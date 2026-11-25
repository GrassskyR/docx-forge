#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ENGINE_PORT="${ENGINE_PORT:-8000}"
AGENT_PORT=8787
if [[ ! -x .venv/bin/python || ! -d agent/node_modules ]]; then
  echo '请先按 README 安装 Python venv 和 npm 依赖。' >&2
  exit 1
fi
.venv/bin/python - "$ENGINE_PORT" "$AGENT_PORT" <<'PY'
import socket,sys
for port in map(int,sys.argv[1:]):
    with socket.socket() as s:
        try:s.bind(('127.0.0.1',port))
        except OSError:
            print(f'端口 {port} 已被占用。请停止对应服务；引擎可用 ENGINE_PORT=18000 ./start.sh。',file=sys.stderr)
            sys.exit(1)
PY
mkdir -p data/logs
engine_pid=''
agent_pid=''
cleanup(){
  trap - EXIT INT TERM
  [[ -z "$agent_pid" ]] || kill "$agent_pid" 2>/dev/null || true
  [[ -z "$engine_pid" ]] || kill "$engine_pid" 2>/dev/null || true
  [[ -z "$agent_pid" ]] || wait "$agent_pid" 2>/dev/null || true
  [[ -z "$engine_pid" ]] || wait "$engine_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
.venv/bin/python -m uvicorn engine.api:app --host 127.0.0.1 --port "$ENGINE_PORT" >data/logs/engine.log 2>&1 &
engine_pid=$!
for attempt in {1..40}; do
  if curl --silent --fail "http://127.0.0.1:$ENGINE_PORT/health" >/dev/null; then break; fi
  if ! kill -0 "$engine_pid" 2>/dev/null; then cat data/logs/engine.log >&2; exit 1; fi
  sleep 0.25
done
ENGINE_URL="http://127.0.0.1:$ENGINE_PORT" node --import ./agent/node_modules/tsx/dist/loader.mjs ./agent/src/server.ts >data/logs/agent.log 2>&1 &
agent_pid=$!
for attempt in {1..40}; do
  if curl --silent --fail http://127.0.0.1:8787/health >/dev/null; then break; fi
  if ! kill -0 "$agent_pid" 2>/dev/null; then cat data/logs/agent.log >&2; exit 1; fi
  sleep 0.25
done
curl --silent --fail "http://127.0.0.1:$ENGINE_PORT/health" >/dev/null
curl --silent --fail http://127.0.0.1:8787/health >/dev/null
echo "公文工作台: http://localhost:$ENGINE_PORT"
echo 'Pi-Agent: http://localhost:8787 · Ctrl+C 停止两个服务'
wait -n "$engine_pid" "$agent_pid"
