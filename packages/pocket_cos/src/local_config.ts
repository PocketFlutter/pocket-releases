import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  COS_BUCKET_PATTERN,
  COS_REGION_PATTERN,
  type CosBucketProfile,
  type CosCredentials,
  type LocalCosInspection,
} from "./types.ts";

const MAX_CONFIG_FILE_BYTES = 256 * 1024;
export const WORKSPACE_COS_CREDENTIALS_FILENAME = "cos-credentials.json";

export function maskSecretId(secretId: string): string {
  const s = typeof secretId === "string" ? secretId.trim() : "";
  if (!s) return "";
  if (s.length >= 8) {
    return `${s.slice(0, 4)}****${s.slice(-4)}`;
  }
  return `${s.slice(0, 2)}****`;
}

function stripInlineCommentAndUnquote(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]!;
    let out = "";
    let i = 1;
    while (i < trimmed.length) {
      const ch = trimmed[i]!;
      if (ch === "\\" && quote === '"' && i + 1 < trimmed.length) {
        out += trimmed[i + 1]!;
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && trimmed[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        break;
      }
      out += ch;
      i += 1;
    }
    return out.trim();
  }
  const hashIndex = trimmed.findIndex
    ? (() => {
        for (let i = 0; i < trimmed.length; i += 1) {
          if (trimmed[i] === "#" && (i === 0 || /\s/.test(trimmed[i - 1]!))) {
            return i;
          }
        }
        return -1;
      })()
    : -1;
  return (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).trim();
}

function inferRegionFromEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  const match = endpoint.match(/(?:^|\.)cos\.([a-z0-9][a-z0-9-]{1,47})\.myqcloud\.com$/i);
  return match?.[1]?.toLowerCase();
}

