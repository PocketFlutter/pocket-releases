# `@pocket/cos` — Tencent Cloud COS Publisher & Signing SDK

Zero-third-party-dependency Tencent Cloud COS (XML API v5) client, request signer, local credential inspector, and atomic two-phase Pocket package publisher.

## Features

- **Pure TypeScript Request Signing (`@pocket/cos/sign`)**:
  - Zero `node:*` imports — runs in Browser, Web Worker, QuickJS, Node.js, and Bun.
  - Implements Tencent Cloud COS XML v5 `q-sign-algorithm=sha1` authorization and presigned URLs.
- **Local Configuration Discovery (`@pocket/cos/local-config`)**:
  - Automatically discovers credentials and bucket profiles without exposing secret keys to logs or UI responses:
    1. Environment variables (`TENCENTCLOUD_SECRET_ID` / `COS_SECRET_ID` / `POCKET_COS_SECRET_ID`, etc.)
    2. Studio workspace credentials (`<workspace>/keys/cos-credentials.json`, `0o600` permissions)
    3. Official `coscli` configuration (`~/.cos.yaml` or `POCKET_COS_CONFIG_YAML`)
    4. Official `coscmd` configuration (`~/.cos.conf` or `POCKET_COS_CONFIG_CONF`)
  - Refuses symbolic links and oversized config files (> 256 KiB).
- **COS XML v5 Client (`@pocket/cos/client`)**:
  - Supports `HeadBucket` (`HEAD /`) with prefix-scoped fallback (`HEAD /<keyPrefix>/.pocket-cos-probe`), `HeadObject`, `PutObject` (with `Content-MD5` and `x-cos-meta-sha256`), and concurrent Multipart Upload (`InitiateMultipartUpload` -> `UploadPart` -> `CompleteMultipartUpload` with `AbortMultipartUpload` cleanup on failure).
- **Two-Phase Atomic Package Publishing (`@pocket/cos/publisher`)**:
  - **Phase 1 (Immutable Content-Addressed Objects)**: Uploads `blobs/<sha256>`, `bundles/bundle-<sha256>.(7z|zip)`, and `bootstrap/*` with `Cache-Control: public, max-age=31536000, immutable`. Uses `HEAD` to skip already-uploaded content-addressed blobs across releases.
  - **Phase 2 (Mutable Entrypoints)**: Only after all Phase 1 uploads succeed with zero errors, uploads `payload.json`, `signed-manifest.json`, `host.json`, and finally `latest.json` (`Cache-Control: no-cache, no-store, must-revalidate`).

## CLI Usage

```sh
# Inspect local COS credential sources and discovered buckets
npm run cos -- inspect

# Verify bucket & prefix access
npm run cos -- check --bucket my-app-1250000000 --region ap-guangzhou --prefix prod

# Publish a deploy-root or single package directory to COS
npm run cos -- publish \
  --deploy-root /path/to/deploy \
  --bucket my-app-1250000000 \
  --region ap-guangzhou \
  --prefix prod
```

## Studio Integration

Pocket Studio uses `@pocket/cos` to inspect local COS environments, manage workspace-scoped credentials, and publish signed `test` / `stable` releases and `pocket-editor-package-index` catalogs directly to Tencent Cloud COS.
