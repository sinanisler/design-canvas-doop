# Deploying on Hostinger

Hostinger offers two very different products. Only one of them runs doop fully.

## Recommended: Hostinger VPS (Docker)

Everything works: realtime multiplayer, Postgres, frame screenshots.

1. Create a VPS with the Docker template (Ubuntu + Docker).
2. SSH in, then:

   ```bash
   git clone https://github.com/kgoedecke/doop.git && cd doop
   cp .env.example .env   # set BETTER_AUTH_SECRET and BETTER_AUTH_URL=https://your-domain
   docker compose up -d
   ```

3. Point your domain at the VPS and put a TLS proxy in front of port 4400 (Hostinger's
   Traefik/Caddy templates, or nginx). The proxy must forward WebSocket upgrades for `/ws`
   (nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

## Limited: Business / Cloud "Node.js web apps"

These plans can boot doop, but two platform limits apply:

- **No inbound WebSockets.** Hostinger allows only outgoing WebSocket connections on Web and
  Cloud plans. doop's realtime room (`/ws`: cursors, presence, live frame edits, agent
  streaming) will not connect, so the canvas loses its multiplayer and live-update features.
- **No PostgreSQL.** Web and Cloud plans offer MySQL only. Use an external Postgres (Neon,
  Supabase, ...) via `DATABASE_URL`. Don't rely on the PGlite fallback: `./data/pg` is not
  guaranteed to survive redeploys.
- Frame screenshots need Chromium, which isn't installed there; the rest of the app is unaffected.

If you still want this route, use these settings in hPanel -> Websites -> Add Node.js app:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| Application type  | Express (or Other)                       |
| Node.js version   | 22                                       |
| Root directory    | `/`                                      |
| Build script      | `build` (if offered; else server.mjs builds on first boot) |
| Output directory  | _(empty)_                                |
| Entry file        | `server.mjs`                             |
| Package manager   | npm                                      |

Environment variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your public
origin), plus any optional keys from `.env.example`. Health check: `GET /healthz`.

`server.mjs` exists because Hostinger only accepts a `.js`/`.mjs`/`.cjs` entry file; it loads the
TypeScript server through tsx, the same way `npm start` does.