function normalizeEndpoint(endpoint?: string, protocol?: string): string | undefined {
  if (!endpoint || !endpoint.trim()) return undefined;
  const clean = endpoint.trim();
  if (/^https?:\/\//i.test(clean)) return clean.replace(/\/+$/g, "");
  const scheme = protocol?.toLowerCase() === "http" ? "http" : "https";
  return `${scheme}://${clean.replace(/\/+$/g, "")}`;
}

export type ParsedCosConfig = {
  credentials?: CosCredentials;
  buckets: CosBucketProfile[];
  protocol?: string;
};

export function parseCoscliYaml(text: string): ParsedCosConfig {
  const lines = text.split(/\r?\n/);
  let section: "none" | "cos" | "base" | "buckets" = "none";
  let cosIndent = -1;
  let subIndent = -1;

  let secretId = "";
  let secretKey = "";
  let sessionToken = "";
  let protocol = "";

  const rawBuckets: Array<Record<string, string>> = [];
  let currentBucket: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = rawLine.search(/\S/);

    if (indent === 0 && /^cos\s*:/.test(trimmed)) {
      section = "cos";
      cosIndent = 0;
      subIndent = -1;
      currentBucket = null;
      continue;
    }

    if (cosIndent >= 0 && indent <= cosIndent && !/^cos\s*:/.test(trimmed)) {
      section = "none";
      currentBucket = null;
    }

    if (section === "cos" || section === "base" || section === "buckets") {
      if ((subIndent < 0 || indent === subIndent) && /^base\s*:/.test(trimmed)) {
        section = "base";
        subIndent = indent;
        currentBucket = null;
        continue;
      }
      if ((subIndent < 0 || indent === subIndent) && /^buckets\s*:/.test(trimmed)) {
        section = "buckets";
        subIndent = indent;
        currentBucket = null;
        continue;
      }
      if (subIndent >= 0 && indent <= subIndent && !trimmed.startsWith("-")) {
        section = "cos";
        currentBucket = null;
      }
    }

    if (section === "base") {
      const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kv) {
        const key = kv[1]!.toLowerCase();
        const val = stripInlineCommentAndUnquote(kv[2]!);
        if (key === "secretid" || key === "secret_id") secretId = val;
        else if (key === "secretkey" || key === "secret_key") secretKey = val;
        else if (key === "sessiontoken" || key === "session_token" || key === "token") {
          sessionToken = val;
        } else if (key === "protocol" || key === "schema") {
          protocol = val;
        }
      }
      continue;
    }

    if (section === "buckets") {
      if (trimmed.startsWith("-")) {
        currentBucket = {};
        rawBuckets.push(currentBucket);
        const afterDash = trimmed.slice(1).trim();
        if (afterDash) {
          const kv = afterDash.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
          if (kv) {
            currentBucket[kv[1]!.toLowerCase()] = stripInlineCommentAndUnquote(kv[2]!);
          }
        }
        continue;
      }
      if (currentBucket) {
        const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          currentBucket[kv[1]!.toLowerCase()] = stripInlineCommentAndUnquote(kv[2]!);
        }
      }
    }
  }

  const buckets: CosBucketProfile[] = [];
  for (const item of rawBuckets) {
    const bucket = (item.name ?? item.bucket ?? "").trim();
    if (!COS_BUCKET_PATTERN.test(bucket)) continue;
    const rawEndpoint = item.endpoint?.trim();
    const region = (item.region ?? inferRegionFromEndpoint(rawEndpoint) ?? "").trim();
    if (!COS_REGION_PATTERN.test(region)) continue;
    const alias = item.alias?.trim();
    let endpoint: string | undefined;
    if (rawEndpoint) {
      if (/^cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(rawEndpoint)) {
        const scheme = protocol.toLowerCase() === "http" ? "http" : "https";
        endpoint = `${scheme}://${bucket}.${rawEndpoint}`;
      } else {
        endpoint = normalizeEndpoint(rawEndpoint, protocol);
      }
    }
    buckets.push({
      bucket,
      region,
      ...(alias ? { alias } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  }

  const credentials =
    secretId && secretKey
      ? {
          secretId,
          secretKey,
          ...(sessionToken ? { securityToken: sessionToken } : {}),
        }
      : undefined;

  return {
    ...(credentials ? { credentials } : {}),
    buckets,
    ...(protocol ? { protocol } : {}),
  };
}

export function parseCoscmdIni(text: string): ParsedCosConfig {
  const lines = text.split(/\r?\n/);
  let currentSection = "";
  let secretId = "";
  let secretKey = "";
  let token = "";
  let bucket = "";
  let region = "";
  let endpoint = "";
  let schema = "";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const secMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1]!.trim().toLowerCase();
      continue;
    }
    if (currentSection !== "common" && currentSection !== "") continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const val = stripInlineCommentAndUnquote(trimmed.slice(eqIndex + 1));
    if (key === "secret_id" || key === "secretid") secretId = val;
    else if (key === "secret_key" || key === "secretkey") secretKey = val;
    else if (key === "token" || key === "sessiontoken" || key === "session_token") token = val;
    else if (key === "bucket") bucket = val;
    else if (key === "region") region = val;
    else if (key === "endpoint") endpoint = val;
    else if (key === "schema" || key === "protocol") schema = val;
  }

  const resolvedRegion = region || inferRegionFromEndpoint(endpoint) || "";
  const buckets: CosBucketProfile[] = [];
  if (COS_BUCKET_PATTERN.test(bucket) && COS_REGION_PATTERN.test(resolvedRegion)) {
    let formattedEndpoint: string | undefined;
    if (endpoint) {
      if (/^cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(endpoint)) {
        const scheme = schema.toLowerCase() === "http" ? "http" : "https";
        formattedEndpoint = `${scheme}://${bucket}.${endpoint}`;
      } else {
        formattedEndpoint = normalizeEndpoint(endpoint, schema);
      }
    }
    buckets.push({
      bucket,
      region: resolvedRegion,
      ...(formattedEndpoint ? { endpoint: formattedEndpoint } : {}),
    });
  }

  const credentials =
    secretId && secretKey
      ? {
          secretId,
          secretKey,
          ...(token ? { securityToken: token } : {}),
        }
      : undefined;

  return {
    ...(credentials ? { credentials } : {}),
    buckets,
    ...(schema ? { protocol: schema } : {}),
  };
}

