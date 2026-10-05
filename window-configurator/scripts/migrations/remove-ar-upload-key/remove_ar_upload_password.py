#!/usr/bin/env python3
"""Remove the public AR upload password flow from Configurator 360.

Run this script from the repository root, or pass the repository path as the
first argument. It patches both source files and static-site copies when they
exist, while preserving Supabase signed upload, TUS, signed-PUT fallback,
origin checks, MIME/hash validation, and storage limits.
"""

from __future__ import annotations

import datetime as _dt
import re
import shutil
import subprocess
import sys
from pathlib import Path


class PatchError(RuntimeError):
    pass


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")


def remove_named_js_function(text: str, name: str, *, required: bool = True) -> tuple[str, bool]:
    """Remove a normal/async JS function declaration using brace-aware scanning."""
    pattern = re.compile(rf"(?m)^(?P<indent>[ \t]*)(?:async\s+)?function\s+{re.escape(name)}\s*\(")
    match = pattern.search(text)
    if not match:
        if required:
            raise PatchError(f"Could not find JavaScript function {name}().")
        return text, False

    line_start = match.start()
    brace_start = text.find("{", match.end())
    if brace_start < 0:
        raise PatchError(f"Could not find opening brace for {name}().")

    i = brace_start
    depth = 0
    state = "code"
    quote = ""
    template_expr_depth = 0

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if state == "line_comment":
            if ch == "\n":
                state = "code"
            i += 1
            continue

        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 2
            else:
                i += 1
            continue

        if state == "string":
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                state = "code"
            i += 1
            continue

        if state == "template":
            if ch == "\\":
                i += 2
                continue
            if ch == "`" and template_expr_depth == 0:
                state = "code"
                i += 1
                continue
            if ch == "$" and nxt == "{":
                template_expr_depth += 1
                i += 2
                continue
            if ch == "}" and template_expr_depth > 0:
                template_expr_depth -= 1
                i += 1
                continue
            i += 1
            continue

        # code
        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch in ("'", '"'):
            state = "string"
            quote = ch
            i += 1
            continue
        if ch == "`":
            state = "template"
            template_expr_depth = 0
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                # Remove trailing spaces and at most two following blank lines.
                while end < len(text) and text[end] in " \t":
                    end += 1
                if end < len(text) and text[end] == "\r":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                if end < len(text) and text[end] == "\r":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:line_start] + text[end:], True
        i += 1

    raise PatchError(f"Could not find closing brace for {name}().")


def replace_named_js_function(text: str, name: str, replacement: str) -> str:
    marker = f"__AR_PATCH_REPLACEMENT_{name}__"
    pattern = re.compile(rf"(?m)^(?P<indent>[ \t]*)(?:async\s+)?function\s+{re.escape(name)}\s*\(")
    match = pattern.search(text)
    if not match:
        raise PatchError(f"Could not find JavaScript function {name}().")
    indent = match.group("indent")
    text_with_marker = text[: match.start()] + marker + "\n" + text[match.start():]
    text_without_old, removed = remove_named_js_function(text_with_marker, name, required=True)
    if not removed or marker not in text_without_old:
        raise PatchError(f"Internal replacement error for {name}().")
    rendered = "\n".join((indent + line if line else "") for line in replacement.strip("\n").splitlines())
    return text_without_old.replace(marker, rendered, 1)


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise PatchError(f"Could not find expected block: {label}.")
    return text.replace(old, new, 1)


