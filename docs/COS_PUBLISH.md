# Tencent Cloud COS Asset Hosting and Update Publishing (`@pocket/cos`)

This document records the source audit, reused SDK boundaries, `@pocket/cos` design, CLI and Pocket Studio usage, and validation of the Tencent Cloud Object Storage integration.

## 1. Source Audit and Historical Decisions

Before implementation, the source-first audit examined retained `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`, and `sdk/docs/DECISIONS.md`.

- The parent contained the Flutter demo shell under `lib/`, `assets/`, and `test/`. It had no Tencent Cloud COS XML v5 signing, multipart uploads, local `~/.cos.yaml` or `~/.cos.conf` parsing, or two-phase atomic publishing.
- The original local scaffold extracted from `PocketJSKit` excluded older business templates and the previous COS dependency. Later `package_update.ts` added content-addressed `blobs/<sha256>`, offline base archives `bundles/bundle-<sha256>.7z|.zip`, and on-demand network resources. With fixed `PocketHostConfig` and `PocketUpdateCoordinator` entry contracts, `@pocket/cos` and Pocket Studio could add COS as an optional JS/TS publishing target with the existing Flutter host.

## 2. SDK Boundaries

COS publishing uses the existing signing and Flutter updater contracts.

| Module | Reused responsibility |
| --- | --- |
| `sdk/scripts/package_update.ts` (`packageArtifacts`) | Generates Ed25519-signed `latest.json`, `payload.json`, `bundles/bundle-<sha256>.7z`, and content-addressed `blobs/<sha256>`. `pocket.resources.json` can mark eligible PAK entries or standalone `assets/*` as `"network"` for on-demand fetch. |
| `sdk/lib/src/pocket_host_config.dart` (`PocketHostConfig`) | Loads the fixed entry `<publicBaseUrl>/<slot>/pocket/<hostVersion>/<appId>/latest.json` via `POCKET_HOST_CONFIG_URL`. Parses `pocket-editor-package-index`, derives update URLs for the root and associated mini-apps, and preserves `/<keyPrefix>`. |
| `sdk/packages/pocket_services/lib/src/pocket_update.dart` (`PocketUpdateCoordinator`) | Fetches `latest.json`, `bundles/*`, and `blobs/<sha256>` through ordinary HTTPS/HTTP. Verifies Ed25519 and SHA-256, resumes or reuses incremental caches, and assembles the PAK. |
| `sdk/editor/update_endpoint.ts` | The read-only LAN endpoint serves signed artifact paths only. `/cos`, Studio APIs, and keys are outside that listener. |

## 3. Package Design

The implementation lives in `sdk/packages/pocket_cos/` and exports `@pocket/cos`.

1. **Dependency-free COS XML v5 signing in `src/sign.ts`.**
   - TypeScript SHA-1 and HMAC-SHA-1 use no `node:*` imports and run in Node, Bun, browsers, Workers, and QuickJS.
   - COS signing lowercases HTTP methods, escapes RFC 3986 characters `!'()*`, normalizes valueless query parameters such as `?uploads` to `uploads=`, lowercases and sorts header and parameter names, and signs temporary `x-cos-security-token` automatically.
2. **Local configuration discovery in `src/local_config.ts`.**
   - Precedence is environment variables, Studio local keystore (`<workspace>/keys/cos-credentials.json`, `0o600`), coscli (`~/.cos.yaml`), then coscmd (`~/.cos.conf`).
   - It supports `POCKET_COS_*`, `TENCENT_COS_*`, `TENCENTCLOUD_*`, and `COS_*`. Studio aggregates bucket, region, and endpoint options from the sources.
   - Symlinks are rejected. API responses, status snapshots, logs, and errors redact `secretKey` and `securityToken`. Only a masked `maskedSecretId`, such as `AKID****3456`, is shown.
