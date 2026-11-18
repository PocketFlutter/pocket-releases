/**
 * App-agnostic Cross-Subnet & Multi-Master Sync Protocol (`@pocket/sync/protocol`).
 *
 * Designed for bare QuickJS bytecode (`.qjbc`), WebAssembly, Bun, and Node runtimes
 * with zero browser-only globals (`TextEncoder` / `crypto.subtle` not required).
 *
 * Key V2 Architecture Invariants:
 * 1. Conflict Clock (`op.hlc`) is strictly decoupled from Pull Cursor (`serverSeq` + `serverInstanceId`)
 *    so late-arriving offline operations are NEVER skipped across multi-server meshes.
 * 2. Storage Durability (`persistent` vs `ephemeralCache`) prevents tvOS / Watch cache-only
 *    relays from issuing permanent archive-deletion receipts.
 * 3. Built-in HKDF-SHA256 + HMAC-SHA256 + Replay-Window Nonce authentication & Tailscale
 *    (`100.64.0.0/10` CGNAT) / LAN / WAN endpoint security classification.
 */

export const POCKET_SYNC_PROTOCOL_VERSION = 1 as const;
export const POCKET_SYNC_DEFAULT_PORT = 8795 as const;
export const POCKET_SYNC_MDNS_SERVICE = "_pocketsync._tcp" as const;
export const POCKET_SYNC_AUTH_HEADER = "x-pocket-sync-auth" as const;

export type SyncDeviceKind =
  | "macos"
  | "desktop"
  | "tv"
  | "tvos"
  | "android-tv"
  | "watch"
  | "watchos"
  | "wear-os"
  | "mobile"
  | "tablet"
  | "web";

export type StorageDurability = "persistent" | "ephemeralCache";
export type ServerPowerPolicy = "alwaysOn" | "adaptiveRelay" | "manualSession";
export type SyncNetworkKind = "lan" | "overlay" | "wan";
export type SyncOpKind = "UPSERT" | "PATCH" | "DELETE";

export interface SyncHlcTimestamp {
  readonly physicalTimeMs: number;
  readonly counter: number;
  readonly nodeId: string;
}

export interface SyncOpRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly opId: string;
  readonly hlc: string;
  readonly namespace: string;
  readonly collection: string;
  readonly entityId: string;
  readonly opType: SyncOpKind;
  readonly payload: Readonly<TPayload>;
  readonly authorId: string;
  readonly authorName?: string;
  readonly authorRole?: string;
  readonly occurredAtMs: number;
}

export interface SequencedSyncOp<TPayload extends Record<string, unknown> = Record<string, unknown>>
  extends SyncOpRecord<TPayload> {
  readonly serverSeq: number;
}

export interface EndpointWatermark {
  readonly serverInstanceId: string;
  readonly lastSeenSeq: number;
  readonly updatedAtMs: number;
}

export interface MaterializedSyncEntity {
  entityId: string;
  namespace: string;
  collection: string;
  fields: Record<string, unknown>;
  fieldHlcs: Record<string, SyncHlcTimestamp>;
  isDeleted: boolean;
  updatedBy: string;
  updatedAtMs: number;
}

export interface SyncNodeInfo {
  readonly protocolVersion: number;
  readonly serverInstanceId: string;
  readonly nodeId: string;
  readonly deviceName: string;
  readonly deviceKind: SyncDeviceKind;
  readonly storageDurability: StorageDurability;
  readonly powerPolicy: ServerPowerPolicy;
  readonly namespaces: readonly string[];
  readonly latestSeq: number;
  readonly latestHlc: string;
}

export interface SyncExchangeRequest {
  readonly namespace: string;
  readonly clientNodeId: string;
  readonly expectedServerInstanceId?: string;
  readonly sinceSeq: number;
  readonly ops: readonly SyncOpRecord[];
  readonly limit?: number;
}

export interface SyncExchangeResponse {
  readonly namespace: string;
  readonly serverInstanceId: string;
  readonly storageDurability: StorageDurability;
  readonly resetCursor: boolean;
  readonly hasMore?: boolean;
  readonly acceptedCount: number;
  readonly serverOps: readonly SequencedSyncOp[];
  readonly latestSeq: number;
  readonly latestHlc: string;
}

