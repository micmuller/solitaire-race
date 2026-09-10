#!/usr/bin/env bash
# Isolated real-image test: no production volumes, published ports or edge network.
set -euo pipefail
app_image=${1:?Provide app image ID}
origin_image=${2:?Provide origin image ID}
network_id=
app_id=
origin_id=
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then
    [[ -z "$app_id" ]] || docker logs --tail 50 "$app_id" >&2 || true
    [[ -z "$origin_id" ]] || docker logs --tail 50 "$origin_id" >&2 || true
  fi
  [[ -z "$origin_id" ]] || docker rm -f "$origin_id" >/dev/null || true
  [[ -z "$app_id" ]] || docker rm -f "$app_id" >/dev/null || true
  [[ -z "$network_id" ]] || docker network rm "$network_id" >/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
common=(--platform linux/amd64 --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 128)
origin_args=(--user 101:101 --cpus 0.15 --memory 128m --memory-swap 128m --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=101,gid=101,mode=1770)
# This is the regression gate: original config fails here on fastcgi_temp.
docker run --rm --network none "${common[@]}" "${origin_args[@]}" "$origin_image" -t
network_id=$(docker network create --internal "highnoon-smoke-$$-$RANDOM")
app_id=$(docker run -d "${common[@]}" --network "$network_id" --network-alias app \
  --user 1000:1000 --cpus 0.85 --memory 896m --memory-swap 896m \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m,uid=1000,gid=1000,mode=1770 \
  --tmpfs /data:rw,noexec,nosuid,size=32m,uid=1000,gid=1000,mode=0770 \
  -e PUBLIC_URL=https://solitairehighnoon-test.stillorbit.net \
  -e NODE_OPTIONS=--max-old-space-size=640 "$app_image")
origin_id=$(docker run -d "${common[@]}" "${origin_args[@]}" --network "$network_id" --network-alias origin "$origin_image")
ready=false
for attempt in {1..30}; do
  if docker exec "$origin_id" wget -q -O /dev/null http://127.0.0.1:8080/health; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Origin did not become ready' >&2; exit 1; }
# Requests traverse the actual proxy to the real app and built frontend.
docker exec -i "$app_id" node <<'JS'
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
setTimeout(() => { console.error('Origin smoke exceeded 30s'); process.exit(1); }, 30000).unref();
(async () => {
  const base = 'http://origin:8080';
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const page = await fetch(`${base}/vnext/pixi/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/i);
  const config = await (await fetch(`${base}/vnext/config`)).json();
  assert.equal(config.publicBaseUrl, 'https://solitairehighnoon-test.stillorbit.net');
  const result = await fetch(`${base}/vnext/matches`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'ORIGIN-SMOKE', mode: 'split' })
  });
  assert.equal(result.status, 201);
  const { matchId } = await result.json();
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://origin:8080/vnext?matchId=${encodeURIComponent(matchId)}&clientId=p1`);
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket snapshot timeout')); }, 5000);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
    socket.once('message', data => {
      clearTimeout(timer);
      try { assert.equal(JSON.parse(data.toString()).kind, 'snapshot'); socket.close(); resolve(); }
      catch (error) { socket.terminate(); reject(error); }
    });
  });
  console.log('PASS: nonroot/read-only nginx -t, container start, HTTP/PWA/config and WebSocket snapshot');
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