3. **Single-object and concurrent multipart uploads in `src/client.ts`.**
   - Small files use `PUT Object` with `Content-MD5` and `x-cos-meta-sha256`.
   - At or above 8 MiB by default, the client uses `POST ?uploads`, concurrent `PUT ?partNumber&uploadId`, then ordered `POST ?uploadId` completion. A failed part triggers `DELETE ?uploadId` to clean up remaining parts.
4. **Two-phase publishing and cache control in `src/publisher.ts`.**
   - Phase 1 uploads immutable objects concurrently. `HEAD Object` checks size and `x-cos-meta-sha256` at the same key. Matching objects are reused. New or changed blobs, bundles, `bootstrap/*`, and immutable snapshots use `Cache-Control: public, max-age=31536000, immutable`. A failure stops before Phase 2.
   - Phase 2 uploads mutable indexes such as `latest.json` sequentially after all immutable objects are ready. Child packages precede the SystemUI root. `Cache-Control: no-cache, no-store, must-revalidate` applies to these pointers. This ordering prevents a newly published manifest from referencing missing blobs.
5. **Prefix-safe relative paths and HTTPS `host.json` rewriting.**
   - `normalizeCosKeyPrefix` and `resolveCosTarget` reject the reserved `"pocket"` path segment in `keyPrefix` and `publicBaseUrl`. `PocketHostConfig._fixedIndexUri` locates the canonical root with `segments.indexOf('pocket')`.
   - The static index at `<slot>/pocket/<hostVersion>/<pkgId>/latest.json` uses relative `../../../../pocket/<hostVersion>/<pkgId>/<releaseId>/latest.json` and `host.json` paths. `PocketHostConfig.load` and `PocketUpdateCoordinator` handle optional prefixes and custom CDN domains.
   - `rebaseStudioHostDescriptorForCos` points the original LAN `host.json` `baseUrl` and `bootstrapAssets` at the COS `publicBaseUrl`. Under HTTPS it removes `POCKET_UPDATE_DEBUG_HTTP_HOST` and `debugHttpHosts`.

## 4. Usage

### 4.1 CLI (`bun run cos` or `npm run cos`)

Run from `sdk/`.

```sh
# 1. Inspect local COS credentials and discovered buckets. JSON is the default, and --json is accepted.
bun run cos inspect
bun run cos inspect --json

# 2. Check target bucket reachability and permissions.
bun run cos check --bucket example-1250000000 --region ap-guangzhou --prefix apps/my-app

# 3. Preview the release plan without network writes.
bun run cos publish \
  --deploy-root /path/to/updates \
  --bucket example-1250000000 \
  --region ap-guangzhou \
  --prefix apps/my-app \
  --dry-run

# 4. Publish to Tencent Cloud COS with the two-phase upload.
bun run cos publish \
  --deploy-root /path/to/updates \
  --bucket example-1250000000 \
  --region ap-guangzhou \
  --prefix apps/my-app \
  --public-base-url https://cdn.example.com/apps/my-app
```

### 4.2 Pocket Studio

1. Start Pocket Studio with `npm run editor` and open the Release Publishing or Version Management panel on the right (版本发布 / 版本管理).
2. In Tencent Cloud COS Asset Hosting and Update Publishing (腾讯云 COS · 云端素材与热更发布):
   - Configure `~/.cos.yaml` for coscli, `~/.cos.conf` for coscmd, or environment variables. The panel shows Detected (已检测到) and the masked `SecretId`.
   - Click Configure (配置). Choose a discovered bucket (已发现存储桶) to fill `Bucket-APPID` and `Region`. Optional settings include Object Key Prefix (对象路径前缀), Custom CDN Domain (自定义加速域名), and Sync Local Releases to COS (发布本地版本时自动同步到 COS).
   - Without coscli, expand Configure Studio Local Credentials Manually (手动配置 Studio 本机密钥). Credentials are stored only in `<workspace>/keys/cos-credentials.json` with mode `0600`, outside project `editor.json` and `pocket.json`.