export interface SyncArchiveReceipt {
  readonly blobSha256: string;
  readonly byteLength: number;
  readonly serverInstanceId: string;
  readonly serverNodeId: string;
  readonly storageDurability: StorageDurability;
  readonly issuedAtMs: number;
  readonly permanentArchiveSafe: boolean;
  readonly signature: string;
}

export interface ParsedSyncEndpoint {
  readonly normalizedBaseUrl: string;
  readonly wsUrl: string;
  readonly scheme: "http" | "https";
  readonly host: string;
  readonly port: number;
  readonly pathPrefix: string;
  readonly networkKind: SyncNetworkKind;
}

// ── 1. Pure QuickJS UTF-8, SHA-256, HMAC-SHA256 & HKDF-SHA256 ────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function utf8Encode(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return input;
  const str = String(input);
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code <= 0x7f) {
      out.push(code);
    } else if (code <= 0x7ff) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const units: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++]!;
    if (b0 < 0x80) {
      units.push(b0);
    } else if ((b0 & 0xe0) === 0xc0) {
      const b1 = bytes[i++] ?? 0x80;
      units.push(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++] ?? 0x80;
      const b2 = bytes[i++] ?? 0x80;
      units.push(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else {
      const b1 = bytes[i++] ?? 0x80;
      const b2 = bytes[i++] ?? 0x80;
      const b3 = bytes[i++] ?? 0x80;
      const cp =
        (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)) -
        0x10000;
      units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
    if (units.length >= 2048) {
      chunks.push(String.fromCharCode(...units));
      units.length = 0;
    }
  }
  if (units.length > 0) chunks.push(String.fromCharCode(...units));
  return chunks.length === 1 ? chunks[0]! : chunks.join("");
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  const msg = utf8Encode(data);
  const bitLen = msg.length * 8;
  const padLen = (((msg.length + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15]!, 7) ^ rotr32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr32(w[i - 2]!, 17) ^ rotr32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256Bytes(data));
}

export function hmacSha256Bytes(key: string | Uint8Array, message: string | Uint8Array): Uint8Array {
  let keyBytes = utf8Encode(key);
  if (keyBytes.length > 64) keyBytes = sha256Bytes(keyBytes);
  const oPad = new Uint8Array(64);
  const iPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const kb = keyBytes[i] ?? 0;
    oPad[i] = kb ^ 0x5c;
    iPad[i] = kb ^ 0x36;
  }
  const msgBytes = utf8Encode(message);
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(iPad, 0);
  inner.set(msgBytes, 64);
  const innerDigest = sha256Bytes(inner);

  const outer = new Uint8Array(64 + 32);
  outer.set(oPad, 0);
  outer.set(innerDigest, 64);
  return sha256Bytes(outer);
}

export function hmacSha256Hex(key: string | Uint8Array, message: string | Uint8Array): string {
  return bytesToHex(hmacSha256Bytes(key, message));
}

export function deriveRoomAuthKeyHex(roomSecret: string, namespace: string): string {
  const prk = hmacSha256Bytes(`pocket-sync-salt:${namespace}`, roomSecret);
  const info = utf8Encode(`pocket-sync-auth-v1|${namespace}\x01`);
  return bytesToHex(hmacSha256Bytes(prk, info));
}

// ── 2. Replay-Protected Room Request Signing & Durability Rules ──────────────

export interface SyncAuthHeaderInput {
  readonly roomSecret: string;
  readonly namespace: string;
  readonly method: string;
  readonly path: string;
  readonly bodySha256?: string;
  readonly timestampMs?: number;
  readonly nonce?: string;
}

let fallbackNonceSeq = 1;

