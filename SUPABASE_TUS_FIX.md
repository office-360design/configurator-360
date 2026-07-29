# Supabase signed TUS fix

The previous build sent `x-signature` to `/storage/v1/upload/resumable`. Supabase signed resumable uploads require `/storage/v1/upload/resumable/sign`. The old endpoint treated the signed upload token as a normal JWT and returned `Invalid Compact JWS`.

This build also retries the signed PUT upload route if TUS creation fails.

After deploying, open `/api/ar-upload-ticket` and verify:

- `build`: `supabase-tus-sign-20260729-01`
- `uploadProtocol`: `tus-signed`
- `tusEndpointPath`: `/storage/v1/upload/resumable/sign`
