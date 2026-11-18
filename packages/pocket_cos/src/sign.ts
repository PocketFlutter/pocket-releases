import type { CosCredentials } from "./types.ts";

const utf8Encoder = new TextEncoder();

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? utf8Encoder.encode(input) : input;
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * Pure TypeScript SHA-1 (RFC 3174) returning a 20-byte digest.
 * Used exclusively for Tencent Cloud COS XML v5 request signing (`q-sign-algorithm=sha1`).
 */
export function sha1Bytes(input: string | Uint8Array): Uint8Array {
  const msg = toBytes(input);
  const ml = msg.byteLength;
  const bitLenHi = Math.floor((ml * 8) / 0x100000000) >>> 0;
  const bitLenLo = ((ml * 8) & 0xffffffff) >>> 0;

  const totalBlocks = (((ml + 8) >>> 6) + 1) << 4;
  const words = new Uint32Array(totalBlocks);

  for (let i = 0; i < ml; i += 1) {
    words[i >>> 2] |= msg[i]! << (24 - (i & 3) * 8);
  }
  words[ml >>> 2] |= 0x80 << (24 - (ml & 3) * 8);
  words[totalBlocks - 2] = bitLenHi;
  words[totalBlocks - 1] = bitLenLo;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < totalBlocks; offset += 16) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = words[offset + i]! >>> 0;
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const view = new DataView(out.buffer);
  view.setUint32(0, h0, false);
  view.setUint32(4, h1, false);
  view.setUint32(8, h2, false);
  view.setUint32(12, h3, false);
  view.setUint32(16, h4, false);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export function sha1Hex(input: string | Uint8Array): string {
  return bytesToHex(sha1Bytes(input));
}

/**
 * Pure TypeScript HMAC-SHA1 (RFC 2104) returning a lowercase 40-char hex string.
 */
export function hmacSha1Hex(key: string | Uint8Array, message: string | Uint8Array): string {
  const blockSize = 64;
  let keyBytes = toBytes(key);
  if (keyBytes.byteLength > blockSize) {
    keyBytes = sha1Bytes(keyBytes);
  }
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    oKeyPad[i] = paddedKey[i]! ^ 0x5c;
    iKeyPad[i] = paddedKey[i]! ^ 0x36;
  }

  const msgBytes = toBytes(message);
  const innerInput = new Uint8Array(blockSize + msgBytes.byteLength);
  innerInput.set(iKeyPad, 0);
  innerInput.set(msgBytes, blockSize);
  const innerDigest = sha1Bytes(innerInput);

  const outerInput = new Uint8Array(blockSize + innerDigest.byteLength);
  outerInput.set(oKeyPad, 0);
  outerInput.set(innerDigest, blockSize);
  return bytesToHex(sha1Bytes(outerInput));
}

export function camSafeUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export function encodeCosObjectPath(objectKey: string): string {
  if (!objectKey || objectKey === "/") return "/";
  const trimmed = objectKey.replace(/^\/+/, "");
  if (!trimmed) return "/";
  const segments = trimmed.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return "/";
  return "/" + segments.map((segment) => camSafeUrlEncode(segment)).join("/");
}

const SIGNED_HEADER_NAMES = new Set([
  "host",
  "content-type",
  "content-length",
  "content-md5",
  "cache-control",
]);

function shouldSignHeader(lowerName: string): boolean {
  return SIGNED_HEADER_NAMES.has(lowerName) || lowerName.startsWith("x-cos-");
}

export type SignCosRequestInput = {
  method: string;
  pathname?: string;
  objectKey?: string;
  query?: Record<string, string | number | boolean | null | undefined> | URLSearchParams;
  headers?: Record<string, string | number | undefined>;
  credentials: CosCredentials;
  nowSeconds?: number;
  expiresSeconds?: number;
  keyTime?: string;
  signTime?: string;
};

export type SignCosRequestResult = {
  authorization: string;
  headers: Record<string, string>;
  keyTime: string;
  signTime: string;
  httpString: string;
  stringToSign: string;
  signature: string;
};