def patch_index(text: str) -> str:
    text, _ = remove_named_js_function(text, "readUploadAccessKey", required=False)
    text, _ = remove_named_js_function(text, "clearUploadAccessKey", required=False)

    replacement = r'''async function publishWithSupabase(exported) {
    const config = window.AR_UPLOAD_CONFIG || {};
    const uploadResult = await uploadGLBToSupabase({
        ticketEndpoint: config.ticketEndpoint || '/api/ar-upload-ticket',
        arrayBuffer: exported.arrayBuffer,
        filename: exported.filename,
        sha256: exported.hash,
        appBuild: APP_BUILD,
        onProgress(bytesUploaded, bytesTotal) {
            const percentage = bytesTotal > 0
                ? Math.min(100, 100 * bytesUploaded / bytesTotal)
                : 0;
            setQRStatus(`2/3 Uploading the optimized GLB directly to Supabase… ${percentage.toFixed(1)}%`);
        }
    });

    if (!uploadResult?.publicUrl) {
        throw new Error('Supabase did not return a public GLB URL.');
    }

    setQRStatus(uploadResult.exists
        ? '2/3 This exact GLB already exists in Supabase. Verifying its public URL…'
        : '3/3 Upload completed. Waiting for the public Supabase URL…');
    await waitForPublishedModel(uploadResult.publicUrl, exported.arrayBuffer.byteLength);
    completePublishedQR(uploadResult.publicUrl, exported.modelName);
}'''
    text = replace_named_js_function(text, "publishWithSupabase", replacement)

    forbidden = [
        "readUploadAccessKey",
        "clearUploadAccessKey",
        "configurator360.arUploadKey",
        "Enter the AR upload access key",
        "accessKey,",
    ]
    present = [item for item in forbidden if item in text]
    if present:
        raise PatchError(f"index.html still contains password-flow tokens: {present}")
    return text


def patch_ar_export(text: str) -> str:
    # Parameter/call entries. Limit replacements to the known adjacency so other
    # unrelated names called accessKey are not silently removed.
    text = re.sub(
        r"(?m)^(\s*)ticketEndpoint,\s*\n\1accessKey,\s*\n\1arrayBuffer,",
        r"\1ticketEndpoint,\n\1arrayBuffer,",
        text,
    )

    header_pattern = re.compile(
        r"headers:\s*\{\s*['\"]Content-Type['\"]:\s*['\"]application/json['\"]\s*,\s*"
        r"['\"]X-AR-Upload-Key['\"]:\s*accessKey\s*\|\|\s*['\"]['\"]\s*\}",
        re.S,
    )
    text, count = header_pattern.subn("headers: { 'Content-Type': 'application/json' }", text)
    if count == 0 and "X-AR-Upload-Key" in text:
        raise PatchError("Could not remove the X-AR-Upload-Key request header.")

    if "X-AR-Upload-Key" in text or re.search(r"\baccessKey\b", text):
        raise PatchError("ar-export.js still contains access-key code after patching.")
    return text


def patch_upload_config(text: str) -> str:
    text = re.sub(
        r"(?m)^\s*uploadKeySessionStorageName\s*:\s*['\"][^'\"]+['\"]\s*,?\s*\n",
        "",
        text,
    )
    if "uploadKeySessionStorageName" in text or "arUploadKey" in text:
        raise PatchError("ar-upload-config.js still contains upload-key configuration.")
    return text


