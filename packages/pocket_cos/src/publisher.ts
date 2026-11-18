import { createPublicKey } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import type { PublishedVersion } from "../../../editor/version_store.ts";
import {
  sha256Hex,
  verifySignedManifest,
  type PocketUpdatePayload,
  type SignedManifest,
} from "../../../scripts/package_update.ts";
import type { CosClient } from "./client.ts";
import type {
  CosPublishFileRecord,
  CosPublishResult,
  CosPublishSummary,
  CosUploadProgress,
} from "./types.ts";

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const MUTABLE_CACHE_CONTROL = "no-cache, no-store, must-revalidate";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function normalizePublicKeyPem(publicKey: string | Buffer): string | Buffer {
  if (Buffer.isBuffer(publicKey)) return publicKey;
  const trimmed = publicKey.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as {
      publicKeyPem?: unknown;
      publicKeyBase64?: unknown;
    };
    if (typeof parsed.publicKeyPem === "string" && parsed.publicKeyPem.trim()) {
      return parsed.publicKeyPem.trim();
    }
    if (typeof parsed.publicKeyBase64 === "string" && parsed.publicKeyBase64.trim()) {
      const raw = Buffer.from(parsed.publicKeyBase64.trim(), "base64");
      if (raw.byteLength === 32) {
        return createPublicKey({
          key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
          format: "der",
          type: "spki",
        })
          .export({ format: "pem", type: "spki" })
          .toString();
      }
    }
  } catch {
    // Check raw 32-byte base64 public key next.
  }
  const raw = Buffer.from(trimmed, "base64");
  if (raw.byteLength === 32) {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: "der",
      type: "spki",
    })
      .export({ format: "pem", type: "spki" })
      .toString();
  }
  return trimmed;
}

function readVerifiedRegularFile(filePath: string, label: string): Uint8Array {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(filePath);
  } catch {
    throw new Error(`Missing required package file (${label}): ${filePath}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Package file must be a regular non-symlink file (${label}): ${filePath}`);
  }
  return new Uint8Array(readFileSync(filePath));
}

function inferContentType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".7z")) return "application/x-7z-compressed";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

export type VerifiedLocalPackage = {
  packageDir: string;
  envelope: SignedManifest;
  envelopeBytes: Uint8Array;
  payload: PocketUpdatePayload;
  payloadBytes: Uint8Array;
  payloadSha256: string;
  immutableFiles: Array<{
    relativePath: string;
    filePath: string;
    bytes: Uint8Array;
    size: number;
    sha256: string;
    contentType: string;
    deduplicate: boolean;
  }>;
  mutableFiles: Array<{
    relativePath: string;
    filePath: string;
    bytes: Uint8Array;
    size: number;
    sha256: string;
    contentType: string;
  }>;
};

