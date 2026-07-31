# Supabase + Netlify automated AR publication

## Resulting workflow

```text
Netlify configurator in the laptop browser
        ↓
Optimized GLB generated and validated locally
        ↓
Small JSON request to a Netlify Function
        ↓
Netlify Function verifies the private upload access key
        ↓
Netlify Function creates a two-hour Supabase signed upload token
        ↓
Browser uploads the 7–15 MB GLB directly to Supabase using resumable TUS
        ↓
Supabase public GLB URL is verified
        ↓
QR is generated immediately
        ↓
Phone opens the GLB in Google Scene Viewer
```

The GLB bytes do **not** pass through Netlify Functions. Netlify only creates a small signed-upload ticket, so the Netlify binary request limit is irrelevant.

## Cost controls already built into the code

The Netlify Function refuses new uploads when any configured safety limit would be crossed:

- maximum single GLB: 15 MiB;
- maximum stored models: 90;
- maximum total model storage: 800 MiB;
- only `model/gltf-binary` files;
- storage path is the GLB SHA-256 hash, so identical models are reused instead of uploaded twice;
- an upload access key is required and is never stored in public source code.

The Supabase Free plan currently includes 1 GB file storage, 5 GB egress, 5 GB cached egress, and a 50 MB maximum file upload. Supabase states that Free-plan use is not charged; continued excess usage can instead lead to service restrictions. Keep the organization on **Free** and do not upgrade it if a strict zero-charge setup is required. The application also stops accepting uploads at 800 MiB or 90 models by default, before the included storage quota is reached.

## 1. Create the Supabase project

1. Create a Supabase account.
2. Choose **New project**.
3. Select your organization.
4. Enter a project name, for example `configurator-360-ar`.
5. Generate and save the database password. The application does not use it, but Supabase requires one.
6. Choose a nearby EU region.
7. Keep the project on **Free**.
8. Wait until project provisioning finishes.

## 2. Create the public Storage bucket

In the Supabase project:

1. Open **Storage**.
2. Select **New bucket**.
3. Bucket name:

   ```text
   window-ar-models
   ```

4. Enable **Public bucket**.
5. Set the file-size limit to:

   ```text
   15 MB
   ```

6. If the UI offers allowed MIME types, add:

   ```text
   model/gltf-binary
   ```

7. Create the bucket.

A public bucket only makes file downloads public. It does not automatically allow anonymous uploads. This implementation creates signed upload tokens on the trusted Netlify Function, so no anonymous Storage INSERT policy is required.

## 3. Obtain the two Supabase values

Open the Supabase project's **Connect** dialog or **Project Settings → API Keys**.

Copy:

1. **Project URL**, shaped like:

   ```text
   https://abcdefghijklmnop.supabase.co
   ```

2. **Secret key**, shaped like:

   ```text
   sb_secret_...
   ```

Use the new secret key where available. The older legacy `service_role` key also works through the fallback environment-variable name, but must never be placed in browser code or committed to Git.

## 4. Create a private AR upload access key

Generate a long random password. A PowerShell option is:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Save the resulting value in a password manager. You will enter it in the configurator once per browser tab when generating an AR model.

## 5. Add Netlify environment variables

In the existing Netlify project:

```text
Project configuration
→ Environment variables
→ Add a variable
```

Add these values with the **Functions** scope, or all scopes when the UI does not ask:

```text
SUPABASE_URL
https://YOUR_PROJECT_REF.supabase.co
```

```text
SUPABASE_SECRET_KEY
sb_secret_YOUR_REAL_SECRET_KEY
```

```text
SUPABASE_BUCKET
window-ar-models
```

```text
AR_UPLOAD_KEY
YOUR_LONG_RANDOM_ACCESS_KEY
```

```text
AR_ALLOWED_ORIGINS
https://brilliant-klepon-fbae3a.netlify.app
```

Add the safety limits:

```text
AR_MAX_FILE_BYTES
15728640
```

```text
AR_MAX_MODELS
90
```

```text
AR_MAX_TOTAL_BYTES
838860800
```

Do not add a trailing slash to `AR_ALLOWED_ORIGINS`.

Do not put `SUPABASE_SECRET_KEY` or `AR_UPLOAD_KEY` in:

- `ar-upload-config.js`;
- `index.html`;
- GitHub;
- a URL;
- a QR code.

Netlify applies Function environment variables from the values present at deployment time. After setting or changing these values, perform one production deploy.

## 6. Deploy the site and Function once

Dragging only `static-site` into Netlify publishes static files but is not the reliable way to deploy the Function. Use Netlify CLI for this deployment.

Open PowerShell in the repository root, where `package.json` and `netlify.toml` are located. You do not need to install another permanent global package. Run Netlify CLI through `npx.cmd`:

```powershell
npx.cmd --yes netlify-cli@latest login
```

Link the local folder to the existing Netlify project:

```powershell
npx.cmd --yes netlify-cli@latest link
```

Choose the existing project:

```text
brilliant-klepon-fbae3a
```

Prepare the current public files:

```powershell
npm.cmd run prepare:static
```

Deploy the static site and Function together:

```powershell
npx.cmd --yes netlify-cli@latest deploy --prod --dir=static-site --functions=netlify/functions
```

The included `DEPLOY_NETLIFY_WITH_FUNCTIONS.cmd` performs the same sequence interactively. Do not use Netlify Drop for this particular deployment because dragging only `static-site` does not deploy the Function.

This consumes **one** production deployment. On Netlify credit-based plans, a successful production deployment currently consumes 15 credits. New GLB models do not create deployments: each one uses only a short Function call plus the direct Supabase upload.

## 7. Verify the Function

Open:

```text
https://brilliant-klepon-fbae3a.netlify.app/api/ar-upload-ticket
```

Expected result:

```json
{
  "ok": true,
  "service": "ar-upload-ticket",
  "configured": true,
  "bucket": "window-ar-models"
}
```

If `configured` is `false`, inspect the Netlify environment variables and redeploy.

## 8. Test the complete automated flow

1. Open the Netlify configurator on the laptop.
2. Configure the window.
3. Press **Generate AR QR**.
4. The browser exports and optimizes the GLB.
5. Enter `AR_UPLOAD_KEY` when prompted.
6. The dialog displays the upload percentage.
7. The public Supabase URL is verified.
8. The QR appears automatically.
9. Scan the QR on the phone.
10. Confirm that the 3D preview loads.
11. Press **Open in AR**.

The access key is kept only in `sessionStorage`, so it is forgotten when the tab/session ends.

## 9. Managing stored models

Supabase Storage contains files such as:

```text
models/<sha256>.glb
```

Identical GLBs share the same hash and are not uploaded again.

To free space:

1. Open **Supabase → Storage → window-ar-models → models**.
2. Delete old `.glb` files.

The application intentionally does not delete files automatically. It stops accepting uploads before reaching the configured storage safety cap.

## 10. Common errors

### `SERVER_NOT_CONFIGURED`

One or more Netlify environment variables are missing. Set them and redeploy.

### `UPLOAD_KEY_INVALID`

The password entered in the configurator does not match `AR_UPLOAD_KEY` in Netlify.

### `ORIGIN_NOT_ALLOWED`

`AR_ALLOWED_ORIGINS` does not exactly match the public Netlify origin.

### `NoSuchBucket`

The bucket does not exist or its name differs from `SUPABASE_BUCKET`.

### Safety-cap error

Delete old GLBs from Supabase Storage or deliberately raise the configured limit while remaining within the plan quota.

### 3D preview works but Scene Viewer fails

Download the exact GLB from the phone page and validate it. The storage/upload pipeline is already working in that case.

## Official references

- Supabase resumable uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase Storage buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase cost controls: https://supabase.com/docs/guides/platform/cost-control
- Netlify Functions: https://docs.netlify.com/build/functions/get-started/
- Netlify Function environment variables: https://docs.netlify.com/build/functions/environment-variables/
- Netlify CLI: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/

## Signed resumable endpoint

This build uses Supabase's signed TUS endpoint:

```text
/storage/v1/upload/resumable/sign
```

The similar endpoint without `/sign` is for normal JWT-authenticated resumable uploads and will reject a signed-upload token with an `Invalid Compact JWS` error. After deployment, the health endpoint reports `build: supabase-tus-sign-20260729-01`.

