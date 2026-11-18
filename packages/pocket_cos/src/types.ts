export type CosCredentials = {
  secretId: string;
  secretKey: string;
  securityToken?: string;
};

export type CosCredentialProvider =
  | CosCredentials
  | (() => CosCredentials | Promise<CosCredentials>);

export type CosBucketProfile = {
  bucket: string;
  region: string;
  alias?: string;
  endpoint?: string;
};

export type CosTargetConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  keyPrefix?: string;
  publicBaseUrl?: string;
  allowInsecureHttpForTesting?: boolean;
};

export type ResolvedCosTarget = {
  bucket: string;
  region: string;
  endpoint: string;
  endpointOrigin: string;
  endpointHost: string;
  keyPrefix: string;
  publicBaseUrl: string;
  allowInsecureHttpForTesting: boolean;
};

export type EditorProjectCosConfig = {
  enabled: boolean;
  syncOnPublish?: boolean;
  bucket?: string;
  region?: string;
  keyPrefix?: string;
  publicBaseUrl?: string;
};

export type LocalCosInspection = {
  available: boolean;
  source: "env" | "workspace" | "coscli" | "coscmd" | "none";
  sourceDetail: string;
  maskedSecretId?: string;
  hasSecurityToken: boolean;
  discoveredBuckets: CosBucketProfile[];
  defaultBucket?: CosBucketProfile;
};

export type CosUploadProgress = {
  phase: "phase1" | "phase2";
  relativeKey: string;
  objectKey: string;
  action: "uploaded" | "skipped";
  bytes: number;
  completedFiles: number;
  totalFiles: number;
};

export type CosPublishFileRecord = {
  relativeKey: string;
  objectKey: string;
  size: number;
  sha256: string;
  cacheControl: string;
  contentType: string;
  phase: "phase1" | "phase2";
  action: "uploaded" | "skipped";
};

export type CosPublishResult = {
  bucket: string;
  region: string;
  keyPrefix: string;
  publicBaseUrl: string;
  dryRun: boolean;
  uploadedFiles: number;
  skippedFiles: number;
  uploadedBytes: number;
  skippedBytes: number;
  files: CosPublishFileRecord[];
  manifestUrls: string[];
  publishedAt: string;
};

export type CosPublishSummary = {
  appConfigUrl: string;
  hostConfigUrl: string;
  bucket: string;
  region: string;
  keyPrefix: string;
  publicBaseUrl: string;
  slot: "test" | "stable";
  channel: "test" | "release";
  releaseId: string;
  version: string;
  build: number;
  uploadedFiles: number;
  skippedFiles: number;
  uploadedBytes: number;
  skippedBytes: number;
  publishedAt: string;
};

export const COS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{0,61}-[0-9]{6,}$/;
export const COS_REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function validateCosBucket(bucket: string): string {
  const trimmed = typeof bucket === "string" ? bucket.trim() : "";
  if (!COS_BUCKET_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid COS bucket "${bucket}": must match <name>-<appid> (${COS_BUCKET_PATTERN.source})`,
    );
  }
  return trimmed;
}

export function validateCosRegion(region: string): string {
  const trimmed = typeof region === "string" ? region.trim() : "";
  if (!COS_REGION_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid COS region "${region}": must match ${COS_REGION_PATTERN.source}`,
    );
  }
  return trimmed;
}