function readSafeConfigFile(filePath: string): string | undefined {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return undefined;
  if (stat.size <= 0 || stat.size > MAX_CONFIG_FILE_BYTES) return undefined;
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export type LocalCosOptions = {
  env?: NodeJS.ProcessEnv;
  workspaceKeysDir?: string;
  homeDir?: string;
  coscliPath?: string;
  coscmdPath?: string;
};

type WorkspaceCredentialsData = {
  secretId?: string;
  secretKey?: string;
  securityToken?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  buckets?: CosBucketProfile[];
};

function readEnvSource(env: NodeJS.ProcessEnv): {
  credentials?: CosCredentials;
  buckets: CosBucketProfile[];
  detail?: string;
} {
  const idPairs: Array<[string, string]> = [
    ["POCKET_COS_SECRET_ID", "POCKET_COS_SECRET_KEY"],
    ["TENCENT_COS_SECRET_ID", "TENCENT_COS_SECRET_KEY"],
    ["TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY"],
    ["COS_SECRET_ID", "COS_SECRET_KEY"],
  ];
  let secretId = "";
  let secretKey = "";
  let detail = "";
  for (const [idKey, secretKeyName] of idPairs) {
    const idVal = env[idKey]?.trim();
    const keyVal = env[secretKeyName]?.trim();
    if (idVal && keyVal) {
      secretId = idVal;
      secretKey = keyVal;
      detail = `Environment variables (${idKey})`;
      break;
    }
  }
  const securityToken = (
    env.POCKET_COS_SECURITY_TOKEN ??
    env.TENCENT_COS_SECURITY_TOKEN ??
    env.TENCENTCLOUD_SESSION_TOKEN ??
    env.TENCENTCLOUD_SECURITY_TOKEN ??
    env.COS_SECURITY_TOKEN ??
    env.COS_TOKEN ??
    ""
  ).trim();

  const envBucket = (
    env.POCKET_COS_BUCKET ??
    env.TENCENT_COS_BUCKET ??
    env.COS_BUCKET ??
    ""
  ).trim();
  const envRegion = (
    env.POCKET_COS_REGION ??
    env.TENCENT_COS_REGION ??
    env.COS_REGION ??
    ""
  ).trim();
  const envEndpoint = (
    env.POCKET_COS_ENDPOINT ??
    env.TENCENT_COS_ENDPOINT ??
    env.COS_ENDPOINT ??
    ""
  ).trim();
  const buckets: CosBucketProfile[] = [];
  if (COS_BUCKET_PATTERN.test(envBucket) && COS_REGION_PATTERN.test(envRegion)) {
    buckets.push({
      bucket: envBucket,
      region: envRegion,
      ...(envEndpoint ? { endpoint: normalizeEndpoint(envEndpoint) } : {}),
    });
  }

  return {
    ...(secretId && secretKey
      ? {
          credentials: {
            secretId,
            secretKey,
            ...(securityToken ? { securityToken } : {}),
          },
          detail,
        }
      : {}),
    buckets,
  };
}

function readWorkspaceSource(workspaceKeysDir?: string): {
  credentials?: CosCredentials;
  buckets: CosBucketProfile[];
  detail?: string;
} {
  if (!workspaceKeysDir) return { buckets: [] };
  let dirStat: ReturnType<typeof lstatSync> | undefined;
  try {
    dirStat = lstatSync(workspaceKeysDir);
  } catch {
    dirStat = undefined;
  }
  if (dirStat && dirStat.isSymbolicLink()) return { buckets: [] };
  const filePath = join(resolve(workspaceKeysDir), WORKSPACE_COS_CREDENTIALS_FILENAME);
  const raw = readSafeConfigFile(filePath);
  if (!raw) return { buckets: [] };
  let parsed: WorkspaceCredentialsData;
  try {
    parsed = JSON.parse(raw) as WorkspaceCredentialsData;
  } catch {
    return { buckets: [] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { buckets: [] };
  }
  const secretId = typeof parsed.secretId === "string" ? parsed.secretId.trim() : "";
  const secretKey = typeof parsed.secretKey === "string" ? parsed.secretKey.trim() : "";
  const securityToken =
    typeof parsed.securityToken === "string" ? parsed.securityToken.trim() : "";

  const buckets: CosBucketProfile[] = [];
  if (
    typeof parsed.bucket === "string" &&
    typeof parsed.region === "string" &&
    COS_BUCKET_PATTERN.test(parsed.bucket.trim()) &&
    COS_REGION_PATTERN.test(parsed.region.trim())
  ) {
    buckets.push({
      bucket: parsed.bucket.trim(),
      region: parsed.region.trim(),
      ...(typeof parsed.endpoint === "string" && parsed.endpoint.trim()
        ? { endpoint: normalizeEndpoint(parsed.endpoint.trim()) }
        : {}),
    });
  }
  if (Array.isArray(parsed.buckets)) {
    for (const item of parsed.buckets) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.bucket === "string" &&
        typeof item.region === "string" &&
        COS_BUCKET_PATTERN.test(item.bucket.trim()) &&
        COS_REGION_PATTERN.test(item.region.trim())
      ) {
        buckets.push({
          bucket: item.bucket.trim(),
          region: item.region.trim(),
          ...(typeof item.alias === "string" && item.alias.trim()
            ? { alias: item.alias.trim() }
            : {}),
          ...(typeof item.endpoint === "string" && item.endpoint.trim()
            ? { endpoint: normalizeEndpoint(item.endpoint.trim()) }
            : {}),
        });
      }
    }
  }

  return {
    ...(secretId && secretKey
      ? {
          credentials: {
            secretId,
            secretKey,
            ...(securityToken ? { securityToken } : {}),
          },
          detail: "Studio workspace credentials",
        }
      : {}),
    buckets,
  };
}