export function signCosRequest(input: SignCosRequestInput): SignCosRequestResult {
  const { credentials } = input;
  if (!credentials?.secretId || !credentials?.secretKey) {
    throw new Error("COS credentials require non-empty secretId and secretKey");
  }
  const method = input.method.trim().toLowerCase();
  if (!method) {
    throw new Error("HTTP method is required for COS request signing");
  }

  const pathname =
    input.pathname !== undefined
      ? input.pathname.startsWith("/")
        ? input.pathname
        : `/${input.pathname}`
      : encodeCosObjectPath(input.objectKey ?? "/");

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresSeconds = input.expiresSeconds ?? 900;
  const startUnix = nowSeconds - 60;
  const endUnix = nowSeconds + expiresSeconds;
  const defaultTime = `${startUnix};${endUnix}`;
  const signTime = input.signTime ?? input.keyTime ?? defaultTime;
  const keyTime = input.keyTime ?? signTime;

  const signKey = hmacSha1Hex(credentials.secretKey, keyTime);

  const queryEntries: Array<{ encodedKey: string; encodedValue: string }> = [];
  if (input.query instanceof URLSearchParams) {
    input.query.forEach((val, key) => {
      const encodedKey = camSafeUrlEncode(key.toLowerCase());
      const encodedValue = camSafeUrlEncode(val ?? "");
      queryEntries.push({ encodedKey, encodedValue });
    });
  } else if (input.query && typeof input.query === "object") {
    for (const [key, rawVal] of Object.entries(input.query)) {
      if (rawVal === undefined) continue;
      const encodedKey = camSafeUrlEncode(key.toLowerCase());
      const strVal = rawVal === null ? "" : String(rawVal);
      const encodedValue = camSafeUrlEncode(strVal);
      queryEntries.push({ encodedKey, encodedValue });
    }
  }
  queryEntries.sort((a, b) =>
    a.encodedKey < b.encodedKey
      ? -1
      : a.encodedKey > b.encodedKey
        ? 1
        : a.encodedValue < b.encodedValue
          ? -1
          : a.encodedValue > b.encodedValue
            ? 1
            : 0,
  );

  const urlParamList = queryEntries.map((item) => item.encodedKey).join(";");
  const httpParameters = queryEntries
    .map((item) => `${item.encodedKey}=${item.encodedValue}`)
    .join("&");

  const outHeaders: Record<string, string> = {};
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      if (v === undefined) continue;
      outHeaders[k] = String(v);
    }
  }
  if (credentials.securityToken && credentials.securityToken.trim().length > 0) {
    const hasTokenHeader = Object.keys(outHeaders).some(
      (k) => k.toLowerCase() === "x-cos-security-token",
    );
    if (!hasTokenHeader) {
      outHeaders["x-cos-security-token"] = credentials.securityToken.trim();
    }
  }

  const headerEntries: Array<{ encodedKey: string; encodedValue: string }> = [];
  for (const [k, v] of Object.entries(outHeaders)) {
    const lowerKey = k.trim().toLowerCase();
    if (!shouldSignHeader(lowerKey)) continue;
    const encodedKey = camSafeUrlEncode(lowerKey);
    const encodedValue = camSafeUrlEncode(v.trim());
    headerEntries.push({ encodedKey, encodedValue });
  }
  headerEntries.sort((a, b) =>
    a.encodedKey < b.encodedKey
      ? -1
      : a.encodedKey > b.encodedKey
        ? 1
        : a.encodedValue < b.encodedValue
          ? -1
          : a.encodedValue > b.encodedValue
            ? 1
            : 0,
  );

  const headerList = headerEntries.map((item) => item.encodedKey).join(";");
  const httpHeaders = headerEntries
    .map((item) => `${item.encodedKey}=${item.encodedValue}`)
    .join("&");

  const httpString = `${method}\n${pathname}\n${httpParameters}\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${signTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);

  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${credentials.secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=${urlParamList}`,
    `q-signature=${signature}`,
  ].join("&");

  outHeaders.Authorization = authorization;

  return {
    authorization,
    headers: outHeaders,
    keyTime,
    signTime,
    httpString,
    stringToSign,
    signature,
  };
}

export type CreateCosPresignedUrlInput = {
  endpointOrigin: string;
  method?: string;
  objectKey: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string | number | undefined>;
  credentials: CosCredentials;
  nowSeconds?: number;
  expiresSeconds?: number;
};

export function createCosPresignedUrl(input: CreateCosPresignedUrlInput): string {
  const endpointUrl = new URL(input.endpointOrigin);
  const pathname = encodeCosObjectPath(input.objectKey);
  const headers: Record<string, string | number | undefined> = {
    host: endpointUrl.host,
    ...(input.headers ?? {}),
  };
  const signed = signCosRequest({
    method: input.method ?? "GET",
    pathname,
    query: input.query,
    headers,
    credentials: input.credentials,
    nowSeconds: input.nowSeconds,
    expiresSeconds: input.expiresSeconds,
  });

  const queryParts: string[] = [];
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v === undefined) continue;
      if (v === null || v === "") {
        queryParts.push(camSafeUrlEncode(k));
      } else {
        queryParts.push(`${camSafeUrlEncode(k)}=${camSafeUrlEncode(String(v))}`);
      }
    }
  }
  queryParts.push(signed.authorization);
  if (
    input.credentials.securityToken &&
    input.credentials.securityToken.trim().length > 0
  ) {
    queryParts.push(
      `x-cos-security-token=${camSafeUrlEncode(input.credentials.securityToken.trim())}`,
    );
  }
  return `${endpointUrl.origin}${pathname}?${queryParts.join("&")}`;
}