3. Click Verify Connection (验证连接) to check bucket access, then enable COS Publishing (开启 COS 发布).
4. Publish a local test or stable release, then click Upload Test Release to COS (上传测试版到 COS) or Upload Stable Release to COS (上传稳定版到 COS).
5. The panel shows the public COS endpoint (COS 线上接入地址) for `latest.json`. Click Copy COS Endpoint (复制 COS 接入地址) to use it at Flutter startup.

```sh
flutter run --dart-define=POCKET_HOST_CONFIG_URL='https://<bucket>.cos.<region>.myqcloud.com/<optional-prefix>/test/pocket/<hostVersion>/<appId>/latest.json'
```

## 5. Executed Verification

Commands ran in `/Volumes/ORICO/Development/Github/pocket`.

1. **Package tests for signing, local discovery, multipart uploads, two-phase publishing, and CLI**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket/sdk && bun test packages/pocket_cos/test/*.test.ts
   ```

   `12 pass, 0 fail, 157 expect() calls` across `sign.test.ts`, `local_config.test.ts` (including `cos inspect --json`), `client.test.ts`, and `publisher.test.ts`.

2. **Studio COS end-to-end, Playwright UI, and regression suites**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket/sdk && POCKET_SOURCE_BUILD=1 bun test editor/test/cos_publish_e2e.test.ts editor/test/cos_publish_ui.test.ts editor/test/config_preservation.test.ts editor/test/editor_versions.test.ts editor/test/update_endpoint.test.ts
   ```

   `12 pass, 0 fail, 604 expect() calls`. This covered real `buildGuest`, on-demand resources via `pocket.resources.json`, a local simulated COS XML v5 signature-verification service, HTTP reconstruction of `app.qjbc` and `app.pak`, and real `pocket_probe` DrawOps changing from `Count 0` to `Count 1` on a pointer click.

3. **Web SDK export and update packaging**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket && POCKET_SOURCE_BUILD=1 bun test sdk/scripts/tests/export_web_sdk.test.ts sdk/scripts/tests/package_update.test.ts
   ```

   `23 pass, 0 fail, 372 expect() calls`.

4. **Studio self-upgrade regressions**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket/sdk && POCKET_SOURCE_BUILD=1 bun test editor/test/studio_upgrade.test.ts editor/test/source_upgrade_git.test.ts
   ```

   `37 pass, 0 fail, 269 expect() calls`.

5. **Flutter host configuration and prefixed COS update download**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket/sdk && flutter test --no-pub test/pocket_host_config_test.dart test/cos_prefix_host_update_test.dart
   ```

   `12 passed (All tests passed!)`. `PocketHostConfig.load` parsed a COS index with the `/apps/demo-cos` prefix and relative `../../../../pocket/...` paths. `PocketUpdateCoordinator.prepare()` downloaded a ZIP bundle and independent network blob, verified Ed25519 and SHA-256, and reconstructed the PAK.

6. **Architecture and frontend syntax**

   ```sh
   cd /Volumes/ORICO/Development/Github/pocket/sdk && python3 scripts/check_architecture.py && node --check editor/client/editor.js
   ```

   `Architecture boundary passed: SDK/demo entries are present; SDK has no demo dependency or legacy business renderer.` Exit code `0`.

7. **Git whitespace and formatting**

   ```sh
   git -C /Volumes/ORICO/Development/Github/pocket diff --check -- sdk/packages/pocket_cos sdk/editor sdk/scripts sdk/test/cos_prefix_host_update_test.dart sdk/docs/COS_PUBLISH.md README.md README.zh-CN.md sdk/package.json
   ```

   Zero errors or warnings. Exit code `0`.

> **Note (Argon Medium Consolidated Review)**: Completed consolidated Argon Medium review (`agy --model gemini-4-argon-medium --effort medium`) — `VERDICT: NO BLOCKING FINDINGS`. The single `LOW` finding (`cos inspect --json` valueless flag parsing) was fixed in `sdk/packages/pocket_cos/src/cli.ts` with regression coverage in `sdk/packages/pocket_cos/test/local_config.test.ts`, and all suites were re-verified cleanly after the final edit.