function nextDeterministicNonce(nowMs: number): string {
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${nowMs.toString(36)}_${(fallbackNonceSeq++).toString(36)}_${rand}`;
}

export function createSyncAuthHeader(input: SyncAuthHeaderInput): string {
  const ts = Math.trunc(input.timestampMs ?? Date.now());
  const nonce = input.nonce ?? nextDeterministicNonce(ts);
  const bodyHash = input.bodySha256 ?? sha256Hex("");
  const derivedKey = deriveRoomAuthKeyHex(input.roomSecret, input.namespace);
  const canonical = `v1|${input.namespace}|${input.method.toUpperCase()}|${input.path}|${ts}|${nonce}|${bodyHash}`;
  const mac = hmacSha256Hex(derivedKey, canonical);
  return `v1:${ts}:${nonce}:${mac}`;
}

export class SyncReplayGuard {
  private readonly maxSkewMs: number;
  private readonly maxEntries: number;
  private readonly seenNonces = new Map<string, number>();

  constructor(options?: { maxSkewMs?: number; maxEntries?: number }) {
    this.maxSkewMs = options?.maxSkewMs ?? 5 * 60 * 1000;
    this.maxEntries = options?.maxEntries ?? 2048;
  }

  verifyHeader(params: {
    headerValue: string | undefined | null;
    roomSecret: string;
    namespace: string;
    method: string;
    path: string;
    bodySha256?: string;
    nowMs?: number;
  }): { ok: boolean; reason?: string } {
    const raw = params.headerValue?.trim() ?? "";
    if (!raw.startsWith("v1:")) {
      return { ok: false, reason: "missing_or_unsupported_auth_version" };
    }
    const parts = raw.split(":");
    if (parts.length !== 4) {
      return { ok: false, reason: "malformed_auth_header" };
    }
    const ts = Number(parts[1]);
    const nonce = parts[2]!;
    const mac = parts[3]!;
    const now = params.nowMs ?? Date.now();
    if (!Number.isFinite(ts) || !nonce || nonce.length > 128) {
      return { ok: false, reason: "invalid_timestamp_or_nonce" };
    }
    if (Math.abs(now - ts) > this.maxSkewMs) {
      return { ok: false, reason: "timestamp_out_of_window" };
    }
    const replayKey = `${params.namespace}:${nonce}`;
    const prevSeen = this.seenNonces.get(replayKey);
    if (prevSeen !== undefined && now - prevSeen <= this.maxSkewMs) {
      return { ok: false, reason: "replayed_nonce" };
    }
    const bodyHash = params.bodySha256 ?? sha256Hex("");
    const derivedKey = deriveRoomAuthKeyHex(params.roomSecret, params.namespace);
    const canonical = `v1|${params.namespace}|${params.method.toUpperCase()}|${params.path}|${ts}|${nonce}|${bodyHash}`;
    const expectedMac = hmacSha256Hex(derivedKey, canonical);
    if (!timingSafeEqualHex(mac, expectedMac)) {
      return { ok: false, reason: "invalid_hmac_signature" };
    }
    if (this.seenNonces.size >= this.maxEntries) {
      const oldestKey = this.seenNonces.keys().next().value;
      if (oldestKey !== undefined) this.seenNonces.delete(oldestKey);
    }
    this.seenNonces.set(replayKey, now);
    return { ok: true };
  }
}

/**
 * Default storage durability per device kind:
 * - `tvos` (Apple TV) and `watch`/`watchos`/`wear-os` are `ephemeralCache`
 *   because OS cache directories can be purged under disk pressure.
 * - `macos`, `desktop`, and `android-tv` are `persistent` and safe to issue
 *   archive receipts allowing mobile clients to reclaim local photo storage.
 */
export function defaultStorageDurabilityForDevice(kind: SyncDeviceKind): StorageDurability {
  switch (kind) {
    case "tvos":
    case "watch":
    case "watchos":
    case "wear-os":
    case "web":
      return "ephemeralCache";
    case "macos":
    case "desktop":
    case "android-tv":
    case "tv":
    case "mobile":
    case "tablet":
      return "persistent";
  }
}

export function defaultPowerPolicyForDevice(kind: SyncDeviceKind): ServerPowerPolicy {
  switch (kind) {
    case "macos":
    case "desktop":
    case "tv":
    case "tvos":
    case "android-tv":
      return "alwaysOn";
    case "watch":
    case "watchos":
    case "wear-os":
      return "adaptiveRelay";
    default:
      return "manualSession";
  }
}

export function canIssuePermanentArchiveReceipt(durability: StorageDurability): boolean {
  return durability === "persistent";
}

export function signBlobArchiveReceipt(params: {
  roomSecret: string;
  namespace: string;
  blobSha256: string;
  byteLength: number;
  serverInstanceId: string;
  serverNodeId: string;
  storageDurability: StorageDurability;
  issuedAtMs?: number;
}): SyncArchiveReceipt {
  const issuedAtMs = Math.trunc(params.issuedAtMs ?? Date.now());
  const permanentArchiveSafe = canIssuePermanentArchiveReceipt(params.storageDurability);
  const key = deriveRoomAuthKeyHex(params.roomSecret, params.namespace);
  const canonical = `receipt-v1|${params.namespace}|${params.blobSha256}|${params.byteLength}|${params.serverInstanceId}|${params.serverNodeId}|${params.storageDurability}|${permanentArchiveSafe ? 1 : 0}|${issuedAtMs}`;
  return {
    blobSha256: params.blobSha256,
    byteLength: params.byteLength,
    serverInstanceId: params.serverInstanceId,
    serverNodeId: params.serverNodeId,
    storageDurability: params.storageDurability,
    issuedAtMs,
    permanentArchiveSafe,
    signature: hmacSha256Hex(key, canonical),
  };
}

export function verifyBlobArchiveReceipt(
  receipt: SyncArchiveReceipt,
  roomSecret: string,
  namespace: string,
): boolean {
  const key = deriveRoomAuthKeyHex(roomSecret, namespace);
  const canonical = `receipt-v1|${namespace}|${receipt.blobSha256}|${receipt.byteLength}|${receipt.serverInstanceId}|${receipt.serverNodeId}|${receipt.storageDurability}|${receipt.permanentArchiveSafe ? 1 : 0}|${receipt.issuedAtMs}`;
  const expected = hmacSha256Hex(key, canonical);
  if (!timingSafeEqualHex(receipt.signature, expected)) return false;
  if (receipt.permanentArchiveSafe && !canIssuePermanentArchiveReceipt(receipt.storageDurability)) {
    return false;
  }
  return true;
}

// ── 3. Endpoint Classifier (LAN / Tailscale & WireGuard Overlay / WAN) ───────

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums as [number, number, number, number];
}

export function classifySyncHost(host: string): SyncNetworkKind {
  const clean = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    clean === "localhost" ||
    clean.endsWith(".local") ||
    clean.endsWith(".lan") ||
    clean.endsWith(".home.arpa") ||
    clean === "::1" ||
    clean.startsWith("fe80:")
  ) {
    return "lan";
  }
  if (
    clean.endsWith(".ts.net") ||
    clean.endsWith(".zt") ||
    clean.startsWith("fd7a:115c:a1e0:")
  ) {
    return "overlay";
  }
  if (clean.startsWith("fc") || clean.startsWith("fd")) {
    return "lan";
  }
  const v4 = parseIpv4Octets(clean);
  if (v4) {
    const [a, b] = v4;
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return "lan";
    }
    // RFC 6598 100.64.0.0/10 — Tailscale / ZeroTier / CGNAT cross-subnet overlay mesh
    if (a === 100 && b >= 64 && b <= 127) {
      return "overlay";
    }
    // Benchmark / Overlay 198.18.0.0/15
    if (a === 198 && (b === 18 || b === 19)) {
      return "overlay";
    }
  }
  return "wan";
}

export function parseSyncEndpointUrl(
  rawInput: string,
  options?: { defaultPort?: number; allowInsecureWan?: boolean },
): ParsedSyncEndpoint {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Sync endpoint address cannot be empty");
  }
  const defaultPort = options?.defaultPort ?? POCKET_SYNC_DEFAULT_PORT;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  const match = /^(https?|wss?):\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(withScheme);
  if (!match) {
    throw new Error(`Invalid sync endpoint URL: ${rawInput}`);
  }
  const rawScheme = match[1]!.toLowerCase();
  const scheme: "http" | "https" =
    rawScheme === "https" || rawScheme === "wss" ? "https" : "http";
  const authority = match[2]!;
  if (authority.includes("@")) {
    throw new Error("Sync endpoint URL must not embed credentials");
  }

  let host = "";
  let port = scheme === "https" ? 443 : defaultPort;

  if (authority.startsWith("[")) {
    const closeIdx = authority.indexOf("]");
    if (closeIdx < 0) throw new Error(`Invalid IPv6 host in endpoint: ${rawInput}`);
    host = authority.slice(0, closeIdx + 1);
    const rest = authority.slice(closeIdx + 1);
    if (rest.startsWith(":")) {
      port = Number(rest.slice(1));
    }
  } else {
    const colonIdx = authority.lastIndexOf(":");
    if (colonIdx >= 0) {
      host = authority.slice(0, colonIdx);
      port = Number(authority.slice(colonIdx + 1));
    } else {
      host = authority;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
        port = scheme === "https" ? 443 : 80;
      }
    }
  }

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid host or port in sync endpoint: ${rawInput}`);
  }

  const networkKind = classifySyncHost(host);
  if (networkKind === "wan" && scheme === "http" && !options?.allowInsecureWan) {
    throw new Error(
      `Public WAN endpoint "${host}" requires https:// (or pass allowInsecureWan: true for private tunnels)`,
    );
  }

  const rawPath = (match[3] ?? "").replace(/\/+$/, "");
  const isStandardPort = (scheme === "https" && port === 443) || (scheme === "http" && port === 80);
  const normalizedBaseUrl = `${scheme}://${host.toLowerCase()}${isStandardPort ? "" : `:${port}`}${rawPath}`;
  const wsScheme = scheme === "https" ? "wss" : "ws";
  const wsUrl = `${wsScheme}://${host.toLowerCase()}${isStandardPort ? "" : `:${port}`}${rawPath}/v1/pocket-sync/live`;

  return {
    normalizedBaseUrl,
    wsUrl,
    scheme,
    host: host.toLowerCase(),
    port,
    pathPrefix: rawPath,
    networkKind,
  };
}

