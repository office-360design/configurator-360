# Remove the AR upload password

This update removes `AR_UPLOAD_KEY` from the complete browser → Netlify Function → Supabase flow.

It preserves:

- `AR_ALLOWED_ORIGINS` checking;
- the signed Supabase TUS endpoint and signed-PUT fallback;
- GLB content-type, size, and SHA-256 validation;
- duplicate-model reuse;
- maximum file, model-count, and total-storage limits.

## Apply on Windows

1. Copy these three files into the repository root, next to `package.json`:
   - `APPLY_REMOVE_AR_UPLOAD_KEY.cmd`
   - `remove_ar_upload_password.py`
   - this README
2. Double-click `APPLY_REMOVE_AR_UPLOAD_KEY.cmd`.
3. The updater creates a timestamped backup under `.ar-upload-key-removal-backup/`.
4. Deploy by running `scripts/windows/deploy_netlify_with_functions.cmd`.
5. Test **Generate AR QR**. The upload must start without a password prompt.
6. After the deployment works, delete `AR_UPLOAD_KEY` from Netlify → Project configuration → Environment variables.

The updater modifies source files and their `dist/site` copies when present. It also updates `.env.example` and the Supabase/Netlify setup documentation.