export function normalizeCosKeyPrefix(raw?: string): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") {
    throw new Error("COS keyPrefix must be a string");
  }
  if (hasControlCharacter(raw)) {
    throw new Error("COS keyPrefix must not contain control characters");
  }
  if (raw.includes("\\")) {
    throw new Error("COS keyPrefix must not contain backslashes");
  }
  if (raw.includes("%")) {
    throw new Error("COS keyPrefix must not contain percent-encoded sequences");
  }
  if (raw.includes("?") || raw.includes("#")) {
    throw new Error("COS keyPrefix must not contain query or fragment characters");
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  if (trimmed.includes("//") && !/^\/+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^\/+|\/+$/g, "");
    if (stripped.includes("//")) {
      throw new Error("COS keyPrefix must not contain empty path segments");
    }
  }
  const stripped = trimmed.replace(/^\/+|\/+$/g, "");
  if (!stripped) return "";
  const segments = stripped.split("/");
  for (const segment of segments) {
    if (!segment || segment.trim() !== segment) {
      throw new Error("COS keyPrefix must not contain empty or whitespace-padded segments");
    }
    if (segment === "." || segment === "..") {
      throw new Error("COS keyPrefix must not contain '.' or '..' segments");
    }
    if (segment === "pocket") {
      throw new Error('COS keyPrefix must not contain a reserved "pocket" path segment');
    }
  }
  return segments.join("/");
}

export function resolveCosTarget(config: CosTargetConfig): ResolvedCosTarget {
  if (!config || typeof config !== "object") {
    throw new Error("COS target configuration is required");
  }
  const bucket = validateCosBucket(config.bucket);
  const region = validateCosRegion(config.region);
  const keyPrefix = normalizeCosKeyPrefix(config.keyPrefix);
  const allowInsecure = config.allowInsecureHttpForTesting === true;

  const rawEndpoint = config.endpoint?.trim()
    ? (/^https?:\/\//i.test(config.endpoint.trim())
        ? config.endpoint.trim()
        : `https://${config.endpoint.trim()}`)
    : `https://${bucket}.cos.${region}.myqcloud.com`;

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(rawEndpoint);
  } catch {
    throw new Error(`Invalid COS endpoint URL: ${rawEndpoint}`);
  }
  if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash) {
    throw new Error("COS endpoint must not include credentials, query, or hash");
  }
  if (endpointUrl.pathname !== "/" && endpointUrl.pathname !== "") {
    throw new Error("COS endpoint must be an origin without a path");
  }
  if (endpointUrl.protocol !== "https:" && !(allowInsecure && endpointUrl.protocol === "http:")) {
    throw new Error("COS endpoint must use https://");
  }

  const endpointOrigin = endpointUrl.origin;
  const endpointHost = endpointUrl.host;

  let publicBaseUrl: string;
  if (config.publicBaseUrl !== undefined && config.publicBaseUrl.trim() !== "") {
    const rawPublic = config.publicBaseUrl.trim();
    let parsedPublic: URL;
    try {
      parsedPublic = new URL(rawPublic);
    } catch {
      throw new Error(`Invalid COS publicBaseUrl: ${rawPublic}`);
    }
    if (parsedPublic.username || parsedPublic.password) {
      throw new Error("COS publicBaseUrl must not contain userinfo credentials");
    }
    if (parsedPublic.search || parsedPublic.hash) {
      throw new Error("COS publicBaseUrl must not contain query parameters or fragments");
    }
    if (
      parsedPublic.protocol !== "https:" &&
      !(allowInsecure && parsedPublic.protocol === "http:")
    ) {
      throw new Error("COS publicBaseUrl must use https://");
    }
    const cleanPath = parsedPublic.pathname.replace(/\/+$/g, "");
    const pathSegments = cleanPath.replace(/^\/+/g, "").split("/").filter(Boolean);
    if (pathSegments.includes("pocket")) {
      throw new Error('COS publicBaseUrl pathname must not contain a reserved "pocket" path segment');
    }
    publicBaseUrl = `${parsedPublic.origin}${cleanPath}`;
  } else {
    publicBaseUrl = `${endpointOrigin}${keyPrefix ? `/${keyPrefix}` : ""}`;
  }

  return {
    bucket,
    region,
    endpoint: endpointOrigin,
    endpointOrigin,
    endpointHost,
    keyPrefix,
    publicBaseUrl,
    allowInsecureHttpForTesting: allowInsecure,
  };
}