export function verifyLocalPackageDirectory(
  packageDir: string,
  publicKey?: string | Buffer,
): VerifiedLocalPackage {
  const resolvedDir = resolve(packageDir);
  let dirStat: ReturnType<typeof lstatSync>;
  try {
    dirStat = lstatSync(resolvedDir);
  } catch {
    throw new Error(`Package directory does not exist: ${resolvedDir}`);
  }
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`Package directory must be a real non-symlink directory: ${resolvedDir}`);
  }

  const latestPath = join(resolvedDir, "latest.json");
  const latestBytes = readVerifiedRegularFile(latestPath, "latest.json");
  let envelope: SignedManifest;
  try {
    envelope = JSON.parse(new TextDecoder().decode(latestBytes)) as SignedManifest;
  } catch {
    throw new Error(`Invalid JSON in latest.json: ${latestPath}`);
  }
  if (
    !envelope ||
    typeof envelope.keyId !== "string" ||
    !envelope.keyId ||
    typeof envelope.payload !== "string" ||
    !envelope.payload ||
    typeof envelope.signature !== "string" ||
    !envelope.signature
  ) {
    throw new Error(`Malformed signed manifest envelope in ${latestPath}`);
  }

  const envelopePayloadBytes = new Uint8Array(Buffer.from(envelope.payload, "base64"));
  if (publicKey !== undefined) {
    verifySignedManifest(envelope, normalizePublicKeyPem(publicKey));
  }

  const payloadPath = join(resolvedDir, "payload.json");
  const payloadBytes = existsSync(payloadPath)
    ? readVerifiedRegularFile(payloadPath, "payload.json")
    : envelopePayloadBytes;

  if (
    payloadBytes.byteLength !== envelopePayloadBytes.byteLength ||
    sha256Hex(payloadBytes) !== sha256Hex(envelopePayloadBytes)
  ) {
    throw new Error("payload.json bytes do not match signed latest.json envelope payload");
  }

  const signedManifestPath = join(resolvedDir, "signed-manifest.json");
  if (existsSync(signedManifestPath)) {
    const signedManifestBytes = readVerifiedRegularFile(
      signedManifestPath,
      "signed-manifest.json",
    );
    const smEnvelope = JSON.parse(
      new TextDecoder().decode(signedManifestBytes),
    ) as SignedManifest;
    if (
      smEnvelope.payload !== envelope.payload ||
      smEnvelope.signature !== envelope.signature ||
      smEnvelope.keyId !== envelope.keyId
    ) {
      throw new Error("signed-manifest.json does not match latest.json");
    }
  }

  let payload: PocketUpdatePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as PocketUpdatePayload;
  } catch {
    throw new Error(`Invalid payload JSON in ${resolvedDir}`);
  }
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    typeof payload.appId !== "string" ||
    !Array.isArray(payload.files)
  ) {
    throw new Error(`Invalid PocketUpdatePayload in ${resolvedDir}`);
  }

  const blobsDir = join(resolvedDir, "blobs");
  if (existsSync(blobsDir) && lstatSync(blobsDir).isSymbolicLink()) {
    throw new Error(`Package blobs directory must not be a symlink: ${blobsDir}`);
  }

  const immutableFiles: VerifiedLocalPackage["immutableFiles"] = [];
  for (const file of payload.files) {
    if (
      !file ||
      typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      typeof file.url !== "string" ||
      file.url !== `blobs/${file.sha256}` ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error(`Invalid content file entry in payload: ${JSON.stringify(file)}`);
    }
    const blobPath = join(resolvedDir, file.url);
    const bytes = readVerifiedRegularFile(blobPath, file.url);
    if (bytes.byteLength !== file.size) {
      throw new Error(
        `Blob size mismatch for ${file.url}: expected ${file.size}, got ${bytes.byteLength}`,
      );
    }
    const actualSha = sha256Hex(bytes);
    if (actualSha !== file.sha256) {
      throw new Error(
        `Blob SHA-256 mismatch for ${file.url}: expected ${file.sha256}, got ${actualSha}`,
      );
    }
    immutableFiles.push({
      relativePath: file.url,
      filePath: blobPath,
      bytes,
      size: bytes.byteLength,
      sha256: actualSha,
      contentType: "application/octet-stream",
      deduplicate: true,
    });
  }

  if (payload.bundle) {
    const b = payload.bundle;
    const expectedUrl = `bundles/bundle-${b.sha256}.${b.format}`;
    if (
      (b.format !== "7z" && b.format !== "zip") ||
      !/^[0-9a-f]{64}$/.test(b.sha256) ||
      b.url !== expectedUrl ||
      !Number.isSafeInteger(b.size) ||
      b.size <= 0
    ) {
      throw new Error(`Invalid bundle descriptor in payload: ${JSON.stringify(b)}`);
    }
    const bundlesDir = join(resolvedDir, "bundles");
    if (existsSync(bundlesDir) && lstatSync(bundlesDir).isSymbolicLink()) {
      throw new Error(`Package bundles directory must not be a symlink: ${bundlesDir}`);
    }
    const bundlePath = join(resolvedDir, b.url);
    const bytes = readVerifiedRegularFile(bundlePath, b.url);
    if (bytes.byteLength !== b.size || sha256Hex(bytes) !== b.sha256) {
      throw new Error(`Bundle integrity mismatch for ${b.url}`);
    }
    immutableFiles.push({
      relativePath: b.url,
      filePath: bundlePath,
      bytes,
      size: bytes.byteLength,
      sha256: b.sha256,
      contentType: inferContentType(b.url),
      deduplicate: true,
    });
  }

  const bootstrapDir = join(resolvedDir, "bootstrap");
  if (existsSync(bootstrapDir)) {
    const bStat = lstatSync(bootstrapDir);
    if (bStat.isSymbolicLink() || !bStat.isDirectory()) {
      throw new Error(`Package bootstrap path must be a regular directory: ${bootstrapDir}`);
    }
    const entries = readdirSync(bootstrapDir).sort();
    for (const name of entries) {
      const rel = `bootstrap/${name}`;
      const fp = join(bootstrapDir, name);
      const bytes = readVerifiedRegularFile(fp, rel);
      immutableFiles.push({
        relativePath: rel,
        filePath: fp,
        bytes,
        size: bytes.byteLength,
        sha256: sha256Hex(bytes),
        contentType: inferContentType(rel),
        deduplicate: false,
      });
    }
  }

  const mutableFiles: VerifiedLocalPackage["mutableFiles"] = [];
  for (const bundleAlias of ["bundle.7z", "bundle.zip"]) {
    const aliasPath = join(resolvedDir, bundleAlias);
    if (existsSync(aliasPath)) {
      const bytes = readVerifiedRegularFile(aliasPath, bundleAlias);
      if (payload.bundle && bundleAlias === `bundle.${payload.bundle.format}`) {
        if (
          bytes.byteLength !== payload.bundle.size ||
          sha256Hex(bytes) !== payload.bundle.sha256
        ) {
          throw new Error(`${bundleAlias} does not match payload.bundle hash`);
        }
      }
      mutableFiles.push({
        relativePath: bundleAlias,
        filePath: aliasPath,
        bytes,
        size: bytes.byteLength,
        sha256: sha256Hex(bytes),
        contentType: inferContentType(bundleAlias),
      });
    }
  }

  if (existsSync(payloadPath)) {
    mutableFiles.push({
      relativePath: "payload.json",
      filePath: payloadPath,
      bytes: payloadBytes,
      size: payloadBytes.byteLength,
      sha256: sha256Hex(payloadBytes),
      contentType: "application/json; charset=utf-8",
    });
  }

  if (existsSync(signedManifestPath)) {
    const smBytes = readVerifiedRegularFile(signedManifestPath, "signed-manifest.json");
    mutableFiles.push({
      relativePath: "signed-manifest.json",
      filePath: signedManifestPath,
      bytes: smBytes,
      size: smBytes.byteLength,
      sha256: sha256Hex(smBytes),
      contentType: "application/json; charset=utf-8",
    });
  }

  const hostPath = join(resolvedDir, "host.json");
  if (existsSync(hostPath)) {
    const hostBytes = readVerifiedRegularFile(hostPath, "host.json");
    mutableFiles.push({
      relativePath: "host.json",
      filePath: hostPath,
      bytes: hostBytes,
      size: hostBytes.byteLength,
      sha256: sha256Hex(hostBytes),
      contentType: "application/json; charset=utf-8",
    });
  }

  // latest.json MUST always be the final mutable file in Phase 2.
  mutableFiles.push({
    relativePath: "latest.json",
    filePath: latestPath,
    bytes: latestBytes,
    size: latestBytes.byteLength,
    sha256: sha256Hex(latestBytes),
    contentType: "application/json; charset=utf-8",
  });

  return {
    packageDir: resolvedDir,
    envelope,
    envelopeBytes: latestBytes,
    payload,
    payloadBytes,
    payloadSha256: sha256Hex(payloadBytes),
    immutableFiles,
    mutableFiles,
  };
}