// ── 4. Hybrid Logical Clock & Server-Sequenced LWW-CRDT Ledger ───────────────

const MAX_HLC_DRIFT_MS = 24 * 60 * 60 * 1000;

export function formatSyncHlc(hlc: SyncHlcTimestamp): string {
  const iso = new Date(hlc.physicalTimeMs).toISOString();
  const hex = Math.max(0, hlc.counter & 0xffff).toString(16).padStart(4, "0");
  return `${iso}-${hex}-${hlc.nodeId}`;
}

export function parseSyncHlc(raw: string): SyncHlcTimestamp {
  const zIdx = raw.indexOf("Z-");
  if (zIdx < 0) throw new Error(`Invalid HLC string: ${raw}`);
  const isoPart = raw.slice(0, zIdx + 1);
  const rest = raw.slice(zIdx + 2);
  const dashIdx = rest.indexOf("-");
  if (dashIdx < 0) throw new Error(`Malformed HLC counter/node: ${raw}`);
  const physicalTimeMs = Date.parse(isoPart);
  const counter = parseInt(rest.slice(0, dashIdx), 16);
  const nodeId = rest.slice(dashIdx + 1);
  if (!Number.isFinite(physicalTimeMs) || !Number.isFinite(counter) || !nodeId) {
    throw new Error(`Malformed HLC components: ${raw}`);
  }
  return { physicalTimeMs, counter, nodeId };
}

