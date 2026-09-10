#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
: "${NODE_IMAGE:?Set node:22.22.3-bookworm-slim@sha256:<verified digest>}"
: "${NGINX_IMAGE:?Set nginx:stable-alpine@sha256:<verified digest>}"
[[ "$NODE_IMAGE" == *@sha256:* && "$NGINX_IMAGE" == *@sha256:* ]] || { echo 'Base images must be digest-pinned' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit and review source first; dirty builds are rejected' >&2; exit 1; }
revision=$(git rev-parse HEAD)
output=${1:?Provide absolute output directory outside repository}
[[ "$output" == /* && ! -e "$output" ]] || { echo 'Output must be a new absolute directory' >&2; exit 1; }
mkdir -p "$output"
docker buildx build --platform linux/amd64 --load --build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "SOURCE_REVISION=$revision" -f deploy/highnoon-beta/Dockerfile -t "highnoon-app:$revision" .
docker buildx build --platform linux/amd64 --load --build-arg "NGINX_IMAGE=$NGINX_IMAGE" --build-arg "SOURCE_REVISION=$revision" -f deploy/highnoon-beta/Dockerfile.origin -t "highnoon-origin:$revision" .
app=$(docker image inspect --format '{{.Id}}' "highnoon-app:$revision")
origin=$(docker image inspect --format '{{.Id}}' "highnoon-origin:$revision")
docker image inspect "$app" "$origin" > "$output/images.json"
printf 'HIGHNOON_APP_IMAGE=%s\nHIGHNOON_ORIGIN_IMAGE=%s\n' "$app" "$origin" > "$output/images.env"
printf '%s\n' "$revision" > "$output/SOURCE_REVISION"
printf '%s\n%s\n' "$NODE_IMAGE" "$NGINX_IMAGE" > "$output/BASE_IMAGES"
docker save -o "$output/images.tar" "$app" "$origin"
cp -R deploy/highnoon-beta "$output/deployment"
(cd "$output" && shasum -a 256 images.tar images.json images.env SOURCE_REVISION BASE_IMAGES > SHA256SUMS)
echo "Built candidate at $output; native amd64 acceptance still required."