def patch_netlify_function(text: str) -> str:
    text, _ = remove_named_js_function(text, "timingSafeTextEqual", required=False)

    text = re.sub(
        r"(?m)^\s*const\s+uploadKey\s*=\s*String\(process\.env\.AR_UPLOAD_KEY\s*\|\|\s*['\"]['\"]\);\s*\n",
        "",
        text,
    )

    text = text.replace(
        "Boolean(supabaseUrl && secretKey && uploadKey && allowedOrigins.length)",
        "Boolean(supabaseUrl && secretKey && allowedOrigins.length)",
    )
    text = text.replace(
        "!supabaseUrl || !secretKey || !uploadKey || allowedOrigins.length === 0",
        "!supabaseUrl || !secretKey || allowedOrigins.length === 0",
    )

    auth_block = re.compile(
        r"\n\s*if\s*\(\s*!timingSafeTextEqual\(\s*request\.headers\.get\(['\"]x-ar-upload-key['\"]\)\s*,\s*uploadKey\s*\)\s*\)\s*\{"
        r".*?UPLOAD_KEY_INVALID.*?\}\s*\n",
        re.S,
    )
    text = auth_block.sub("\n", text)

    # Remove crypto imports only when nothing else in the function still uses crypto.
    if not re.search(r"\b(?:crypto|timingSafeEqual|createHash|randomBytes)\b", text):
        text = re.sub(r"(?m)^import\s+.*?(?:node:crypto|['\"]crypto['\"]).*?;\s*\n", "", text)
    else:
        # The previous timing-safe helper commonly leaves only its import behind.
        non_import = re.sub(r"(?m)^import\s+.*?(?:node:crypto|['\"]crypto['\"]).*?;\s*\n", "", text)
        if not re.search(r"\b(?:crypto|timingSafeEqual|createHash|randomBytes)\b", non_import):
            text = non_import

    # Keep the TUS signed-endpoint fix visible in diagnostics while marking this build.
    text = text.replace("supabase-tus-sign-20260729-01", "supabase-tus-sign-no-key-20260730-01")

    forbidden = ["AR_UPLOAD_KEY", "x-ar-upload-key", "UPLOAD_KEY_INVALID", "uploadKey", "timingSafeTextEqual"]
    present = [item for item in forbidden if item in text]
    if present:
        raise PatchError(f"ar-upload-ticket.mjs still contains password-flow tokens: {present}")

    required = ["AR_ALLOWED_ORIGINS", "AR_MAX_FILE_BYTES", "AR_MAX_MODELS", "AR_MAX_TOTAL_BYTES"]
    missing = [item for item in required if item not in text]
    if missing:
        raise PatchError(f"Safety checks unexpectedly missing from ar-upload-ticket.mjs: {missing}")
    return text


def patch_env(text: str) -> str:
    return re.sub(r"(?m)^AR_UPLOAD_KEY=.*\n?", "", text)


def patch_setup_doc(text: str) -> str:
    text = text.replace("Netlify Function verifies the private upload access key\n        ↓\n", "Netlify Function validates the site origin and upload metadata\n        ↓\n")
    text = text.replace("- an upload access key is required and is never stored in public source code.\n", "- requests are accepted only from origins listed in `AR_ALLOWED_ORIGINS`.\n")

    # Remove the dedicated access-key section, preserving the next heading.
    text = re.sub(
        r"\n## 4\. Create a private AR upload access key\n.*?(?=\n## 5\.)",
        "\n",
        text,
        flags=re.S,
    )
    text = text.replace("## 5. Add Netlify environment variables", "## 4. Add Netlify environment variables")
    text = text.replace("## 6. Deploy the site and Function once", "## 5. Deploy the site and Function once")
    text = text.replace("## 7. Verify the Function", "## 6. Verify the Function")
    text = text.replace("## 8. Test the complete automated flow", "## 7. Test the complete automated flow")
    text = text.replace("## 9. Managing stored models", "## 8. Managing stored models")
    text = text.replace("## 10. Common errors", "## 9. Common errors")

    text = re.sub(r"\n```text\nAR_UPLOAD_KEY\nYOUR_LONG_RANDOM_ACCESS_KEY\n```\n", "\n", text)
    text = text.replace(" or `AR_UPLOAD_KEY`", "")
    text = text.replace(" or AR_UPLOAD_KEY", "")
    text = text.replace("5. Enter `AR_UPLOAD_KEY` when prompted.\n6. The dialog displays the upload percentage.\n7. The public Supabase URL is verified.\n8. The QR appears automatically.\n9. Scan the QR on the phone.\n10. Confirm that the 3D preview loads.\n11. Press **Open in AR**.",
                        "5. The dialog displays the upload percentage.\n6. The public Supabase URL is verified.\n7. The QR appears automatically.\n8. Scan the QR on the phone.\n9. Confirm that the 3D preview loads.\n10. Press **Open in AR**.")
    text = re.sub(r"\nThe access key is kept only in `sessionStorage`.*?\n", "\n", text)
    text = re.sub(r"\n### `UPLOAD_KEY_INVALID`\n.*?(?=\n### )", "\n", text, flags=re.S)
    text = text.replace("SUPABASE_SECRET_KEY` or `AR_UPLOAD_KEY", "SUPABASE_SECRET_KEY")
    text = text.replace("password entered in the configurator", "request origin")
    return text


