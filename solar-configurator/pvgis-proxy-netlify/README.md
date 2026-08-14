# PVGIS proxy — Netlify Functions

The solar configurator is hosted as a static site, while JRC PVGIS 5.3 rejects browser-direct AJAX/CORS requests. This folder is a tiny, independent Netlify site whose only job is to relay the two read-only PVGIS calls used by the configurator.

No database and no runtime npm dependencies are required.

## Endpoint

After deployment the configurator should use:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/pvgis
```

The function supports only:

- `tool=PVcalc` — exact-location fixed-system monthly/annual PV yield.
- `tool=printhorizon` — terrain horizon profile.
- `tool=health` — simple proxy health check.

Unknown PVGIS parameters are discarded, latitude/longitude are validated, and only GET/OPTIONS requests are accepted.

## Deploy from the CLI

Netlify's current CLI requires Node.js 18.14 or newer.

```bash
npm install -g netlify-cli
cd solar-configurator/pvgis-proxy-netlify
netlify login
netlify deploy
```

On the first `netlify deploy`, the CLI prompts you to select an existing Netlify site or create a new one and links this folder to it. That first command creates a draft deploy. Once it looks correct, publish production:

```bash
netlify deploy --prod
```

If you already created the proxy site in the Netlify dashboard, `netlify link` can be used before the deploy instead.

### Remote SSH / WSL authentication

`netlify login` normally opens a browser. If the CLI is running inside WSL on a remote machine over SSH, it is usually easier to create a Netlify personal access token in **User settings → Applications → Personal access tokens** and export it in that shell:

```bash
export NETLIFY_AUTH_TOKEN='YOUR_TOKEN'
netlify deploy
```

Do not commit the token to this project.

You can also deploy the folder by connecting it as a Netlify project in the dashboard. Netlify's default Functions directory is `netlify/functions/`; the included `netlify.toml` makes this explicit.

## Test locally

```bash
cd solar-configurator/pvgis-proxy-netlify
netlify dev
```

Then open:

```text
http://localhost:8888/.netlify/functions/pvgis?tool=health
```

For local testing of the solar configurator, paste this function URL into its PVGIS proxy settings:

```text
http://localhost:8888/.netlify/functions/pvgis
```

## Restrict CORS in production

The function accepts any browser origin by default. Once the GitHub Pages URL is final, set the Netlify environment variable `ALLOWED_ORIGIN` to that exact origin, for example:

```bash
netlify env:set ALLOWED_ORIGIN https://YOUR-ACCOUNT.github.io
```

Multiple origins can be supplied as a comma-separated list if needed.

## Caching and retries

Successful `PVcalc` responses are cached at Netlify's CDN for one day and `printhorizon` responses for seven days. Browser caching is intentionally kept short. PVGIS HTTP 429/529 responses are retried briefly before an error is returned.

## Cloudflare alternative

The previous Cloudflare Worker implementation is still kept in `../pvgis-proxy/` as an optional alternative. It is no longer the recommended setup for this project.