function deduplicateBuckets(lists: CosBucketProfile[][]): CosBucketProfile[] {
  const seen = new Map<string, CosBucketProfile>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.bucket}@${item.region}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { ...item });
      } else {
        if (!existing.alias && item.alias) existing.alias = item.alias;
        if (!existing.endpoint && item.endpoint) existing.endpoint = item.endpoint;
      }
    }
  }
  return [...seen.values()];
}

function resolveAllSources(options: LocalCosOptions = {}): {
  inspection: LocalCosInspection;
  credentials?: CosCredentials;
} {
  const env = options.env ?? process.env;
  const home = options.homeDir ?? homedir();

  const envResult = readEnvSource(env);
  const workspaceResult = readWorkspaceSource(options.workspaceKeysDir);

  const coscliCandidates = [
    options.coscliPath,
    env.POCKET_COS_CONFIG_YAML?.trim(),
    join(home, ".cos.yaml"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  let coscliResult: ParsedCosConfig & { detail?: string } = { buckets: [] };
  for (const candidate of new Set(coscliCandidates)) {
    const text = readSafeConfigFile(candidate);
    if (!text) continue;
    const parsed = parseCoscliYaml(text);
    if (parsed.credentials || parsed.buckets.length > 0) {
      coscliResult = {
        ...parsed,
        detail: `coscli config (${candidate})`,
      };
      break;
    }
  }

  const coscmdCandidates = [
    options.coscmdPath,
    env.POCKET_COS_CONFIG_CONF?.trim(),
    join(home, ".cos.conf"),
    ...(process.platform === "win32" ? [join(home, "Documents", ".cos.conf")] : []),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  let coscmdResult: ParsedCosConfig & { detail?: string } = { buckets: [] };
  for (const candidate of new Set(coscmdCandidates)) {
    const text = readSafeConfigFile(candidate);
    if (!text) continue;
    const parsed = parseCoscmdIni(text);
    if (parsed.credentials || parsed.buckets.length > 0) {
      coscmdResult = {
        ...parsed,
        detail: `coscmd config (${candidate})`,
      };
      break;
    }
  }

  const discoveredBuckets = deduplicateBuckets([
    envResult.buckets,
    workspaceResult.buckets,
    coscliResult.buckets,
    coscmdResult.buckets,
  ]);
  const defaultBucket = discoveredBuckets[0];

  if (envResult.credentials) {
    return {
      credentials: envResult.credentials,
      inspection: {
        available: true,
        source: "env",
        sourceDetail: envResult.detail ?? "Environment variables",
        maskedSecretId: maskSecretId(envResult.credentials.secretId),
        hasSecurityToken: Boolean(envResult.credentials.securityToken),
        discoveredBuckets,
        ...(defaultBucket ? { defaultBucket } : {}),
      },
    };
  }

  if (workspaceResult.credentials) {
    return {
      credentials: workspaceResult.credentials,
      inspection: {
        available: true,
        source: "workspace",
        sourceDetail: workspaceResult.detail ?? "Studio workspace credentials",
        maskedSecretId: maskSecretId(workspaceResult.credentials.secretId),
        hasSecurityToken: Boolean(workspaceResult.credentials.securityToken),
        discoveredBuckets,
        ...(defaultBucket ? { defaultBucket } : {}),
      },
    };
  }

  if (coscliResult.credentials) {
    return {
      credentials: coscliResult.credentials,
      inspection: {
        available: true,
        source: "coscli",
        sourceDetail: coscliResult.detail ?? "coscli (~/.cos.yaml)",
        maskedSecretId: maskSecretId(coscliResult.credentials.secretId),
        hasSecurityToken: Boolean(coscliResult.credentials.securityToken),
        discoveredBuckets,
        ...(defaultBucket ? { defaultBucket } : {}),
      },
    };
  }

  if (coscmdResult.credentials) {
    return {
      credentials: coscmdResult.credentials,
      inspection: {
        available: true,
        source: "coscmd",
        sourceDetail: coscmdResult.detail ?? "coscmd (~/.cos.conf)",
        maskedSecretId: maskSecretId(coscmdResult.credentials.secretId),
        hasSecurityToken: Boolean(coscmdResult.credentials.securityToken),
        discoveredBuckets,
        ...(defaultBucket ? { defaultBucket } : {}),
      },
    };
  }

  return {
    inspection: {
      available: false,
      source: "none",
      sourceDetail: "No local COS credentials found",
      hasSecurityToken: false,
      discoveredBuckets,
      ...(defaultBucket ? { defaultBucket } : {}),
    },
  };
}

export function inspectLocalCosEnvironment(options: LocalCosOptions = {}): LocalCosInspection {
  return resolveAllSources(options).inspection;
}

export function resolveLocalCosCredentials(options: LocalCosOptions = {}): {
  credentials: CosCredentials;
  inspection: LocalCosInspection;
} {
  const { credentials, inspection } = resolveAllSources(options);
  if (!credentials) {
    throw new Error(
      "Tencent Cloud COS credentials were not found in environment variables, workspace keys, ~/.cos.yaml, or ~/.cos.conf",
    );
  }
  return { credentials, inspection };
}

export type WorkspaceCosCredentialsInput = {
  secretId: string;
  secretKey: string;
  securityToken?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
};

export function writeWorkspaceCosCredentials(
  workspaceKeysDir: string,
  data: WorkspaceCosCredentialsInput,
): string {
  const secretId = typeof data.secretId === "string" ? data.secretId.trim() : "";
  const secretKey = typeof data.secretKey === "string" ? data.secretKey.trim() : "";
  const securityToken =
    typeof data.securityToken === "string" ? data.securityToken.trim() : "";
  if (!secretId || !secretKey) {
    throw new Error("secretId and secretKey are required to save workspace COS credentials");
  }

  const resolvedDir = resolve(workspaceKeysDir);
  if (existsSync(resolvedDir)) {
    const dirStat = lstatSync(resolvedDir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
      throw new Error("workspace keys directory must be a real non-symlink directory");
    }
  } else {
    mkdirSync(resolvedDir, { recursive: true, mode: 0o700 });
  }

  const targetPath = join(resolvedDir, WORKSPACE_COS_CREDENTIALS_FILENAME);
  try {
    const existingStat = lstatSync(targetPath);
    if (existingStat.isSymbolicLink()) {
      throw new Error("refusing to write COS credentials over a symbolic link");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const payload: Record<string, string> = {
    secretId,
    secretKey,
    ...(securityToken ? { securityToken } : {}),
    ...(data.bucket?.trim() ? { bucket: data.bucket.trim() } : {}),
    ...(data.region?.trim() ? { region: data.region.trim() } : {}),
    ...(data.endpoint?.trim() ? { endpoint: data.endpoint.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };

  const tempPath = join(
    dirname(targetPath),
    `.${WORKSPACE_COS_CREDENTIALS_FILENAME}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tempPath, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
    try {
      chmodSync(tempPath, 0o600);
    } catch {
      // Ignore chmod errors on platforms without POSIX mode bits.
    }
    renameSync(tempPath, targetPath);
    try {
      chmodSync(targetPath, 0o600);
    } catch {
      // Ignore chmod errors on platforms without POSIX mode bits.
    }
  } finally {
    rmSync(tempPath, { force: true });
  }
  return targetPath;
}

export function clearWorkspaceCosCredentials(workspaceKeysDir: string): boolean {
  const resolvedDir = resolve(workspaceKeysDir);
  try {
    const dirStat = lstatSync(resolvedDir);
    if (dirStat.isSymbolicLink()) {
      throw new Error("workspace keys directory must not be a symbolic link");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }

  const targetPath = join(resolvedDir, WORKSPACE_COS_CREDENTIALS_FILENAME);
  let fileStat: ReturnType<typeof lstatSync>;
  try {
    fileStat = lstatSync(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (fileStat.isSymbolicLink()) {
    throw new Error("refusing to delete symbolic link for workspace COS credentials");
  }
  rmSync(targetPath, { force: true });
  return true;
}
