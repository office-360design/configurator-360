# 360Configurator MCP plugin server

Internal MCP service for conversational creation and revision of the six public 360Configurator product types.

## Local development

```bash
npm install
npm test
npm run build
npm run start:stdio
```

Creation and revision use Firebase Admin Application Default Credentials for the `configurator-360` project. Read-only catalogue/spec tools start without credentials; Firestore is initialized lazily.

For the internal local plugin, set `MCP_USE_GCLOUD_CREDENTIALS=1` to reuse the active `gcloud auth login` account through short-lived access tokens and the Firestore REST API. Tokens are requested only when a Firestore tool runs and are never written or logged by this service. Cloud Run must leave this unset so Firebase Admin uses the workload service account and transactional public rate limits.

## HTTP deployment

The container exposes `POST /mcp` using stateless Streamable HTTP and `GET /health`. Deploy with the `configurator-runtime@configurator-360.iam.gserviceaccount.com` service account. Anonymous writes are constrained by Firestore-backed per-IP and global limits configured through `MCP_IP_HOURLY_LIMIT`, `MCP_IP_DAILY_LIMIT`, and `MCP_GLOBAL_DAILY_LIMIT`.

The service writes the existing `sharedConfigurations` record format. Normal configurator links remain `#s=<id>` and preview links add `?embed=preview`.