export function compareSyncHlc(a: SyncHlcTimestamp, b: SyncHlcTimestamp): number {
  if (a.physicalTimeMs !== b.physicalTimeMs) {
    return a.physicalTimeMs > b.physicalTimeMs ? 1 : -1;
  }
  if (a.counter !== b.counter) {
    return a.counter > b.counter ? 1 : -1;
  }
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId > b.nodeId ? 1 : -1;
}

export class SyncHlcClock {
  public readonly nodeId: string;
  private readonly nowMsFn: () => number;
  private last: SyncHlcTimestamp;

  constructor(nodeId: string, nowMsFn: () => number = () => Date.now()) {
    this.nodeId = nodeId;
    this.nowMsFn = nowMsFn;
    this.last = { physicalTimeMs: 0, counter: 0, nodeId };
  }

  now(): SyncHlcTimestamp {
    const wall = this.nowMsFn();
    if (wall > this.last.physicalTimeMs) {
      this.last = { physicalTimeMs: wall, counter: 0, nodeId: this.nodeId };
    } else {
      this.last = {
        physicalTimeMs: this.last.physicalTimeMs,
        counter: this.last.counter + 1,
        nodeId: this.nodeId,
      };
    }
    return this.last;
  }

  receive(remote: SyncHlcTimestamp): SyncHlcTimestamp {
    const wall = this.nowMsFn();
    if (remote.physicalTimeMs - wall > MAX_HLC_DRIFT_MS) {
      throw new Error("SyncClockDriftError: remote HLC exceeds +24h drift limit");
    }
    const maxMs = Math.max(wall, this.last.physicalTimeMs, remote.physicalTimeMs);
    let counter = 0;
    if (maxMs === this.last.physicalTimeMs && maxMs === remote.physicalTimeMs) {
      counter = Math.max(this.last.counter, remote.counter) + 1;
    } else if (maxMs === this.last.physicalTimeMs) {
      counter = this.last.counter + 1;
    } else if (maxMs === remote.physicalTimeMs) {
      counter = remote.counter + 1;
    }
    this.last = { physicalTimeMs: maxMs, counter, nodeId: this.nodeId };
    return this.last;
  }

