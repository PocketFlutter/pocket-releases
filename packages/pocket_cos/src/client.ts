import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  camSafeUrlEncode,
  encodeCosObjectPath,
  signCosRequest,
} from "./sign.ts";
import {
  resolveCosTarget,
  type CosCredentialProvider,
  type CosCredentials,
  type CosTargetConfig,
  type ResolvedCosTarget,
} from "./types.ts";

export class CosError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { status?: number; code?: string; requestId?: string } = {},
  ) {
    super(message);
    this.name = "CosError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "CosError";
    this.requestId = options.requestId;
  }
}

export type CosHeadObjectResult =
  | { exists: false }
  | {
      exists: true;
      size: number;
      etag?: string;
      sha256?: string;
      contentType?: string;
      cacheControl?: string;
    };

export type CosPutObjectOptions = {
  contentType?: string;
  cacheControl?: string;
  sha256?: string;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
};

export type CosUploadFileOptions = CosPutObjectOptions & {
  onPartUploaded?: (info: {
    partNumber: number;
    totalParts: number;
    bytes: number;
  }) => void;
};

export type CosClientOptions = {
  target: CosTargetConfig;
  credentials: CosCredentialProvider;
  fetchImpl?: typeof fetch;
  multipartThresholdBytes?: number;
  partSizeBytes?: number;
  concurrency?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

export type CosClient = {
  readonly target: ResolvedCosTarget;
  resolveObjectKey(relativePath: string): string;
  resolvePublicUrl(relativePath: string): string;
  checkAccess(signal?: AbortSignal): Promise<{ ok: true; status: number }>;
  headObject(relativeKey: string, signal?: AbortSignal): Promise<CosHeadObjectResult>;
  putObject(
    relativeKey: string,
    bytes: Uint8Array,
    options?: CosPutObjectOptions,
  ): Promise<{ etag?: string; sha256: string; size: number }>;
  uploadFile(
    relativeKey: string,
    source: string | Uint8Array,
    options?: CosUploadFileOptions,
  ): Promise<{ etag?: string; sha256: string; size: number; multipart: boolean }>;
};

const DEFAULT_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
const DEFAULT_PART_SIZE_BYTES = 4 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 2;

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function validateRelativeObjectPath(relativePath: string): string {
  if (typeof relativePath !== "string") {
    throw new Error("COS relative object path must be a string");
  }
  if (hasControlChar(relativePath)) {
    throw new Error("COS object path must not contain control characters");
  }
  if (relativePath.includes("\\")) {
    throw new Error("COS object path must not contain backslashes");
  }
  if (relativePath.startsWith("/")) {
    throw new Error("COS relative object path must not start with '/'");
  }
  const trimmed = relativePath.replace(/\/+$/g, "");
  if (!trimmed) {
    throw new Error("COS relative object path must not be empty");
  }
  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error(`Unsafe COS object path segment in "${relativePath}"`);
    }
  }
  return segments.join("/");
}

function md5Base64(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("base64");
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractXmlTag(xml: string, tagName: string): string | undefined {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1]?.trim();
}

function redactSecrets(text: string, credentials: CosCredentials): string {
  let out = text;
  if (credentials.secretKey) {
    out = out.split(credentials.secretKey).join("[REDACTED]");
  }
  if (credentials.securityToken) {
    out = out.split(credentials.securityToken).join("[REDACTED]");
  }
  if (credentials.secretId) {
    out = out.split(credentials.secretId).join("[REDACTED_AK]");
  }
  return out;
}

function parseCosXmlError(
  status: number,
  bodyText: string,
  headers: Headers,
  credentials: CosCredentials,
  context: string,
): CosError {
  const code =
    extractXmlTag(bodyText, "Code") ??
    headers.get("x-cos-error-code") ??
    `HTTP_${status}`;
  const rawMessage =
    extractXmlTag(bodyText, "Message") ??
    headers.get("x-cos-error-message") ??
    `COS ${context} failed with HTTP ${status}`;
  const requestId =
    extractXmlTag(bodyText, "RequestId") ??
    headers.get("x-cos-request-id") ??
    undefined;
  const safeMessage = redactSecrets(`${context}: ${code} (${status}) - ${rawMessage}`, credentials);
  return new CosError(safeMessage, { status, code, requestId });
}

