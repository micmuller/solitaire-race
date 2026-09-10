ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY vnext/web-pixi/package.json vnext/web-pixi/package-lock.json ./vnext/web-pixi/
RUN npm --prefix vnext/web-pixi ci
COPY vnext ./vnext
RUN npm run build:web-pixi

FROM ${NODE_IMAGE} AS app
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=${SOURCE_REVISION}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3011 VNEXT_PROFILE_DATABASE=/data/highnoon.sqlite
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/vnext/core ./vnext/core
COPY --from=build /app/vnext/server ./vnext/server
COPY --from=build /app/vnext/bot ./vnext/bot
COPY --from=build /app/vnext/client ./vnext/client
COPY --from=build /app/vnext/web ./vnext/web
COPY --from=build /app/vnext/web-pixi/dist ./vnext/web-pixi/dist
COPY deploy/highnoon-beta/backup.cjs ./deploy/highnoon-beta/backup.cjs
USER 1000:1000
EXPOSE 3011
CMD ["node", "vnext/server/cli.js"]