  latestFormatted(): string {
    return formatSyncHlc(this.last);
  }
}

export interface PocketSyncLedgerOptions {
  readonly nodeId: string;
  readonly serverInstanceId?: string;
  readonly storageDurability?: StorageDurability;
  readonly nowMs?: () => number;
  readonly authorizeOp?: (op: SyncOpRecord) => boolean;
}

/**
 * Multi-master CRDT ledger combining:
 * - Monotonic arrival sequence (`serverSeq`) for zero-miss multi-server cursor pulls
 * - Field-level HLC Last-Write-Wins materialization for deterministic conflict resolution
 */
export class PocketSyncLedger {
  public readonly nodeId: string;
  public readonly serverInstanceId: string;
  public readonly storageDurability: StorageDurability;
  public readonly clock: SyncHlcClock;
  private readonly authorizeOp?: (op: SyncOpRecord) => boolean;
  private readonly seenOpIds = new Set<string>();
  private readonly arrivalLog: SequencedSyncOp[] = [];
  private readonly entities = new Map<string, MaterializedSyncEntity>();
  private nextSeq = 1;
  private localSeq = 1;

  constructor(options: PocketSyncLedgerOptions) {
    this.nodeId = options.nodeId;
    const nowFn = options.nowMs ?? (() => Date.now());
    this.serverInstanceId =
      options.serverInstanceId ?? `inst_${options.nodeId}_${nowFn().toString(36)}`;
    this.storageDurability = options.storageDurability ?? "persistent";
    this.clock = new SyncHlcClock(options.nodeId, nowFn);
    this.authorizeOp = options.authorizeOp;
  }

  getLatestSeq(): number {
    return this.nextSeq - 1;
  }

  getArrivalLog(namespace?: string): readonly SequencedSyncOp[] {
    if (!namespace) return this.arrivalLog;
    return this.arrivalLog.filter((op) => op.namespace === namespace);
  }

  getEntity(namespace: string, collection: string, entityId: string): MaterializedSyncEntity | undefined {
    return this.entities.get(`${namespace}::${collection}::${entityId}`);
  }

  listEntities(namespace: string, collection?: string): MaterializedSyncEntity[] {
    const out: MaterializedSyncEntity[] = [];
    for (const ent of this.entities.values()) {
      if (ent.namespace !== namespace || ent.isDeleted) continue;
      if (collection && ent.collection !== collection) continue;
      out.push(ent);
    }
    return out;
  }

  recordLocalOp<TPayload extends Record<string, unknown>>(params: {
    namespace: string;
    collection: string;
    entityId?: string;
    opType?: SyncOpKind;
    payload: TPayload;
    authorId: string;
    authorName?: string;
    authorRole?: string;
    occurredAtMs?: number;
    opId?: string;
  }): SequencedSyncOp<TPayload> | null {
    const hlc = this.clock.now();
    const entityId =
      params.entityId ?? `ent_${this.nodeId}_${hlc.physicalTimeMs}_${this.localSeq++}`;
    const op: SyncOpRecord<TPayload> = {
      opId: params.opId ?? `op_${this.nodeId}_${hlc.physicalTimeMs}_${hlc.counter}`,
      hlc: formatSyncHlc(hlc),
      namespace: params.namespace,
      collection: params.collection,
      entityId,
      opType: params.opType ?? "UPSERT",
      payload: params.payload,
      authorId: params.authorId,
      ...(params.authorName ? { authorName: params.authorName } : {}),
      ...(params.authorRole ? { authorRole: params.authorRole } : {}),
      occurredAtMs: params.occurredAtMs ?? hlc.physicalTimeMs,
    };
    const res = this.ingestOps([op], { isRemote: false });
    return (res.accepted[0] as SequencedSyncOp<TPayload> | undefined) ?? null;
  }

