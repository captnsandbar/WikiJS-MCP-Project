# Wiki.js MCP Server

An MCP (Model Context Protocol) server that bridges Claude/AI clients to a [Wiki.js](https://js.wiki/) instance via OAuth. Talks to Wiki.js over its GraphQL API, authenticates AI clients with OAuth 2.0 (PKCE + DCR), runs on Node.js 24 with the built-in SQLite driver, and ships as a Docker container.

Built to mirror the [BookStack MCP Project](../Claude%20MCP%20Project) — same auth flow (single master password, no username), same deployment shape, same project layout.

## What Claude can do

| Tool | Action |
|---|---|
| `search_pages` | Full-text search across pages |
| `list_pages` | Browse pages by tag/locale/author |
| `get_page` | Fetch a page's content (by ID or path+locale) |
| `list_page_tags` | List every tag in the wiki |
| `get_page_history` | Fetch revision history |
| `create_page` | Create a new page |
| `update_page` | Update fields on an existing page |
| `delete_page` | Delete a page (destructive — host will confirm) |
| `render_page` | Re-render a page's cached HTML |
| `list_assets` / `list_asset_folders` | Walk uploaded files |
| `list_users` / `search_users` / `get_user` | User lookups |
| `get_system_info` | Wiki.js version + host info |

## Architecture

```
┌────────────┐  HTTPS + Bearer JWT     ┌─────────────────┐  GraphQL + API key  ┌─────────┐
│  Claude    │ ──────────────────────► │ Wiki.js MCP svr │ ──────────────────► │ Wiki.js │
└────────────┘                         │  (this project) │                     └─────────┘
                                       └─────────────────┘
                                                ▲
                                         OAuth 2.0 PKCE
                                       (CIMD + DCR support
                                        via SDK helpers)
                                                │
                                       Consent page at /oauth/consent
                                       (single OAUTH_PW password)
```

- TLS terminates at your reverse proxy (Caddy, nginx, Traefik, Cloudflared, etc.). This container speaks plain HTTP on port 3000, bound to `127.0.0.1` so only the proxy on the same host can reach it.
- The MCP server is its own OAuth Authorization Server. AI clients self-register via Dynamic Client Registration, redirect the user to `/oauth/consent`, and the user types `OAUTH_PW` to authorize. Single-user mode — there's no username.
- Issued access/refresh tokens are signed JWTs (HS256). The refresh-token `jti` is tracked in SQLite so rotation and revocation are enforceable.
- Once authenticated, the server uses its own `WIKIJS_API_KEY` to call the Wiki.js GraphQL API. The Wiki.js key is **never** forwarded to the client (per the MCP spec).
- OAuth state — registered clients, codes, refresh-token IDs, pending consents — lives in the built-in `node:sqlite` database at `/app/data/wikijs-mcp.sqlite` (mounted as a Docker volume).

## Setup

### 1. Create a Wiki.js API key

In Wiki.js: **Administration → API Access → New API Key**. Give it the permissions you want Claude to have (read+write on Pages at minimum). Copy the JWT.

> Don't enable the "Full Access" preset unless you trust Claude with admin-level access. Pages-only is a sane starting point.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

- `WIKIJS_URL` — base URL of your Wiki.js instance (no trailing slash).
- `WIKIJS_API_KEY` — the JWT from step 1.
- `JWT_SECRET` — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- `OAUTH_PW` — the password a user types on the consent screen to authorize Claude.
- `PUBLIC_URL` — the HTTPS URL your proxy serves this on (must match what you tell Claude).

### 3. Wire up your reverse proxy

The compose file binds the container's port to `127.0.0.1:3000`, so your reverse proxy on the same host can forward HTTPS to it. Examples:

**Caddy:**
```
wikijs-mcp.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx:**
```
server {
    listen 443 ssl;
    server_name wikijs-mcp.example.com;
    # ... ssl_certificate / ssl_certificate_key ...
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik / Cloudflared / NPM:** point at `http://127.0.0.1:3000` and let them handle the cert.

### 4. Build and run

```bash
docker compose up -d --build
docker compose logs -f wikijs-mcp
```

You should see:

```
[wikijs-mcp] listening on http://0.0.0.0:3000
[wikijs-mcp] public URL: https://wikijs-mcp.example.com
[wikijs-mcp] MCP endpoint: https://wikijs-mcp.example.com/mcp
```

Health check:

```bash
curl https://wikijs-mcp.example.com/healthz
# {"status":"ok","service":"wikijs-mcp","public_url":"..."}
```

OAuth metadata:

```bash
curl https://wikijs-mcp.example.com/.well-known/oauth-authorization-server
```

## Connecting Claude

### Claude Desktop / Claude.ai

**Settings → Connectors → Add custom connector**:
- **Name**: Wiki.js
- **URL**: `https://wikijs-mcp.example.com/mcp`

Claude discovers the OAuth metadata, registers itself via DCR, opens the consent page in your browser, you type your `OAUTH_PW`, done.

### Claude Code

```bash
claude mcp add --transport http wikijs https://wikijs-mcp.example.com/mcp --scope user
```

The first tool call triggers the OAuth flow.

## Development

```bash
npm install
cp .env.example .env  # fill in values; set PUBLIC_URL=http://localhost:3000 for local
npm run dev
```

Then point [MCP Inspector](https://github.com/modelcontextprotocol/inspector) at `http://localhost:3000/mcp`:

```bash
npx @modelcontextprotocol/inspector
```

## Project layout

```
src/
├── server.ts            # Express + MCP transport wiring
├── config.ts            # Env-var loading
├── db.ts                # node:sqlite schema + expiry sweeper
├── wikijs.ts            # Thin fetch-based GraphQL client
├── tools.ts             # All MCP tools (search/list/get/create/update/delete/...)
└── auth/
    ├── jwt.ts           # HS256 access + refresh token signing
    ├── clientStore.ts   # DCR-backed OAuthRegisteredClientsStore
    ├── provider.ts      # OAuthServerProvider for mcpAuthRouter
    └── consent.ts       # Password consent page + auth-code issuance
```

## Security notes

- Bearer tokens are JWT (HS256) with the `aud` claim bound to `${PUBLIC_URL}/mcp` (RFC 8707 audience binding). Tokens minted for another MCP server won't be honored here.
- Refresh tokens rotate on every exchange — the old `jti` is marked revoked.
- Revocations land in a small `oauth_access_revocations` table, swept hourly when entries expire naturally.
- The consent screen uses a single shared `OAUTH_PW` (timing-safe compare). Replace `src/auth/consent.ts` with a real IdP for multi-user production setups.
- The container does **not** terminate TLS. Put it behind a proxy that does and bind only to loopback (the compose file does this).
- The Wiki.js API key is held by the server only, never forwarded to the AI client. Per MCP spec, upstream token passthrough is forbidden — this server does it right.

## Updating Wiki.js GraphQL queries

When Wiki.js adds fields or you want to expose more of the API, the canonical reference is:

- Wiki.js dev docs: https://docs.requarks.io/dev/api
- The live schema at `${WIKIJS_URL}/graphql` (introspectable from any GraphQL IDE).

Edit the GraphQL string constants at the top of `src/tools.ts` and add or modify the corresponding `server.registerTool(...)` call.