type DiscoveredPackageTarget = {
  packageDir: string;
  routePrefix: string;
};

function discoverReleasePackages(options: {
  packageDir?: string;
  deployRoot?: string;
  routePrefix?: string;
}): DiscoveredPackageTarget[] {
  if (options.packageDir && options.deployRoot) {
    throw new Error("Specify either packageDir or deployRoot, not both");
  }
  if (options.packageDir) {
    const cleanPrefix = (options.routePrefix ?? "").replace(/^\/+|\/+$/g, "");
    return [{ packageDir: resolve(options.packageDir), routePrefix: cleanPrefix }];
  }
  if (!options.deployRoot) {
    throw new Error("Either packageDir or deployRoot is required");
  }
  const rootDir = resolve(options.deployRoot);
  if (!existsSync(rootDir) || lstatSync(rootDir).isSymbolicLink() || !lstatSync(rootDir).isDirectory()) {
    throw new Error(`Deploy root must be a real non-symlink directory: ${rootDir}`);
  }

  if (existsSync(join(rootDir, "latest.json"))) {
    const cleanPrefix = (options.routePrefix ?? "").replace(/^\/+|\/+$/g, "");
    return [{ packageDir: rootDir, routePrefix: cleanPrefix }];
  }

  const pocketDir = join(rootDir, "pocket");
  if (!existsSync(pocketDir) || lstatSync(pocketDir).isSymbolicLink() || !lstatSync(pocketDir).isDirectory()) {
    throw new Error(`Deploy root does not contain pocket/<hostVersion>/<packageId>/<packageVersion>: ${rootDir}`);
  }

  const targets: DiscoveredPackageTarget[] = [];
  const hostVersions = readdirSync(pocketDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const hostEntry of hostVersions) {
    if (hostEntry.isSymbolicLink() || !hostEntry.isDirectory()) continue;
    const hostPath = join(pocketDir, hostEntry.name);
    const pkgEntries = readdirSync(hostPath, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const pkgEntry of pkgEntries) {
      if (pkgEntry.isSymbolicLink() || !pkgEntry.isDirectory()) continue;
      const pkgPath = join(hostPath, pkgEntry.name);
      const verEntries = readdirSync(pkgPath, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (const verEntry of verEntries) {
        if (verEntry.isSymbolicLink() || !verEntry.isDirectory()) continue;
        const verPath = join(pkgPath, verEntry.name);
        if (existsSync(join(verPath, "latest.json"))) {
          const relPrefix = `pocket/${hostEntry.name}/${pkgEntry.name}/${verEntry.name}`;
          targets.push({
            packageDir: verPath,
            routePrefix: options.routePrefix
              ? `${options.routePrefix.replace(/^\/+|\/+$/g, "")}/${relPrefix}`
              : relPrefix,
          });
        }
      }
    }
  }

  if (targets.length === 0) {
    throw new Error(`No signed Pocket release directories found under ${rootDir}`);
  }
  return targets;
}

export type PublishReleaseDirectoryOptions = {
  client: CosClient;
  packageDir?: string;
  deployRoot?: string;
  routePrefix?: string;
  publicKey?: string | Buffer;
  dryRun?: boolean;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: CosUploadProgress) => void;
};

