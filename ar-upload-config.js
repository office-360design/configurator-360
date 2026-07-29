/*
 * Public frontend configuration.
 *
 * After deploying cloudflare-worker/, replace the workers.dev placeholder below
 * with the URL returned by `npx wrangler deploy`, keeping `/api/models`.
 * No Cloudflare secret or R2 credential belongs in this file.
 */
window.AR_UPLOAD_CONFIG = Object.freeze({
    endpoint: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? '/api/models'
        : 'https://REPLACE-WITH-YOUR-WORKER.workers.dev/api/models',
    maxBytes: 25 * 1024 * 1024
});