function buildQueryString(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (v === null || v === "") {
      parts.push(camSafeUrlEncode(k));
    } else {
      parts.push(`${camSafeUrlEncode(k)}=${camSafeUrlEncode(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function isRetryableStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export function createCosClient(options: CosClientOptions): CosClient {
  const target = resolveCosTarget(options.target);
  const fetchImpl = options.fetchImpl ?? fetch;
  const multipartThresholdBytes =
    options.multipartThresholdBytes ?? DEFAULT_MULTIPART_THRESHOLD_BYTES;
  const partSizeBytes = options.partSizeBytes ?? DEFAULT_PART_SIZE_BYTES;
  const concurrency = Math.max(1, Math.min(16, options.concurrency ?? DEFAULT_CONCURRENCY));
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? DEFAULT_MAX_RETRIES));
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 50;

  if (partSizeBytes <= 0 || !Number.isSafeInteger(partSizeBytes)) {
    throw new Error("partSizeBytes must be a positive integer");
  }
  if (multipartThresholdBytes <= 0 || !Number.isSafeInteger(multipartThresholdBytes)) {
    throw new Error("multipartThresholdBytes must be a positive integer");
  }

  const getCredentials = async (): Promise<CosCredentials> => {
    const resolved =
      typeof options.credentials === "function"
        ? await options.credentials()
        : options.credentials;
    if (!resolved?.secretId?.trim() || !resolved?.secretKey?.trim()) {
      throw new CosError("COS credentials are missing secretId or secretKey", {
        status: 401,
        code: "MissingCredentials",
      });
    }
    return {
      secretId: resolved.secretId.trim(),
      secretKey: resolved.secretKey.trim(),
      ...(resolved.securityToken?.trim()
        ? { securityToken: resolved.securityToken.trim() }
        : {}),
    };
  };

  const resolveObjectKey = (relativePath: string): string => {
    const cleanRel = validateRelativeObjectPath(relativePath);
    return target.keyPrefix ? `${target.keyPrefix}/${cleanRel}` : cleanRel;
  };

  const resolvePublicUrl = (relativePath: string): string => {
    const cleanRel = validateRelativeObjectPath(relativePath);
    const encodedRel = cleanRel
      .split("/")
      .map((s) => camSafeUrlEncode(s))
      .join("/");
    return `${target.publicBaseUrl}/${encodedRel}`;
  };

  const sendSignedRequest = async (input: {
    method: string;
    objectKey: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    headers?: Record<string, string | number | undefined>;
    body?: Uint8Array | string;
    idempotent: boolean;
    signal?: AbortSignal;
    context: string;
  }): Promise<{ response: Response; credentials: CosCredentials }> => {
    const credentials = await getCredentials();
    const pathname =
      input.objectKey === "/" || input.objectKey === ""
        ? "/"
        : encodeCosObjectPath(input.objectKey);
    const queryStr = buildQueryString(input.query);
    const url = `${target.endpointOrigin}${pathname}${queryStr}`;

    const bodyBytes =
      typeof input.body === "string"
        ? new TextEncoder().encode(input.body)
        : input.body;

    const baseHeaders: Record<string, string | number | undefined> = {
      Host: target.endpointHost,
      ...(bodyBytes !== undefined ? { "Content-Length": bodyBytes.byteLength } : {}),
      ...(input.headers ?? {}),
    };

    let attempt = 0;
    while (true) {
      input.signal?.throwIfAborted?.();
      const signed = signCosRequest({
        method: input.method,
        pathname,
        query: input.query,
        headers: baseHeaders,
        credentials,
      });

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: input.method.toUpperCase(),
          headers: signed.headers,
          body: bodyBytes ? Buffer.from(bodyBytes.buffer, bodyBytes.byteOffset, bodyBytes.byteLength) : undefined,
          signal: input.signal,
          redirect: "manual",
        });
      } catch (error) {
        if (input.signal?.aborted) throw error;
        if (input.idempotent && attempt < maxRetries) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, retryBaseDelayMs * attempt));
          continue;
        }
        const rawMsg = error instanceof Error ? error.message : String(error);
        throw new CosError(
          redactSecrets(`${input.context}: network error - ${rawMsg}`, credentials),
          { status: 0, code: "NetworkError" },
        );
      }

      if (input.idempotent && isRetryableStatus(response.status) && attempt < maxRetries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, retryBaseDelayMs * attempt));
        continue;
      }

      return { response, credentials };
    }
  };

  const checkAccess = async (signal?: AbortSignal): Promise<{ ok: true; status: number }> => {
    const { response, credentials } = await sendSignedRequest({
      method: "HEAD",
      objectKey: "/",
      idempotent: true,
      signal,
      context: "HeadBucket",
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status };
    }

    if (response.status === 403 && target.keyPrefix) {
      const probeKey = `${target.keyPrefix}/.pocket-cos-probe`;
      const probe = await sendSignedRequest({
        method: "HEAD",
        objectKey: probeKey,
        idempotent: true,
        signal,
        context: "HeadPrefixProbe",
      });
      const errCode = probe.response.headers.get("x-cos-error-code") ?? "";
      if (
        (probe.response.status === 200 || probe.response.status === 404) &&
        errCode !== "NoSuchBucket"
      ) {
        return { ok: true, status: probe.response.status };
      }
      const probeBody = await probe.response.text().catch(() => "");
      throw parseCosXmlError(
        probe.response.status,
        probeBody,
        probe.response.headers,
        credentials,
        "HeadPrefixProbe",
      );
    }

    const bodyText = await response.text().catch(() => "");
    throw parseCosXmlError(
      response.status,
      bodyText,
      response.headers,
      credentials,
      "HeadBucket",
    );
  };

  const headObject = async (
    relativeKey: string,
    signal?: AbortSignal,
  ): Promise<CosHeadObjectResult> => {
    const objectKey = resolveObjectKey(relativeKey);
    const { response, credentials } = await sendSignedRequest({
      method: "HEAD",
      objectKey,
      idempotent: true,
      signal,
      context: `HeadObject(${objectKey})`,
    });

    if (response.status === 404) {
      const errCode = response.headers.get("x-cos-error-code") ?? "";
      if (errCode === "NoSuchBucket") {
        throw parseCosXmlError(
          response.status,
          "",
          response.headers,
          credentials,
          `HeadObject(${objectKey})`,
        );
      }
      return { exists: false };
    }

    if (response.status >= 200 && response.status < 300) {
      const sizeHeader = response.headers.get("content-length");
      const size = sizeHeader !== null ? Number(sizeHeader) : 0;
      const rawEtag = response.headers.get("etag") ?? undefined;
      const etag = rawEtag ? rawEtag.replace(/^"|"$/g, "") : undefined;
      const sha256 = response.headers.get("x-cos-meta-sha256") ?? undefined;
      const contentType = response.headers.get("content-type") ?? undefined;
      const cacheControl = response.headers.get("cache-control") ?? undefined;
      return {
        exists: true,
        size: Number.isFinite(size) ? size : 0,
        ...(etag ? { etag } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(contentType ? { contentType } : {}),
        ...(cacheControl ? { cacheControl } : {}),
      };
    }

    const bodyText = await response.text().catch(() => "");
    throw parseCosXmlError(
      response.status,
      bodyText,
      response.headers,
      credentials,
      `HeadObject(${objectKey})`,
    );
  };

  const putObject = async (
    relativeKey: string,
    bytes: Uint8Array,
    putOptions: CosPutObjectOptions = {},
  ): Promise<{ etag?: string; sha256: string; size: number }> => {
    const objectKey = resolveObjectKey(relativeKey);
    const sha256 = putOptions.sha256 ?? sha256Hex(bytes);
    const contentMd5 = md5Base64(bytes);

    const headers: Record<string, string | number | undefined> = {
      "Content-Type": putOptions.contentType ?? "application/octet-stream",
      "Content-MD5": contentMd5,
      "x-cos-meta-sha256": sha256,
      ...(putOptions.cacheControl ? { "Cache-Control": putOptions.cacheControl } : {}),
    };
    if (putOptions.metadata) {
      for (const [k, v] of Object.entries(putOptions.metadata)) {
        const headerKey = k.toLowerCase().startsWith("x-cos-meta-")
          ? k.toLowerCase()
          : `x-cos-meta-${k.toLowerCase()}`;
        headers[headerKey] = v;
      }
    }

    const { response, credentials } = await sendSignedRequest({
      method: "PUT",
      objectKey,
      headers,
      body: bytes,
      idempotent: true,
      signal: putOptions.signal,
      context: `PutObject(${objectKey})`,
    });

    if (response.status < 200 || response.status >= 300) {
      const bodyText = await response.text().catch(() => "");
      throw parseCosXmlError(
        response.status,
        bodyText,
        response.headers,
        credentials,
        `PutObject(${objectKey})`,
      );
    }

    const rawEtag = response.headers.get("etag") ?? undefined;
    const etag = rawEtag ? rawEtag.replace(/^"|"$/g, "") : undefined;
    return {
      ...(etag ? { etag } : {}),
      sha256,
      size: bytes.byteLength,
    };
  };

  const uploadFile = async (
    relativeKey: string,
    source: string | Uint8Array,
    uploadOptions: CosUploadFileOptions = {},
  ): Promise<{ etag?: string; sha256: string; size: number; multipart: boolean }> => {
    const bytes =
      typeof source === "string" ? new Uint8Array(await readFile(source)) : source;
    const sha256 = uploadOptions.sha256 ?? sha256Hex(bytes);

    if (bytes.byteLength < multipartThresholdBytes) {
      const res = await putObject(relativeKey, bytes, {
        ...uploadOptions,
        sha256,
      });
      return { ...res, multipart: false };
    }

    const objectKey = resolveObjectKey(relativeKey);
    const initHeaders: Record<string, string | number | undefined> = {
      "Content-Type": uploadOptions.contentType ?? "application/octet-stream",
      "x-cos-meta-sha256": sha256,
      ...(uploadOptions.cacheControl
        ? { "Cache-Control": uploadOptions.cacheControl }
        : {}),
    };
    if (uploadOptions.metadata) {
      for (const [k, v] of Object.entries(uploadOptions.metadata)) {
        const headerKey = k.toLowerCase().startsWith("x-cos-meta-")
          ? k.toLowerCase()
          : `x-cos-meta-${k.toLowerCase()}`;
        initHeaders[headerKey] = v;
      }
    }

    const initResult = await sendSignedRequest({
      method: "POST",
      objectKey,
      query: { uploads: "" },
      headers: initHeaders,
      idempotent: false,
      signal: uploadOptions.signal,
      context: `InitiateMultipartUpload(${objectKey})`,
    });

    const initBody = await initResult.response.text().catch(() => "");
    if (initResult.response.status < 200 || initResult.response.status >= 300) {
      throw parseCosXmlError(
        initResult.response.status,
        initBody,
        initResult.response.headers,
        initResult.credentials,
        `InitiateMultipartUpload(${objectKey})`,
      );
    }

    const uploadId = extractXmlTag(initBody, "UploadId");
    if (!uploadId) {
      throw new CosError(
        `InitiateMultipartUpload(${objectKey}) did not return an <UploadId>`,
        { status: initResult.response.status, code: "InvalidResponse" },
      );
    }

    const abortMultipart = async (): Promise<void> => {
      try {
        await sendSignedRequest({
          method: "DELETE",
          objectKey,
          query: { uploadId },
          idempotent: true,
          context: `AbortMultipartUpload(${objectKey})`,
        });
      } catch {
        // Best-effort abort cleanup before rethrowing the primary error.
      }
    };

    try {
      const totalParts = Math.ceil(bytes.byteLength / partSizeBytes);
      const completedParts: Array<{ partNumber: number; etag: string }> = new Array(totalParts);
      let nextPartIndex = 0;

      const worker = async (): Promise<void> => {
        while (true) {
          uploadOptions.signal?.throwIfAborted?.();
          const currentIndex = nextPartIndex;
          if (currentIndex >= totalParts) return;
          nextPartIndex += 1;

          const partNumber = currentIndex + 1;
          const start = currentIndex * partSizeBytes;
          const end = Math.min(start + partSizeBytes, bytes.byteLength);
          const chunk = bytes.subarray(start, end);
          const partMd5 = md5Base64(chunk);

          const partResp = await sendSignedRequest({
            method: "PUT",
            objectKey,
            query: { partNumber, uploadId },
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-MD5": partMd5,
            },
            body: chunk,
            idempotent: true,
            signal: uploadOptions.signal,
            context: `UploadPart(${objectKey}, part=${partNumber})`,
          });

          if (partResp.response.status < 200 || partResp.response.status >= 300) {
            const errBody = await partResp.response.text().catch(() => "");
            throw parseCosXmlError(
              partResp.response.status,
              errBody,
              partResp.response.headers,
              partResp.credentials,
              `UploadPart(${objectKey}, part=${partNumber})`,
            );
          }

          const rawEtag = partResp.response.headers.get("etag") ?? "";
          const cleanEtag = rawEtag.replace(/^"|"$/g, "");
          if (!cleanEtag) {
            throw new CosError(
              `UploadPart(${objectKey}, part=${partNumber}) missing ETag response header`,
              { status: partResp.response.status, code: "MissingETag" },
            );
          }

          completedParts[currentIndex] = {
            partNumber,
            etag: `"${cleanEtag}"`,
          };
          uploadOptions.onPartUploaded?.({
            partNumber,
            totalParts,
            bytes: chunk.byteLength,
          });
        }
      };

      const workerCount = Math.min(concurrency, totalParts);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const sortedParts = [...completedParts].sort(
        (a, b) => a.partNumber - b.partNumber,
      );
      const xmlLines = ["<CompleteMultipartUpload>"];
      for (const part of sortedParts) {
        xmlLines.push(
          `  <Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`,
        );
      }
      xmlLines.push("</CompleteMultipartUpload>");
      const completeXml = xmlLines.join("\n");

      const completeResp = await sendSignedRequest({
        method: "POST",
        objectKey,
        query: { uploadId },
        headers: {
          "Content-Type": "application/xml",
        },
        body: completeXml,
        idempotent: false,
        signal: uploadOptions.signal,
        context: `CompleteMultipartUpload(${objectKey})`,
      });

      const completeBody = await completeResp.response.text().catch(() => "");
      if (
        completeResp.response.status < 200 ||
        completeResp.response.status >= 300 ||
        /<Error[\s>]/i.test(completeBody)
      ) {
        throw parseCosXmlError(
          completeResp.response.status,
          completeBody,
          completeResp.response.headers,
          completeResp.credentials,
          `CompleteMultipartUpload(${objectKey})`,
        );
      }

      const rawEtag =
        extractXmlTag(completeBody, "ETag") ??
        completeResp.response.headers.get("etag") ??
        undefined;
      const etag = rawEtag ? rawEtag.replace(/^"|"$/g, "") : undefined;

      return {
        ...(etag ? { etag } : {}),
        sha256,
        size: bytes.byteLength,
        multipart: true,
      };
    } catch (error) {
      await abortMultipart();
      throw error;
    }
  };

  return {
    target,
    resolveObjectKey,
    resolvePublicUrl,
    checkAccess,
    headObject,
    putObject,
    uploadFile,
  };
}