export async function publishReleaseDirectoryToCos(
  options: PublishReleaseDirectoryOptions,
): Promise<CosPublishResult> {
  const { client } = options;
  const dryRun = options.dryRun === true;
  const concurrency = Math.max(1, Math.min(16, options.concurrency ?? 4));
  const discovered = discoverReleasePackages({
    packageDir: options.packageDir,
    deployRoot: options.deployRoot,
    routePrefix: options.routePrefix,
  });

  const verifiedList = discovered.map((item) => ({
    routePrefix: item.routePrefix,
    verified: verifyLocalPackageDirectory(item.packageDir, options.publicKey),
  }));

  type TaskItem = {
    phase: "phase1" | "phase2";
    relativeKey: string;
    bytes: Uint8Array;
    size: number;
    sha256: string;
    contentType: string;
    cacheControl: string;
    deduplicate: boolean;
  };

  const phase1Tasks: TaskItem[] = [];
  const phase2Tasks: TaskItem[] = [];

  for (const { routePrefix, verified } of verifiedList) {
    const prefix = routePrefix ? `${routePrefix}/` : "";
    for (const file of verified.immutableFiles) {
      phase1Tasks.push({
        phase: "phase1",
        relativeKey: `${prefix}${file.relativePath}`,
        bytes: file.bytes,
        size: file.size,
        sha256: file.sha256,
        contentType: file.contentType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        deduplicate: file.deduplicate,
      });
    }
    for (const file of verified.mutableFiles) {
      phase2Tasks.push({
        phase: "phase2",
        relativeKey: `${prefix}${file.relativePath}`,
        bytes: file.bytes,
        size: file.size,
        sha256: file.sha256,
        contentType: file.contentType,
        cacheControl: MUTABLE_CACHE_CONTROL,
        deduplicate: false,
      });
    }
  }

  const totalFiles = phase1Tasks.length + phase2Tasks.length;
  let completedFiles = 0;
  let uploadedFiles = 0;
  let skippedFiles = 0;
  let uploadedBytes = 0;
  let skippedBytes = 0;
  const records: CosPublishFileRecord[] = [];

  const executeTask = async (task: TaskItem): Promise<void> => {
    options.signal?.throwIfAborted?.();
    const objectKey = client.resolveObjectKey(task.relativeKey);
    let action: "uploaded" | "skipped" = "uploaded";

    if (!dryRun) {
      if (task.deduplicate) {
        const head = await client.headObject(task.relativeKey, options.signal);
        if (
          head.exists &&
          head.size === task.size &&
          (!head.sha256 || head.sha256.toLowerCase() === task.sha256.toLowerCase())
        ) {
          action = "skipped";
        }
      }
      if (action === "uploaded") {
        await client.uploadFile(task.relativeKey, task.bytes, {
          contentType: task.contentType,
          cacheControl: task.cacheControl,
          sha256: task.sha256,
          signal: options.signal,
        });
      }
    }

    completedFiles += 1;
    if (action === "skipped") {
      skippedFiles += 1;
      skippedBytes += task.size;
    } else {
      uploadedFiles += 1;
      uploadedBytes += task.size;
    }

    records.push({
      relativeKey: task.relativeKey,
      objectKey,
      size: task.size,
      sha256: task.sha256,
      cacheControl: task.cacheControl,
      contentType: task.contentType,
      phase: task.phase,
      action,
    });

    options.onProgress?.({
      phase: task.phase,
      relativeKey: task.relativeKey,
      objectKey,
      action,
      bytes: task.size,
      completedFiles,
      totalFiles,
    });
  };

  // Phase 1: Bounded concurrent upload of all immutable objects.
  // Any error aborts Phase 1 and prevents Phase 2 from running.
  let nextIdx = 0;
  const runPhase1Worker = async (): Promise<void> => {
    while (true) {
      options.signal?.throwIfAborted?.();
      const idx = nextIdx;
      if (idx >= phase1Tasks.length) return;
      nextIdx += 1;
      await executeTask(phase1Tasks[idx]!);
    }
  };
  const workerCount = Math.min(concurrency, Math.max(1, phase1Tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => runPhase1Worker()));

  // Phase 2: Sequential upload of mutable files, with latest.json strictly last per package.
  for (const task of phase2Tasks) {
    await executeTask(task);
  }

  const manifestUrls = verifiedList.map(({ routePrefix }) => {
    const rel = routePrefix ? `${routePrefix}/latest.json` : "latest.json";
    return client.resolvePublicUrl(rel);
  });

  return {
    bucket: client.target.bucket,
    region: client.target.region,
    keyPrefix: client.target.keyPrefix,
    publicBaseUrl: client.target.publicBaseUrl,
    dryRun,
    uploadedFiles,
    skippedFiles,
    uploadedBytes,
    skippedBytes,
    files: records,
    manifestUrls,
    publishedAt: new Date().toISOString(),
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function rebaseStudioHostDescriptorForCos(
  descriptor: Record<string, unknown>,
  publicBaseUrl: string,
  slot: "test" | "stable",
): Record<string, unknown> {
  const cleanBase = publicBaseUrl.replace(/\/+$/g, "");
  const channelBaseUrl = `${cleanBase}/${slot}`;
  const isHttps = cleanBase.toLowerCase().startsWith("https://");

  const replaceUrlValue = (value: unknown): unknown => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        if (
          /^(?:\/(?:test|stable))?\/pocket\//.test(parsed.pathname) ||
          /^\/(?:test|stable)(?:\/)?$/.test(parsed.pathname) ||
          /^\/updates\//.test(parsed.pathname) ||
          /^\/releases\//.test(parsed.pathname)
        ) {
          return `${cleanBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        return value;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(replaceUrlValue);
    }
    if (isObjectRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (
          isHttps &&
          (k === "POCKET_UPDATE_DEBUG_HTTP_HOST" || k === "debugHttpHosts")
        ) {
          continue;
        }
        out[k] = replaceUrlValue(v);
      }
      return out;
    }
    return value;
  };

  const rebased = replaceUrlValue(structuredClone(descriptor)) as Record<string, unknown>;
  if (typeof rebased.POCKET_UPDATE_BASE_URL === "string") {
    rebased.POCKET_UPDATE_BASE_URL = channelBaseUrl;
  }
  if (isObjectRecord(rebased.updates)) {
    rebased.updates.baseUrl = channelBaseUrl;
    if (isHttps) {
      delete rebased.updates.debugHttpHosts;
    }
  }
  if (isObjectRecord(rebased.config) && isObjectRecord(rebased.config.updates)) {
    rebased.config.updates.baseUrl = channelBaseUrl;
    if (isHttps) {
      delete rebased.config.updates.debugHttpHosts;
    }
  }
  if (isObjectRecord(rebased.applications)) {
    for (const app of Object.values(rebased.applications)) {
      if (!isObjectRecord(app)) continue;
      if (isObjectRecord(app.config) && isObjectRecord(app.config.updates)) {
        app.config.updates.baseUrl = channelBaseUrl;
        if (isHttps) {
          delete app.config.updates.debugHttpHosts;
        }
      }
    }
  }
  if (isHttps) {
    delete rebased.POCKET_UPDATE_DEBUG_HTTP_HOST;
  }
  return rebased;
}

export type PublishStudioVersionOptions = {
  client: CosClient;
  updatesDir: string;
  projectId: string;
  rootAppId: string;
  entry: PublishedVersion;
  reusedEntries?: Array<{ ownerProjectId: string; entry: PublishedVersion }>;
  previouslyCosPublishedEntries?: PublishedVersion[];
  publicKey?: string | Buffer;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: CosUploadProgress) => void;
};

export async function publishStudioVersionToCos(
  options: PublishStudioVersionOptions,
): Promise<CosPublishSummary> {
  const { client, entry } = options;
  const updatesDir = resolve(options.updatesDir);
  const concurrency = Math.max(1, Math.min(16, options.concurrency ?? 4));
  const slot = entry.slot;
  const channel = entry.channel;
  const hostVersion = entry.hostVersion;

  type PackageToUpload = {
    projectId: string;
    releaseEntry: PublishedVersion;
    pkgId: string;
    version: string;
    build: number;
    packageDir: string;
    verified: VerifiedLocalPackage;
    rebasedHostBytes: Uint8Array;
  };

  const packagesToUpload: PackageToUpload[] = [];
  const seenReleasePkg = new Set<string>();

  const addEntryPackages = (
    ownerProjectId: string,
    releaseEntry: PublishedVersion,
    filterPackageIds?: Set<string>,
  ) => {
    for (const pkg of releaseEntry.packages) {
      if (filterPackageIds && !filterPackageIds.has(pkg.id)) continue;
      const key = `${releaseEntry.hostVersion}/${pkg.id}/${releaseEntry.releaseId}`;
      if (seenReleasePkg.has(key)) continue;
      seenReleasePkg.add(key);

      if (!pkg.artifactRoot || isAbsolute(pkg.artifactRoot)) {
        throw new Error(`Invalid package artifactRoot outside updatesDir: ${pkg.artifactRoot}`);
      }
      const packageDir = resolve(updatesDir, pkg.artifactRoot);
      const relPackageDir = relative(updatesDir, packageDir);
      if (
        !relPackageDir ||
        relPackageDir.startsWith("..") ||
        isAbsolute(relPackageDir) ||
        relPackageDir.split(/[\\/]+/).includes("..")
      ) {
        throw new Error(`Invalid package artifactRoot outside updatesDir: ${pkg.artifactRoot}`);
      }
      const verified = verifyLocalPackageDirectory(packageDir, options.publicKey);
      const hostPath = join(packageDir, "host.json");
      let rebasedHostBytes = new Uint8Array(0);
      if (existsSync(hostPath)) {
        const rawHost = JSON.parse(
          new TextDecoder().decode(readVerifiedRegularFile(hostPath, "host.json")),
        ) as Record<string, unknown>;
        const rebasedHost = rebaseStudioHostDescriptorForCos(
          rawHost,
          client.target.publicBaseUrl,
          slot,
        );
        rebasedHostBytes = new TextEncoder().encode(
          JSON.stringify(rebasedHost, null, 2) + "\n",
        );
      }

      packagesToUpload.push({
        projectId: ownerProjectId,
        releaseEntry,
        pkgId: pkg.id,
        version: pkg.version,
        build: pkg.build,
        packageDir,
        verified,
        rebasedHostBytes,
      });
    }
  };

  addEntryPackages(options.projectId, entry);

  if (options.reusedEntries && entry.reusedPackages) {
    const reusedMap = new Map<string, Set<string>>();
    for (const rp of entry.reusedPackages) {
      const k = `${rp.ownerProjectId}\n${rp.releaseId}`;
      const set = reusedMap.get(k) ?? new Set<string>();
      set.add(rp.id);
      reusedMap.set(k, set);
    }
    for (const reused of options.reusedEntries) {
      const k = `${reused.ownerProjectId}\n${reused.entry.releaseId}`;
      const filter = reusedMap.get(k);
      addEntryPackages(reused.ownerProjectId, reused.entry, filter);
    }
  }

  type UploadItem = {
    phase: "phase1" | "phase2";
    relativeKey: string;
    bytes: Uint8Array;
    size: number;
    sha256: string;
    contentType: string;
    cacheControl: string;
    deduplicate: boolean;
  };

  const phase1Items: UploadItem[] = [];
  for (const item of packagesToUpload) {
    const immutablePrefix = `pocket/${item.releaseEntry.hostVersion}/${item.pkgId}/${item.releaseEntry.releaseId}`;
    for (const file of item.verified.immutableFiles) {
      phase1Items.push({
        phase: "phase1",
        relativeKey: `${immutablePrefix}/${file.relativePath}`,
        bytes: file.bytes,
        size: file.size,
        sha256: file.sha256,
        contentType: file.contentType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        deduplicate: file.deduplicate,
      });
    }
    for (const file of item.verified.mutableFiles) {
      if (file.relativePath === "host.json") continue;
      phase1Items.push({
        phase: "phase1",
        relativeKey: `${immutablePrefix}/${file.relativePath}`,
        bytes: file.bytes,
        size: file.size,
        sha256: file.sha256,
        contentType: file.contentType,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        deduplicate: false,
      });
    }
    if (item.rebasedHostBytes.byteLength > 0) {
      phase1Items.push({
        phase: "phase1",
        relativeKey: `${immutablePrefix}/host.json`,
        bytes: item.rebasedHostBytes,
        size: item.rebasedHostBytes.byteLength,
        sha256: sha256Hex(item.rebasedHostBytes),
        contentType: "application/json; charset=utf-8",
        cacheControl: IMMUTABLE_CACHE_CONTROL,
        deduplicate: false,
      });
    }
  }

  // Build Phase 2 static package indexes (`${slot}/pocket/${hostVersion}/${pkgId}/latest.json`).
  // Mini-apps are uploaded first; root SystemUI package is uploaded VERY LAST.
  const allHistoryEntries: PublishedVersion[] = [entry];
  for (const prior of options.previouslyCosPublishedEntries ?? []) {
    if (
      prior.hostVersion === hostVersion &&
      prior.slot === slot &&
      !allHistoryEntries.some((e) => e.releaseId === prior.releaseId)
    ) {
      allHistoryEntries.push(prior);
    }
  }

  const orderedIndexPackages = [...packagesToUpload].sort((a, b) => {
    const aIsRoot = a.pkgId === options.rootAppId ? 1 : 0;
    const bIsRoot = b.pkgId === options.rootAppId ? 1 : 0;
    if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
    return a.pkgId.localeCompare(b.pkgId);
  });

  const phase2Items: UploadItem[] = [];
  const seenIndexPkg = new Set<string>();

  for (const item of orderedIndexPackages) {
    if (seenIndexPkg.has(item.pkgId)) continue;
    seenIndexPkg.add(item.pkgId);

    const candidateEntries =
      item.projectId === options.projectId ? allHistoryEntries : [item.releaseEntry];

    const records: Array<Record<string, unknown>> = [];
    for (const histEntry of candidateEntries) {
      const pkgRecord = histEntry.packages.find((p) => p.id === item.pkgId);
      if (!pkgRecord) continue;

      let payloadSha256: string | undefined;
      if (
        histEntry.releaseId === item.releaseEntry.releaseId &&
        item.pkgId === item.verified.payload.appId
      ) {
        payloadSha256 = item.verified.payloadSha256;
      } else {
        try {
          const histDir = resolve(updatesDir, pkgRecord.artifactRoot);
          const relHistDir = relative(updatesDir, histDir);
          if (
            !isAbsolute(pkgRecord.artifactRoot) &&
            relHistDir &&
            !relHistDir.startsWith("..") &&
            !isAbsolute(relHistDir) &&
            !relHistDir.split(/[\\/]+/).includes("..")
          ) {
            const envPath = join(histDir, "latest.json");
            if (existsSync(envPath)) {
              const envJson = JSON.parse(readFileSync(envPath, "utf8")) as SignedManifest;
              if (typeof envJson.payload === "string") {
                payloadSha256 = sha256Hex(Buffer.from(envJson.payload, "base64"));
              }
            }
          }
        } catch {
          // Ignore unreadable historical envelope.
        }
      }

      const encodedPkg = encodeURIComponent(item.pkgId);
      const recordReleaseId = histEntry.releaseId;
      records.push({
        id: item.pkgId,
        version: pkgRecord.version,
        build: pkgRecord.build,
        releaseId: recordReleaseId,
        channel: histEntry.channel,
        slot: histEntry.slot,
        compatVersion: histEntry.compatVersion ?? histEntry.version,
        routeVersion: histEntry.routeVersion ?? histEntry.version,
        packageVersion: histEntry.packageVersion,
        publishedAt: histEntry.publishedAt,
        manifestUrl: `../../../../pocket/${hostVersion}/${encodedPkg}/${recordReleaseId}/latest.json`,
        hostConfigUrl: `../../../../pocket/${hostVersion}/${encodedPkg}/${recordReleaseId}/host.json`,
        archiveUrl: null,
        ...(payloadSha256 ? { payloadSha256 } : {}),
        rootPayloadSha256: histEntry.payloadSha256,
      });
    }

    const latestRecord = records[0];
    if (!latestRecord) continue;

    const indexDoc = {
      schemaVersion: 1,
      kind: "pocket-editor-package-index",
      projectId: item.projectId,
      hostVersion,
      rootAppId: options.rootAppId,
      systemUI: options.rootAppId,
      packageId: item.pkgId,
      slot,
      channel,
      compatVersion: item.releaseEntry.compatVersion ?? item.releaseEntry.version,
      latest: latestRecord,
      versions: records,
    };

    const indexBytes = new TextEncoder().encode(JSON.stringify(indexDoc, null, 2) + "\n");
    phase2Items.push({
      phase: "phase2",
      relativeKey: `${slot}/pocket/${hostVersion}/${item.pkgId}/latest.json`,
      bytes: indexBytes,
      size: indexBytes.byteLength,
      sha256: sha256Hex(indexBytes),
      contentType: "application/json; charset=utf-8",
      cacheControl: MUTABLE_CACHE_CONTROL,
      deduplicate: false,
    });
  }

  const totalFiles = phase1Items.length + phase2Items.length;
  let completedFiles = 0;
  let uploadedFiles = 0;
  let skippedFiles = 0;
  let uploadedBytes = 0;
  let skippedBytes = 0;

  const runItem = async (task: UploadItem): Promise<void> => {
    options.signal?.throwIfAborted?.();
    const objectKey = client.resolveObjectKey(task.relativeKey);
    let action: "uploaded" | "skipped" = "uploaded";

    if (task.deduplicate) {
      const head = await client.headObject(task.relativeKey, options.signal);
      if (
        head.exists &&
        head.size === task.size &&
        (!head.sha256 || head.sha256.toLowerCase() === task.sha256.toLowerCase())
      ) {
        action = "skipped";
      }
    }

    if (action === "uploaded") {
      await client.uploadFile(task.relativeKey, task.bytes, {
        contentType: task.contentType,
        cacheControl: task.cacheControl,
        sha256: task.sha256,
        signal: options.signal,
      });
    }

    completedFiles += 1;
    if (action === "skipped") {
      skippedFiles += 1;
      skippedBytes += task.size;
    } else {
      uploadedFiles += 1;
      uploadedBytes += task.size;
    }

    options.onProgress?.({
      phase: task.phase,
      relativeKey: task.relativeKey,
      objectKey,
      action,
      bytes: task.size,
      completedFiles,
      totalFiles,
    });
  };

  let p1Index = 0;
  const phase1Worker = async (): Promise<void> => {
    while (true) {
      options.signal?.throwIfAborted?.();
      const current = p1Index;
      if (current >= phase1Items.length) return;
      p1Index += 1;
      await runItem(phase1Items[current]!);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, phase1Items.length)) },
      () => phase1Worker(),
    ),
  );

  // Phase 2 runs strictly after all Phase 1 uploads complete with zero errors.
  for (const task of phase2Items) {
    await runItem(task);
  }

  const appConfigUrl = client.resolvePublicUrl(
    `${slot}/pocket/${hostVersion}/${options.rootAppId}/latest.json`,
  );
  const hostConfigUrl = client.resolvePublicUrl(
    `pocket/${hostVersion}/${options.rootAppId}/${entry.releaseId}/host.json`,
  );

  return {
    appConfigUrl,
    hostConfigUrl,
    bucket: client.target.bucket,
    region: client.target.region,
    keyPrefix: client.target.keyPrefix,
    publicBaseUrl: client.target.publicBaseUrl,
    slot,
    channel,
    releaseId: entry.releaseId,
    version: entry.version,
    build: entry.build,
    uploadedFiles,
    skippedFiles,
    uploadedBytes,
    skippedBytes,
    publishedAt: new Date().toISOString(),
  };
}