def patch_readme(text: str) -> str:
    text = text.replace("protected signed-upload-ticket endpoint", "origin-restricted signed-upload-ticket endpoint")
    text = text.replace("protected signed-upload ticket", "origin-restricted signed-upload ticket")
    return text


def run_node_check(path: Path) -> tuple[bool, str]:
    node = shutil.which("node")
    if not node:
        return True, "Node.js not found; syntax check skipped."
    proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
    if proc.returncode == 0:
        return True, "OK"
    return False, (proc.stderr or proc.stdout).strip()


def main() -> int:
    repo = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    if not repo.exists() or not repo.is_dir():
        print(f"ERROR: repository folder does not exist: {repo}", file=sys.stderr)
        return 2

    candidates = {
        "index": [repo / "index.html", repo / "static-site" / "index.html"],
        "ar_export": [repo / "ar-export.js", repo / "static-site" / "ar-export.js"],
        "config": [repo / "ar-upload-config.js", repo / "static-site" / "ar-upload-config.js"],
        "function": [repo / "netlify" / "functions" / "ar-upload-ticket.mjs"],
        "env": [repo / ".env.example"],
        "setup": [repo / "SUPABASE_NETLIFY_SETUP.md"],
        "readme": [repo / "README.md"],
    }

    required_groups = ("index", "ar_export", "config", "function")
    missing = [group for group in required_groups if not any(path.exists() for path in candidates[group])]
    if missing:
        print("ERROR: this does not look like the Supabase/Netlify configurator repository.", file=sys.stderr)
        print("Missing: " + ", ".join(missing), file=sys.stderr)
        return 2

    timestamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = repo / ".ar-upload-key-removal-backup" / timestamp
    changes: list[Path] = []

    patchers = {
        "index": patch_index,
        "ar_export": patch_ar_export,
        "config": patch_upload_config,
        "function": patch_netlify_function,
        "env": patch_env,
        "setup": patch_setup_doc,
        "readme": patch_readme,
    }

    try:
        for group, paths in candidates.items():
            for path in paths:
                if not path.exists():
                    continue
                old = read_text(path)
                new = patchers[group](old)
                if new == old:
                    print(f"UNCHANGED  {path.relative_to(repo)}")
                    continue
                backup = backup_root / path.relative_to(repo)
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, backup)
                write_text(path, new)
                changes.append(path)
                print(f"PATCHED    {path.relative_to(repo)}")

        if not changes:
            print("\nNo files changed. The password flow may already be removed.")
            return 0

        # Syntax-check standalone JS files. index.html is validated by targeted
        # token checks above and then by the browser after deployment.
        checks = []
        for path in candidates["ar_export"] + candidates["function"]:
            if path.exists():
                ok, detail = run_node_check(path)
                checks.append((path, ok, detail))
                if not ok:
                    raise PatchError(f"Node syntax check failed for {path}:\n{detail}")

        print(f"\nBackup created at: {backup_root}")
        for path, _ok, detail in checks:
            print(f"Syntax     {path.relative_to(repo)}: {detail}")

        print("\nPassword flow removed successfully.")
        print("Next: run npm.cmd run prepare:static, then deploy the site and Netlify Function.")
        print("After the successful deploy, AR_UPLOAD_KEY can be deleted from Netlify environment variables.")
        return 0

    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        if backup_root.exists():
            print(f"Restoring files from {backup_root}...", file=sys.stderr)
            for backup in backup_root.rglob("*"):
                if backup.is_file():
                    target = repo / backup.relative_to(backup_root)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(backup, target)
            print("Original files restored.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