  ingestOps(
    ops: readonly SyncOpRecord[],
    options?: { isRemote?: boolean },
  ): { accepted: SequencedSyncOp[]; rejectedCount: number } {
    const isRemote = options?.isRemote ?? true;
    const accepted: SequencedSyncOp[] = [];
    let rejectedCount = 0;

    for (const rawOp of ops) {
      if (!rawOp?.opId || !rawOp.namespace || !rawOp.collection || !rawOp.entityId) {
        rejectedCount += 1;
        continue;
      }
      if (this.seenOpIds.has(rawOp.opId)) {
        continue;
      }
      if (this.authorizeOp && !this.authorizeOp(rawOp)) {
        rejectedCount += 1;
        continue;
      }
      let parsedHlc: SyncHlcTimestamp;
      try {
        parsedHlc = parseSyncHlc(rawOp.hlc);
        if (isRemote) {
          this.clock.receive(parsedHlc);
        }
      } catch {
        rejectedCount += 1;
        continue;
      }

      this.seenOpIds.add(rawOp.opId);
      const sequenced: SequencedSyncOp = {
        ...rawOp,
        serverSeq: this.nextSeq++,
      };
      this.arrivalLog.push(sequenced);
      this.materialize(sequenced, parsedHlc);
      accepted.push(sequenced);
    }

    return { accepted, rejectedCount };
  }

  exchange(req: SyncExchangeRequest): SyncExchangeResponse & { acceptedOps: readonly SequencedSyncOp[] } {
    const resetCursor = Boolean(
      req.expectedServerInstanceId && req.expectedServerInstanceId !== this.serverInstanceId,
    );
    const effectiveSinceSeq = resetCursor ? 0 : Math.max(0, Math.trunc(req.sinceSeq || 0));

    // Read missing server ops BEFORE appending incoming client ops so we don't echo
    // the client's just-uploaded ops back in the same HTTP response unnecessarily,
    // while advancing latestSeq cleanly to cover both!
    const maxItems = Math.max(1, Math.min(512, req.limit ?? 128));
    const missingForClient: SequencedSyncOp[] = [];
    let hasMore = false;
    for (const entry of this.arrivalLog) {
      if (entry.namespace !== req.namespace) continue;
      if (entry.serverSeq > effectiveSinceSeq) {
        if (missingForClient.length >= maxItems) {
          hasMore = true;
          break;
        }
        missingForClient.push(entry);
      }
    }

    const scopedIncoming = (req.ops ?? []).filter((op) => op.namespace === req.namespace);
    const ingested = this.ingestOps(scopedIncoming, { isRemote: true });

    const lastMissingSeq =
      missingForClient.length > 0
        ? missingForClient[missingForClient.length - 1]!.serverSeq
        : effectiveSinceSeq;
    const latestSeq = hasMore ? lastMissingSeq : this.getLatestSeq();

    return {
      namespace: req.namespace,
      serverInstanceId: this.serverInstanceId,
      storageDurability: this.storageDurability,
      resetCursor,
      hasMore,
      acceptedCount: ingested.accepted.length,
      serverOps: missingForClient,
      latestSeq,
      latestHlc: this.clock.latestFormatted(),
      acceptedOps: ingested.accepted,
    };
  }

  private materialize(op: SyncOpRecord, opHlc: SyncHlcTimestamp): void {
    const key = `${op.namespace}::${op.collection}::${op.entityId}`;
    let ent = this.entities.get(key);
    if (!ent) {
      ent = {
        entityId: op.entityId,
        namespace: op.namespace,
        collection: op.collection,
        fields: {},
        fieldHlcs: {},
        isDeleted: false,
        updatedBy: op.authorId,
        updatedAtMs: op.occurredAtMs,
      };
      this.entities.set(key, ent);
    }
    const patch: Record<string, unknown> = { ...op.payload };
    if (op.opType === "DELETE") {
      patch.__deleted = true;
    } else if (op.opType === "UPSERT" && patch.__deleted === undefined) {
      patch.__deleted = false;
    }
    for (const [field, val] of Object.entries(patch)) {
      const prevHlc = ent.fieldHlcs[field];
      if (!prevHlc || compareSyncHlc(opHlc, prevHlc) >= 0) {
        ent.fields[field] = val;
        ent.fieldHlcs[field] = opHlc;
        ent.updatedBy = op.authorId;
        ent.updatedAtMs = Math.max(ent.updatedAtMs, op.occurredAtMs);
        if (field === "__deleted" && typeof val === "boolean") {
          ent.isDeleted = val;
        }
      }
    }
  }
}
