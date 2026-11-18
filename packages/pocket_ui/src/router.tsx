/**
 * Zero-DOM, QuickJS-native URL & State Deep-Link Router for PocketJS (`@pocket/ui/router`).
 *
 * Synthesizes three proven open-source ideas for Pocket's retained guest architecture:
 * 1. Segment Radix Tree & specificity ranking (`unjs/rou3`-inspired): static > constrained `:param(re)` > `:param` > `:param?` > `*wildcard`.
 * 2. Composable, type-safe URL search-state codecs (`TanStack Router` + `47ng/nuqs`-inspired): `stateParam.string/int/number/boolean/enum/stringArray/json/snapshot`, default-value stripping, `retainParams`, and structural equality.
 * 3. Mobile retained `RouteView` stack & cold-start ancestor synthesis: deep-linking straight to `pocket://showcase/skins/overlays?skin=arc&dialog=1` automatically builds the parent stack (`home -> gallery -> skins`) so native back gestures work seamlessly.
 */

import {
  batch as solidBatch,
  createContext,
  createSignal,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

function fallbackSolidBatch<T>(fn: () => T): T {
  return fn();
}

const runSolidBatch: <T>(fn: () => T) => T =
  typeof solidBatch === "function" ? solidBatch : fallbackSolidBatch;
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "./bytes.ts";
import {
  isUnsupportedPlatformError,
  type PlatformExperience,
  type PlatformLinkSubscription,
  type PlatformLinkSubscriptionOptions,
} from "./platform-experience.ts";

// ============================================================================
// 1. Template-Literal Path Parameter Inference (`rou3` / `Solid Router` style)
// ============================================================================

type CleanParamName<Segment extends string> =
  Segment extends `${infer Name}(${string})` ? Name : Segment;

type CleanWildcardName<Raw extends string> =
  Raw extends `*${infer Rest}`
    ? CleanWildcardName<Rest>
    : Raw extends `:${infer Named}`
      ? Named extends "" ? "*" : Named
      : Raw extends ""
        ? "*"
        : Raw;

type SegmentParams<Segment extends string> =
  Segment extends `:${infer Raw}?`
    ? { [K in CleanParamName<Raw>]?: string }
    : Segment extends `:${infer Raw}`
      ? { [K in CleanParamName<Raw>]: string }
      : Segment extends `*${infer Wildcard}`
        ? { [K in CleanWildcardName<Wildcard>]?: string }
        : Record<never, never>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type InferRouteParams<Pattern extends string> = Simplify<
  Pattern extends `/${infer Rest}`
    ? InferRouteParams<Rest>
    : Pattern extends `${infer Head}/${infer Tail}`
      ? SegmentParams<Head> & InferRouteParams<Tail>
      : SegmentParams<Pattern>
>;

// ============================================================================
// 2. Pure-TS RFC-3986 Percent-Encoding, Query & URI Parser (Zero Web Globals)
// ============================================================================

export type QueryValue = string | readonly string[] | undefined;
export type QueryRecord = Readonly<Record<string, string | readonly string[]>>;

const HEX_DIGITS = "0123456789ABCDEF";
const OWN = Object.prototype.hasOwnProperty;

function isUnreservedByte(byte: number): boolean {
  return (
    (byte >= 0x41 && byte <= 0x5a) || // A-Z
    (byte >= 0x61 && byte <= 0x7a) || // a-z
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    byte === 0x2d || // -
    byte === 0x2e || // .
    byte === 0x5f || // _
    byte === 0x7e // ~
  );
}

function hexValue(charCode: number): number {
  if (charCode >= 0x30 && charCode <= 0x39) return charCode - 0x30;
  if (charCode >= 0x41 && charCode <= 0x46) return charCode - 0x41 + 10;
  if (charCode >= 0x61 && charCode <= 0x66) return charCode - 0x61 + 10;
  return -1;
}

/** Strict UTF-8 RFC-3986 component encoder without relying on `TextEncoder`. */
export function encodeUriPart(value: string): string {
  const bytes = utf8ToBytes(value);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]!;
    if (isUnreservedByte(byte)) {
      out += String.fromCharCode(byte);
    } else {
      out += `%${HEX_DIGITS[byte >> 4]!}${HEX_DIGITS[byte & 0x0f]!}`;
    }
  }
  return out;
}

/** UTF-8 percent-decoder safe against truncated `%` sequences in QuickJS. */
export function decodeUriPart(encoded: string, plusAsSpace = false): string {
  const input = plusAsSpace ? encoded.replace(/\+/g, " ") : encoded;
  if (!input.includes("%")) return input;
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code === 0x25 && i + 2 < input.length) {
      const hi = hexValue(input.charCodeAt(i + 1));
      const lo = hexValue(input.charCodeAt(i + 2));
      if (hi >= 0 && lo >= 0) {
        bytes.push((hi << 4) | lo);
        i += 2;
        continue;
      }
    }
    const charBytes = utf8ToBytes(input[i]!);
    for (let j = 0; j < charBytes.length; j += 1) bytes.push(charBytes[j]!);
  }
  return bytesToUtf8(new Uint8Array(bytes));
}

/** Parse a `?a=1&b=2&b=3` query string into an immutable `QueryRecord`. */
export function parseSearchString(search: string): QueryRecord {
  const trimmed = search.startsWith("?") ? search.slice(1) : search;
  if (!trimmed) return {};
  const out: Record<string, string | string[]> = {};
  const pairs = trimmed.split("&");
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i]!;
    if (!pair) continue;
    const eqIndex = pair.indexOf("=");
    const rawKey = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
    const rawVal = eqIndex >= 0 ? pair.slice(eqIndex + 1) : "";
    const key = decodeUriPart(rawKey, true);
    if (!key || key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const val = decodeUriPart(rawVal, true);
    if (!OWN.call(out, key)) {
      Object.defineProperty(out, key, {
        value: val,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      const existing = out[key]!;
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        out[key] = [existing, val];
      }
    }
  }
  return out;
}

/** Deterministic key-sorted query serializer (`?a=1&b=2` or `""`). */
export function stringifySearchRecord(
  query: Readonly<Record<string, QueryValue>>,
  options: { sortKeys?: boolean } = {},
): string {
  const keys = Object.keys(query);
  if (options.sortKeys !== false) keys.sort();
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    if (!OWN.call(query, key)) continue;
    const value = query[key];
    if (value === undefined) continue;
    const encodedKey = encodeUriPart(key);
    if (typeof value === "string") {
      parts.push(`${encodedKey}=${encodeUriPart(value)}`);
    } else {
      for (let j = 0; j < value.length; j += 1) {
        parts.push(`${encodedKey}=${encodeUriPart(value[j]!)}`);
      }
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Normalize `.` / `..` segments and ensure a leading `/`. */
export function normalizePathname(rawPathname: string): string {
  const rawSegments = rawPathname.split("/");
  const resolved: string[] = [];
  for (let i = 0; i < rawSegments.length; i += 1) {
    const segment = rawSegments[i]!;
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(decodeUriPart(segment, false));
  }
  return `/${resolved.map((segment) => encodeUriPart(segment)).join("/")}`;
}

export interface ParsedPocketUri {
  readonly scheme: string;
  readonly authority: string;
  readonly pathname: string;
  readonly decodedSegments: readonly string[];
  readonly search: string;
  readonly query: QueryRecord;
  readonly hash: string;
  readonly href: string;
  readonly uri: string;
}

export interface UriNormalizeOptions {
  readonly defaultScheme?: string;
  readonly defaultAuthority?: string;
  /**
   * Authorities treated as container namespaces rather than route segments.
   * Example: with `["showcase", "app"]`, `pocket://showcase/skins` -> `/skins`,
   * whereas `pocket://skins/controls` (mobile shorthand) -> `/skins/controls`.
   */
  readonly stripAuthorities?: readonly string[];
  readonly basePath?: string;
  readonly treatUnknownAuthorityAsPath?: boolean;
}

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/;

/** Parse any full URI, custom mobile scheme, or relative path into canonical parts. */
export function parsePocketUri(
  input: string,
  options: UriNormalizeOptions = {},
  currentPathname = "/",
): ParsedPocketUri {
  const defaultScheme = (options.defaultScheme ?? "pocket").toLowerCase();
  const defaultAuthority = options.defaultAuthority ?? "showcase";
  const stripSet = new Set(
    (options.stripAuthorities ?? [defaultAuthority, "app", "host", "localhost"]).map((item) =>
      item.toLowerCase(),
    ),
  );
  const trimmed = input.trim();

  let working = trimmed;
  let hash = "";
  const hashIndex = working.indexOf("#");
  if (hashIndex >= 0) {
    hash = decodeUriPart(working.slice(hashIndex + 1), false);
    working = working.slice(0, hashIndex);
  }

  let rawSearch = "";
  const queryIndex = working.indexOf("?");
  if (queryIndex >= 0) {
    rawSearch = working.slice(queryIndex);
    working = working.slice(0, queryIndex);
  }

  let scheme = defaultScheme;
  let authority = defaultAuthority;
  let rawPath = working;

  const schemeMatch = SCHEME_RE.exec(working);
  if (schemeMatch) {
    scheme = schemeMatch[1]!.toLowerCase();
    const rest = schemeMatch[2]!;
    if (rest.startsWith("//")) {
      const withoutSlashes = rest.slice(2);
      const slashIndex = withoutSlashes.indexOf("/");
      const rawAuthority =
        slashIndex >= 0 ? withoutSlashes.slice(0, slashIndex) : withoutSlashes;
      const afterAuthority = slashIndex >= 0 ? withoutSlashes.slice(slashIndex) : "/";
      const lowerAuth = rawAuthority.toLowerCase();
      const isWebScheme = scheme === "http" || scheme === "https";
      if (!rawAuthority) {
        authority = defaultAuthority;
        rawPath = afterAuthority;
      } else if (isWebScheme || stripSet.has(lowerAuth)) {
        authority = rawAuthority;
        rawPath = afterAuthority;
      } else if (options.treatUnknownAuthorityAsPath !== false) {
        // Mobile deep-link shorthand: `pocket://skins/controls` -> `/skins/controls`
        authority = defaultAuthority;
        rawPath =
          afterAuthority === "/"
            ? `/${rawAuthority}`
            : `/${rawAuthority}${afterAuthority}`;
      } else {
        authority = rawAuthority;
        rawPath = afterAuthority;
      }
    } else {
      rawPath = rest || "/";
    }
  } else if (!rawPath) {
    rawPath = currentPathname || "/";
  } else if (!rawPath.startsWith("/")) {
    const baseDir = currentPathname.endsWith("/")
      ? currentPathname
      : currentPathname.slice(0, Math.max(0, currentPathname.lastIndexOf("/")) + 1) || "/";
    rawPath = `${baseDir}${rawPath}`;
  }

  if (options.basePath) {
    const normalizedBase = normalizePathname(options.basePath);
    if (normalizedBase !== "/" && rawPath.startsWith(normalizedBase)) {
      rawPath = rawPath.slice(normalizedBase.length) || "/";
    }
  }

  const pathname = normalizePathname(rawPath || "/");
  const decodedSegments =
    pathname === "/"
      ? []
      : pathname
          .slice(1)
          .split("/")
          .filter(Boolean)
          .map((seg) => decodeUriPart(seg, false));
  const query = parseSearchString(rawSearch);
  const search = stringifySearchRecord(query);
  const hashSuffix = hash ? `#${encodeUriPart(hash)}` : "";
  const href = `${pathname}${search}${hashSuffix}`;
  const uri = `${scheme}://${authority}${href}`;

  return {
    scheme,
    authority,
    pathname,
    decodedSegments,
    search,
    query,
    hash,
    href,
    uri,
  };
}

/** Extract a URI string from a host `platform.links` payload or string. */
export function extractLinkUri(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of ["uri", "url", "link", "href", "deepLink"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

// ============================================================================
// 3. Segment Radix Pattern Compiler & Matcher (`rou3`-inspired Specificity)
// ============================================================================

type CompiledSegment =
  | { readonly kind: "static"; readonly value: string }
  | {
      readonly kind: "param";
      readonly name: string;
      readonly optional: boolean;
      readonly constraint?: RegExp;
    }
  | { readonly kind: "wildcard"; readonly name: string };

export interface CompiledRoutePattern<Data = unknown> {
  readonly pattern: string;
  readonly order: number;
  readonly segments: readonly CompiledSegment[];
  readonly data: Data;
}

export interface MatchedRoute<Data = unknown> {
  readonly pattern: string;
  readonly params: Readonly<Record<string, string>>;
  readonly score: number;
  readonly order: number;
  readonly data: Data;
}

const PARAM_SEGMENT_RE = /^:([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]+)\))?(\?)?$/;

export function compileRoutePattern<Data = unknown>(
  pattern: string,
  data: Data,
  order = 0,
): CompiledRoutePattern<Data> {
  const cleaned = pattern.trim() || "/";
  const rawParts = cleaned.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const segments: CompiledSegment[] = [];
  for (let i = 0; i < rawParts.length; i += 1) {
    const part = rawParts[i]!;
    if (part === "*" || part === "**" || part.startsWith("*")) {
      if (i !== rawParts.length - 1) {
        throw new Error(`Wildcard "${part}" in "${pattern}" must be the final segment`);
      }
      const rawName = part.replace(/^\*+:?/, "");
      segments.push({ kind: "wildcard", name: rawName || "*" });
      continue;
    }
    const paramMatch = PARAM_SEGMENT_RE.exec(part);
    if (paramMatch) {
      const name = paramMatch[1]!;
      const regexSrc = paramMatch[2];
      const optional = paramMatch[3] === "?";
      segments.push({
        kind: "param",
        name,
        optional,
        constraint: regexSrc ? new RegExp(`^(?:${regexSrc})$`) : undefined,
      });
      continue;
    }
    segments.push({ kind: "static", value: decodeUriPart(part, false) });
  }
  return { pattern: cleaned.startsWith("/") ? cleaned : `/${cleaned}`, order, segments, data };
}

function matchSegments<Data>(
  compiled: CompiledRoutePattern<Data>,
  pathSegments: readonly string[],
): MatchedRoute<Data> | undefined {
  const { segments } = compiled;
  const params: Record<string, string> = {};
  let score = 0;
  let pathIdx = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx += 1) {
    const seg = segments[segIdx]!;
    const weight = Math.max(1, 16 - segIdx);
    if (seg.kind === "wildcard") {
      const rest = pathSegments.slice(pathIdx).join("/");
      if (rest.length > 0 || pathIdx < pathSegments.length) {
        params[seg.name] = rest;
      }
      score += 80 * weight;
      pathIdx = pathSegments.length;
      return {
        pattern: compiled.pattern,
        params,
        score,
        order: compiled.order,
        data: compiled.data,
      };
    }

    const current = pathSegments[pathIdx];
    if (seg.kind === "static") {
      if (current === undefined || current !== seg.value) return undefined;
      score += 400 * weight;
      pathIdx += 1;
      continue;
    }

    // Param segment
    if (current === undefined) {
      if (seg.optional) {
        score += 120 * weight;
        continue;
      }
      return undefined;
    }
    if (seg.constraint && !seg.constraint.test(current)) {
      return undefined;
    }
    params[seg.name] = current;
    score += (seg.constraint ? 300 : seg.optional ? 190 : 220) * weight;
    pathIdx += 1;
  }

  if (pathIdx !== pathSegments.length) return undefined;
  if (segments.length === 0 && pathSegments.length === 0) {
    score = 5000;
  }
  return {
    pattern: compiled.pattern,
    params,
    score,
    order: compiled.order,
    data: compiled.data,
  };
}

/** Build a concrete pathname from a route pattern and parameter map. */
export function fillRoutePattern(
  pattern: string,
  params: Readonly<Record<string, string | number | boolean | undefined>> = {},
): string {
  const compiled = compileRoutePattern(pattern, null);
  const built: string[] = [];
  for (let i = 0; i < compiled.segments.length; i += 1) {
    const seg = compiled.segments[i]!;
    if (seg.kind === "static") {
      built.push(encodeUriPart(seg.value));
      continue;
    }
    if (seg.kind === "wildcard") {
      const raw = params[seg.name] ?? params["*"];
      if (raw !== undefined && String(raw).length > 0) {
        const parts = String(raw)
          .split("/")
          .filter(Boolean)
          .map((item) => encodeUriPart(item));
        built.push(...parts);
      }
      continue;
    }
    const raw = params[seg.name];
    if (raw === undefined || String(raw).length === 0) {
      if (seg.optional) continue;
      throw new Error(`Missing required route param ":${seg.name}" for pattern "${pattern}"`);
    }
    const text = String(raw);
    if (seg.constraint && !seg.constraint.test(text)) {
      throw new Error(`Invalid route param ":${seg.name}"="${text}" for pattern "${pattern}"`);
    }
    built.push(encodeUriPart(text));
  }
  return `/${built.join("/")}`;
}

export interface PocketRadixMatcher<Data = unknown> {
  add(pattern: string, data: Data): void;
  match(pathnameOrSegments: string | readonly string[]): MatchedRoute<Data> | undefined;
  matchAll(pathnameOrSegments: string | readonly string[]): MatchedRoute<Data>[];
}

/** Fast static-map + segment-radix matcher with `rou3` specificity ordering. */
export function createRouteMatcher<Data = unknown>(): PocketRadixMatcher<Data> {
  const staticRoutes = new Map<string, CompiledRoutePattern<Data>>();
  const dynamicBuckets = new Map<string, CompiledRoutePattern<Data>[]>();
  const genericDynamic: CompiledRoutePattern<Data>[] = [];
  let registrationOrder = 0;

  const toSegments = (input: string | readonly string[]): readonly string[] => {
    if (typeof input !== "string") return input;
    const normalized = normalizePathname(input);
    return normalized === "/"
      ? []
      : normalized
          .slice(1)
          .split("/")
          .filter(Boolean)
          .map((seg) => decodeUriPart(seg, false));
  };

  const rankMatches = (matches: MatchedRoute<Data>[]): MatchedRoute<Data>[] =>
    matches.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.order - b.order));

  return {
    add(pattern: string, data: Data): void {
      const compiled = compileRoutePattern(pattern, data, registrationOrder++);
      const allStatic = compiled.segments.every((seg) => seg.kind === "static");
      if (allStatic) {
        const key = `/${compiled.segments.map((seg) => (seg.kind === "static" ? seg.value : "")).join("/")}`;
        if (!staticRoutes.has(key)) staticRoutes.set(key, compiled);
      }
      const first = compiled.segments[0];
      if (first?.kind === "static") {
        const list = dynamicBuckets.get(first.value) ?? [];
        list.push(compiled);
        dynamicBuckets.set(first.value, list);
      } else {
        genericDynamic.push(compiled);
      }
    },

    match(pathnameOrSegments): MatchedRoute<Data> | undefined {
      const segments = toSegments(pathnameOrSegments);
      const staticKey = `/${segments.join("/")}`;
      const exactStatic = staticRoutes.get(staticKey);
      if (exactStatic) {
        return {
          pattern: exactStatic.pattern,
          params: {},
          score: 10_000,
          order: exactStatic.order,
          data: exactStatic.data,
        };
      }
      const candidates = [
        ...(segments[0] !== undefined ? (dynamicBuckets.get(segments[0]) ?? []) : []),
        ...genericDynamic,
      ];
      const matches: MatchedRoute<Data>[] = [];
      for (let i = 0; i < candidates.length; i += 1) {
        const hit = matchSegments(candidates[i]!, segments);
        if (hit) matches.push(hit);
      }
      return rankMatches(matches)[0];
    },

    matchAll(pathnameOrSegments): MatchedRoute<Data>[] {
      const segments = toSegments(pathnameOrSegments);
      const candidates = [
        ...(segments[0] !== undefined ? (dynamicBuckets.get(segments[0]) ?? []) : []),
        ...genericDynamic,
      ];
      const seenOrders = new Set<number>();
      const matches: MatchedRoute<Data>[] = [];
      const staticKey = `/${segments.join("/")}`;
      const exactStatic = staticRoutes.get(staticKey);
      if (exactStatic) {
        seenOrders.add(exactStatic.order);
        matches.push({
          pattern: exactStatic.pattern,
          params: {},
          score: 10_000,
          order: exactStatic.order,
          data: exactStatic.data,
        });
      }
      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i]!;
        if (seenOrders.has(candidate.order)) continue;
        const hit = matchSegments(candidate, segments);
        if (hit) {
          seenOrders.add(candidate.order);
          matches.push(hit);
        }
      }
      return rankMatches(matches);
    },
  };
}

// ============================================================================
// 4. Typed State Codecs (`TanStack Router` + `nuqs`-inspired `stateParam`)
// ============================================================================

export type SearchHistoryMode = "replace" | "push";

export interface SearchSyncOptions {
  readonly history?: SearchHistoryMode;
  readonly clearOnDefault?: boolean;
  readonly urlKey?: string;
}

export interface StateCodec<T> {
  readonly defaultValue: T;
  readonly options: SearchSyncOptions;
  parse(raw: QueryValue): T;
  serialize(value: T): QueryValue;
  equals(a: T, b: T): boolean;
  withDefault<Next extends T>(defaultValue: Next): StateCodec<Next>;
  withOptions(options: SearchSyncOptions): StateCodec<T>;
}

export type InferCodecType<C> = C extends StateCodec<infer T> ? T : never;
export type InferSchemaState<S extends Record<string, StateCodec<any>>> = {
  [K in keyof S]: InferCodecType<S[K]>;
};

/** Structural JSON equality for referential stability across URL re-parses. */
export function deepEqualState(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualState(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const recA = a as Record<string, unknown>;
    const recB = b as Record<string, unknown>;
    const keysA = Object.keys(recA);
    const keysB = Object.keys(recB);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i += 1) {
      const key = keysA[i]!;
      if (!OWN.call(recB, key)) return false;
      if (!deepEqualState(recA[key], recB[key])) return false;
    }
    return true;
  }
  return false;
}

function firstQueryString(raw: QueryValue): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
}

export function createStateCodec<T>(config: {
  defaultValue: T;
  parse: (raw: QueryValue, defaultValue: T) => T;
  serialize: (value: T) => QueryValue;
  equals?: (a: T, b: T) => boolean;
  options?: SearchSyncOptions;
}): StateCodec<T> {
  const equals = config.equals ?? deepEqualState;
  const options: SearchSyncOptions = {
    history: "replace",
    clearOnDefault: true,
    ...config.options,
  };
  return {
    defaultValue: config.defaultValue,
    options,
    parse: (raw) => config.parse(raw, config.defaultValue),
    serialize: config.serialize,
    equals,
    withDefault<Next extends T>(defaultValue: Next): StateCodec<Next> {
      return createStateCodec<Next>({
        defaultValue,
        parse: (raw, fallback) => config.parse(raw, fallback) as Next,
        serialize: (val) => config.serialize(val),
        equals: equals as (a: Next, b: Next) => boolean,
        options,
      });
    },
    withOptions(nextOptions: SearchSyncOptions): StateCodec<T> {
      return createStateCodec<T>({
        ...config,
        equals,
        options: { ...options, ...nextOptions },
      });
    },
  };
}

function clampBounds(value: number, bounds?: { min?: number; max?: number }): number {
  let out = value;
  if (bounds?.min !== undefined && out < bounds.min) out = bounds.min;
  if (bounds?.max !== undefined && out > bounds.max) out = bounds.max;
  return out;
}

const BASE64URL_TOKEN_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Built-in type-safe URL state codecs (`stateParam.*`). */
export const stateParam = {
  string(defaultValue = ""): StateCodec<string> {
    return createStateCodec<string>({
      defaultValue,
      parse: (raw, fallback) => {
        const text = firstQueryString(raw);
        return text === undefined ? fallback : text;
      },
      serialize: (value) => value,
    });
  },

  optionalString(): StateCodec<string | undefined> {
    return createStateCodec<string | undefined>({
      defaultValue: undefined,
      parse: (raw) => firstQueryString(raw),
      serialize: (value) => value,
    });
  },

  int(defaultValue = 0, bounds?: { min?: number; max?: number }): StateCodec<number> {
    return createStateCodec<number>({
      defaultValue: clampBounds(Math.trunc(defaultValue), bounds),
      parse: (raw, fallback) => {
        const text = firstQueryString(raw);
        if (text === undefined || text.trim() === "") return fallback;
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) return fallback;
        return clampBounds(Math.trunc(parsed), bounds);
      },
      serialize: (value) => String(Math.trunc(value)),
    });
  },

  number(defaultValue = 0, bounds?: { min?: number; max?: number }): StateCodec<number> {
    return createStateCodec<number>({
      defaultValue: clampBounds(defaultValue, bounds),
      parse: (raw, fallback) => {
        const text = firstQueryString(raw);
        if (text === undefined || text.trim() === "") return fallback;
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) return fallback;
        return clampBounds(parsed, bounds);
      },
      serialize: (value) => String(value),
    });
  },

  boolean(defaultValue = false): StateCodec<boolean> {
    return createStateCodec<boolean>({
      defaultValue,
      parse: (raw, fallback) => {
        const text = firstQueryString(raw)?.trim().toLowerCase();
        if (text === undefined) return fallback;
        if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
        if (text === "0" || text === "false" || text === "no" || text === "off") return false;
        return fallback;
      },
      serialize: (value) => (value ? "1" : "0"),
    });
  },

  enum<const Values extends readonly string[]>(
    allowed: Values,
    defaultValue: Values[number],
  ): StateCodec<Values[number]> {
    const set = new Set<string>(allowed);
    const safeDefault = set.has(defaultValue)
      ? defaultValue
      : (allowed[0] as Values[number]);
    return createStateCodec<Values[number]>({
      defaultValue: safeDefault,
      parse: (raw, fallback) => {
        const text = firstQueryString(raw);
        return text !== undefined && set.has(text) ? (text as Values[number]) : fallback;
      },
      serialize: (value) => (set.has(value) ? value : safeDefault),
    });
  },

  stringArray(defaultValue: readonly string[] = [], separator = ","): StateCodec<string[]> {
    return createStateCodec<string[]>({
      defaultValue: [...defaultValue],
      parse: (raw, fallback) => {
        if (raw === undefined) return [...fallback];
        if (Array.isArray(raw)) {
          return raw.flatMap((entry) => entry.split(separator)).filter((item) => item.length > 0);
        }
        if (raw === "") return [];
        return raw.split(separator).filter((item) => item.length > 0);
      },
      serialize: (value) => (value.length === 0 ? "" : value.join(separator)),
    });
  },

  json<T>(
    defaultValue: T,
    validate?: (parsed: unknown) => T | undefined,
  ): StateCodec<T> {
    return createStateCodec<T>({
      defaultValue,
      parse: (raw, fallback) => {
        const text = firstQueryString(raw);
        if (!text) return fallback;
        try {
          const decoded: unknown = JSON.parse(text);
          if (validate) {
            const checked = validate(decoded);
            return checked !== undefined ? checked : fallback;
          }
          return decoded as T;
        } catch {
          return fallback;
        }
      },
      serialize: (value) => JSON.stringify(value),
    });
  },

  /**
   * Compact URL-safe Base64-UTF8 JSON snapshot codec (`?s=eyJ...`).
   * Ideal for sharing rich nested page state over QR codes, SMS, or IM links
   * without nested percent-encoding bloat.
   */
  snapshot<T>(
    defaultValue: T,
    validate?: (parsed: unknown) => T | undefined,
  ): StateCodec<T> {
    return createStateCodec<T>({
      defaultValue,
      parse: (raw, fallback) => {
        const text = firstQueryString(raw)?.trim();
        if (!text || !BASE64URL_TOKEN_RE.test(text)) return fallback;
        const unpaddedLen = text.replace(/=+$/g, "").length;
        if (unpaddedLen === 0 || unpaddedLen % 4 === 1) return fallback;
        try {
          const jsonText = bytesToUtf8(base64ToBytes(text), { strict: true });
          const decoded: unknown = JSON.parse(jsonText);
          if (validate) {
            const checked = validate(decoded);
            return checked !== undefined ? checked : fallback;
          }
          return decoded as T;
        } catch {
          return fallback;
        }
      },
      serialize: (value) => {
        const jsonText = JSON.stringify(value);
        return bytesToBase64(utf8ToBytes(jsonText))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "");
      },
    });
  },
};

export const routeParam = stateParam;

export function parseSearchWithSchema<S extends Record<string, StateCodec<any>>>(
  query: QueryRecord,
  schema: S,
): InferSchemaState<S> {
  const out: Record<string, unknown> = {};
  for (const [stateKey, codec] of Object.entries(schema)) {
    const queryKey = codec.options.urlKey ?? stateKey;
    out[stateKey] = codec.parse(OWN.call(query, queryKey) ? query[queryKey] : undefined);
  }
  return out as InferSchemaState<S>;
}

export function serializeSearchWithSchema<S extends Record<string, StateCodec<any>>>(
  patch: Partial<InferSchemaState<S>>,
  schema: S,
  baseQuery: QueryRecord = {},
): Record<string, QueryValue> {
  const next: Record<string, QueryValue> = { ...baseQuery };
  for (const [stateKey, codec] of Object.entries(schema)) {
    if (!OWN.call(patch, stateKey)) continue;
    const queryKey = codec.options.urlKey ?? stateKey;
    const value = patch[stateKey as keyof S];
    if (value === undefined) {
      delete next[queryKey];
      continue;
    }
    const isDefault =
      codec.options.clearOnDefault !== false && codec.equals(value, codec.defaultValue);
    if (isDefault) {
      delete next[queryKey];
    } else {
      next[queryKey] = codec.serialize(value);
    }
  }
  return next;
}

// ============================================================================
// 5. Pocket Router Core (`createPocketRouter`, Stack Synthesis & Deep-Linking)
// ============================================================================

export const STACK_QUERY_PARAM = "_stack";

export interface PocketRouteDefinition<
  Id extends string = string,
  Meta = Record<string, unknown>,
> {
  readonly id: Id;
  readonly path: string;
  readonly aliases?: readonly string[];
  /** Primary root/tab route: resets history stack to `[entry]` on standard tab switch. */
  readonly primary?: boolean;
  /** Parent route ID used to synthesize natural back stacks on cold-start deep links. */
  readonly parent?: Id;
  /** Optional static or dynamic redirect target URI/path. */
  readonly redirectTo?: string | ((context: { params: Readonly<Record<string, string>>; query: QueryRecord; parsed: ParsedPocketUri }) => string);
  /** Route-level search schema (`stateParam.*` record or custom validator). */
  readonly searchSchema?: Record<string, StateCodec<any>>;
  /** Query keys automatically carried forward when navigating away from or into this route. */
  readonly retainParams?: readonly string[];
  /** Navigation guard returning `false` to cancel or a URI string to redirect. */
  readonly beforeEnter?: (context: {
    to: ParsedPocketUri;
    params: Readonly<Record<string, string>>;
    from: PocketHistoryEntry<Id, Meta> | undefined;
  }) => boolean | string;
  readonly meta?: Meta;
}

export interface PocketHistoryEntry<
  Id extends string = string,
  Meta = Record<string, unknown>,
> {
  readonly key: string;
  readonly routeId: Id;
  readonly pattern: string;
  readonly scheme: string;
  readonly authority: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly href: string;
  readonly uri: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: QueryRecord;
  readonly state: Readonly<Record<string, unknown>>;
  readonly primary: boolean;
  readonly meta?: Meta;
}

export interface MiniAppDeepLinkPayload {
  readonly appId: string;
  readonly subPath: string;
  readonly query: QueryRecord;
  readonly hash: string;
  readonly uri: string;
  readonly presentationStyle?: "sheet" | "page";
}

export type NavigationHistoryAction = "auto" | "push" | "replace" | "reset";

export interface PocketNavigateOptions<Id extends string = string> {
  readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly search?:
    | Readonly<Record<string, QueryValue | number | boolean | null>>
    | ((prev: QueryRecord) => Readonly<Record<string, QueryValue | number | boolean | null>>);
  readonly hash?: string;
  readonly history?: NavigationHistoryAction;
  /** Synthesize ancestor `parent` routes below the target entry (default `false` for UI nav, `true` for `openDeepLink`). */
  readonly synthesizeStack?: boolean;
  /** Explicit back-stack paths/routeIds to place underneath the target entry. */
  readonly backStack?: readonly (string | Id)[];
  readonly preserveRetainedParams?: boolean;
}

export interface BuildUriOptions<Id extends string = string> {
  readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly search?: Readonly<Record<string, QueryValue | number | boolean | null>>;
  readonly hash?: string;
  readonly includeStack?: boolean | readonly (string | Id)[];
  readonly preserveRetainedParams?: boolean;
}

export interface PocketRouterOptions<
  Id extends string = string,
  Meta = Record<string, unknown>,
> extends UriNormalizeOptions {
  readonly routes: readonly PocketRouteDefinition<Id, Meta>[];
  readonly initialUrl?: string;
  readonly fallbackRouteId?: Id;
  /** Global search keys preserved across navigations when `preserveRetainedParams !== false`. */
  readonly retainParams?: readonly string[];
  /** Prefixes recognized as cross-boundary MiniApp deep links (default `["/miniapp", "/apps"]`). */
  readonly miniAppPrefixes?: readonly string[];
  /** Custom schemes whose authority is the `appId`, e.g. `pocket://app/<appId>/...` */
  readonly miniAppAuthorities?: readonly string[];
  readonly onMiniAppLink?: (payload: MiniAppDeepLinkPayload) => void | Promise<void>;
  readonly onChange?: (
    entry: PocketHistoryEntry<Id, Meta>,
    stack: readonly PocketHistoryEntry<Id, Meta>[],
    reason: "init" | "navigate" | "replace" | "pop" | "deeplink" | "search",
  ) => void;
}

export interface BindPlatformLinksOptions {
  readonly checkInitial?: boolean;
  readonly subscribe?: boolean;
  readonly synthesizeStack?: boolean;
  readonly subscription?: PlatformLinkSubscriptionOptions;
  readonly onError?: (error: unknown) => void;
}

export interface PocketRouter<
  Id extends string = string,
  Meta = Record<string, unknown>,
> {
  readonly routes: readonly PocketRouteDefinition<Id, Meta>[];
  readonly current: Accessor<PocketHistoryEntry<Id, Meta>>;
  readonly stack: Accessor<readonly PocketHistoryEntry<Id, Meta>[]>;
  readonly canGoBack: Accessor<boolean>;
  readonly uri: Accessor<string>;
  readonly href: Accessor<string>;
  readonly pathname: Accessor<string>;
  readonly params: Accessor<Readonly<Record<string, string>>>;
  readonly query: Accessor<QueryRecord>;
  getRoute(id: Id): PocketRouteDefinition<Id, Meta> | undefined;
  resolve(urlOrRouteId: string, options?: PocketNavigateOptions<Id>): PocketHistoryEntry<Id, Meta> | undefined;
  buildHref(urlOrRouteId: string, options?: BuildUriOptions<Id>): string;
  buildUri(urlOrRouteId: string, options?: BuildUriOptions<Id>): string;
  navigate(urlOrRouteId: string, options?: PocketNavigateOptions<Id>): boolean;
  push(urlOrRouteId: string, options?: Omit<PocketNavigateOptions<Id>, "history">): boolean;
  replace(urlOrRouteId: string, options?: Omit<PocketNavigateOptions<Id>, "history">): boolean;
  setSearch(
    patch:
      | Readonly<Record<string, QueryValue | number | boolean | null>>
      | ((prev: QueryRecord) => Readonly<Record<string, QueryValue | number | boolean | null>>),
    options?: { history?: SearchHistoryMode; hash?: string },
  ): boolean;
  /**
   * Coalesce multiple `setSearch` / `navigate` / `useSearchState` updates into
   * a single Solid reactive transaction and a single `onChange` callback.
   */
  batch<T>(fn: () => T): T;
  back(): boolean;
  pop(): boolean;
  openDeepLink(
    rawInput: unknown,
    options?: { synthesizeStack?: boolean; history?: NavigationHistoryAction },
  ): { handled: boolean; kind: "route" | "miniapp" | "ignored"; entry?: PocketHistoryEntry<Id, Meta>; miniApp?: MiniAppDeepLinkPayload };
  bindPlatformExperience(
    experience: PlatformExperience,
    options?: BindPlatformLinksOptions,
  ): () => void;
}

function normalizeQueryPatch(
  rawPatch: Readonly<Record<string, QueryValue | number | boolean | null>>,
  baseQuery: QueryRecord = {},
): Record<string, QueryValue> {
  const next: Record<string, QueryValue> = { ...baseQuery };
  for (const [key, value] of Object.entries(rawPatch)) {
    if (key === STACK_QUERY_PARAM || key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (value === undefined || value === null || value === "") {
      delete next[key];
    } else if (typeof value === "boolean") {
      next[key] = value ? "1" : "0";
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) next[key] = String(value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function splitTargetPathAndSuffix(target: string): {
  pathPart: string;
  suffixPart: string;
} {
  const qIdx = target.indexOf("?");
  const hIdx = target.indexOf("#");
  let cut = -1;
  if (qIdx >= 0 && hIdx >= 0) cut = Math.min(qIdx, hIdx);
  else if (qIdx >= 0) cut = qIdx;
  else if (hIdx >= 0) cut = hIdx;
  return cut >= 0
    ? { pathPart: target.slice(0, cut), suffixPart: target.slice(cut) }
    : { pathPart: target, suffixPart: "" };
}

export function createPocketRouter<
  Id extends string = string,
  Meta = Record<string, unknown>,
>(options: PocketRouterOptions<Id, Meta>): PocketRouter<Id, Meta> {
  if (options.routes.length === 0) {
    throw new Error("createPocketRouter requires at least one route definition");
  }

  const normalizeOpts: UriNormalizeOptions = {
    defaultScheme: options.defaultScheme ?? "pocket",
    defaultAuthority: options.defaultAuthority ?? "showcase",
    stripAuthorities: options.stripAuthorities,
    basePath: options.basePath,
    treatUnknownAuthorityAsPath: options.treatUnknownAuthorityAsPath ?? true,
  };

  const routeMap = new Map<Id, PocketRouteDefinition<Id, Meta>>();
  const matcher = createRouteMatcher<PocketRouteDefinition<Id, Meta>>();
  for (let i = 0; i < options.routes.length; i += 1) {
    const def = options.routes[i]!;
    routeMap.set(def.id, def);
    matcher.add(def.path, def);
    if (def.aliases) {
      for (let j = 0; j < def.aliases.length; j += 1) {
        matcher.add(def.aliases[j]!, def);
      }
    }
  }

  const fallbackRoute =
    (options.fallbackRouteId ? routeMap.get(options.fallbackRouteId) : undefined) ??
    options.routes[0]!;
  const miniAppPrefixes = (options.miniAppPrefixes ?? ["/miniapp", "/apps"]).map((prefix) =>
    normalizePathname(prefix),
  );
  const miniAppAuthSet = new Set(
    (options.miniAppAuthorities ?? ["app", "miniapp"]).map((item) => item.toLowerCase()),
  );

  let entrySequence = 0;
  let currentEntryCache: PocketHistoryEntry<Id, Meta> | undefined;

  const inspectMiniAppUri = (rawInput: string): MiniAppDeepLinkPayload | undefined => {
    const schemeMatch = SCHEME_RE.exec(rawInput.trim());
    if (schemeMatch) {
      const rest = schemeMatch[2]!;
      if (rest.startsWith("//")) {
        const withoutSlashes = rest.slice(2);
        const slashIdx = withoutSlashes.indexOf("/");
        const auth = (slashIdx >= 0 ? withoutSlashes.slice(0, slashIdx) : withoutSlashes).toLowerCase();
        if (miniAppAuthSet.has(auth)) {
          const parsed = parsePocketUri(rawInput, {
            ...normalizeOpts,
            stripAuthorities: [...(normalizeOpts.stripAuthorities ?? []), auth],
          });
          const appId = parsed.decodedSegments[0];
          if (appId) {
            const subPath = `/${parsed.decodedSegments.slice(1).map((s) => encodeUriPart(s)).join("/")}`;
            const style =
              parsed.query.style === "sheet" || parsed.query.style === "page"
                ? parsed.query.style
                : undefined;
            return {
              appId,
              subPath,
              query: parsed.query,
              hash: parsed.hash,
              uri: parsed.uri,
              presentationStyle: style,
            };
          }
        }
      }
    }

    const parsed = parsePocketUri(rawInput, normalizeOpts);
    for (let i = 0; i < miniAppPrefixes.length; i += 1) {
      const prefix = miniAppPrefixes[i]!;
      if (parsed.pathname.startsWith(`${prefix}/`)) {
        const restPath = parsed.pathname.slice(prefix.length + 1);
        const parts = restPath.split("/").filter(Boolean);
        const appId = parts[0] ? decodeUriPart(parts[0], false) : undefined;
        if (appId) {
          const subPath = `/${parts.slice(1).join("/")}`;
          const style =
            parsed.query.style === "sheet" || parsed.query.style === "page"
              ? parsed.query.style
              : undefined;
          return {
            appId,
            subPath,
            query: parsed.query,
            hash: parsed.hash,
            uri: parsed.uri,
            presentationStyle: style,
          };
        }
      }
    }
    return undefined;
  };

  const buildTargetString = (
    target: string,
    navOpts: PocketNavigateOptions<Id> | BuildUriOptions<Id> = {},
    includeStackParam?: readonly string[],
  ): string => {
    const current = currentEntryCache;
    const knownRoute = routeMap.get(target as Id);
    const { pathPart, suffixPart } = splitTargetPathAndSuffix(target);
    let baseParsed: ParsedPocketUri;
    if (knownRoute) {
      const filledPath = fillRoutePattern(knownRoute.path, navOpts.params ?? {});
      baseParsed = parsePocketUri(filledPath, normalizeOpts, current?.pathname ?? "/");
    } else if (navOpts.params && !SCHEME_RE.test(pathPart) && pathPart.includes(":")) {
      const filledPath = fillRoutePattern(pathPart, navOpts.params);
      baseParsed = parsePocketUri(
        `${filledPath}${suffixPart}`,
        normalizeOpts,
        current?.pathname ?? "/",
      );
    } else {
      baseParsed = parsePocketUri(target, normalizeOpts, current?.pathname ?? "/");
    }

    let mergedQuery: Record<string, QueryValue> = { ...baseParsed.query };
    delete mergedQuery[STACK_QUERY_PARAM];

    if (navOpts.preserveRetainedParams !== false && current) {
      const retainKeys = new Set<string>([
        ...(options.retainParams ?? []),
        ...(routeMap.get(current.routeId)?.retainParams ?? []),
      ]);
      for (const key of retainKeys) {
        if (
          !OWN.call(mergedQuery, key) &&
          OWN.call(current.query, key) &&
          current.query[key] !== undefined
        ) {
          mergedQuery[key] = current.query[key];
        }
      }
    }

    if (navOpts.search !== undefined) {
      const rawPatch =
        typeof navOpts.search === "function"
          ? navOpts.search(current?.query ?? baseParsed.query)
          : navOpts.search;
      mergedQuery = normalizeQueryPatch(rawPatch, mergedQuery);
    }

    const hit = matcher.match(baseParsed.decodedSegments);
    const matchedDef = hit?.data ?? knownRoute;
    if (matchedDef?.searchSchema) {
      // Strip any values that equal their codec's default for clean canonical URLs
      for (const [stateKey, codec] of Object.entries(matchedDef.searchSchema)) {
        const queryKey = codec.options.urlKey ?? stateKey;
        if (OWN.call(mergedQuery, queryKey) && codec.options.clearOnDefault !== false) {
          const parsedVal = codec.parse(mergedQuery[queryKey]);
          if (codec.equals(parsedVal, codec.defaultValue)) {
            delete mergedQuery[queryKey];
          }
        }
      }
    }

    if (includeStackParam && includeStackParam.length > 0) {
      mergedQuery[STACK_QUERY_PARAM] = includeStackParam
        .map((item) => item.replace(/,/g, "%2C"))
        .join(",");
    }

    const search = stringifySearchRecord(mergedQuery);
    const hashVal = navOpts.hash !== undefined ? navOpts.hash : baseParsed.hash;
    const hashSuffix = hashVal ? `#${encodeUriPart(hashVal)}` : "";
    return `${baseParsed.scheme}://${baseParsed.authority}${baseParsed.pathname}${search}${hashSuffix}`;
  };

  const resolveEntry = (
    urlOrRouteId: string,
    navOpts: PocketNavigateOptions<Id> = {},
    hop = 0,
    dryRun = false,
  ): { entry: PocketHistoryEntry<Id, Meta>; explicitStack?: readonly string[] } | undefined => {
    if (hop > 8) return undefined;
    const rawInputParsed = urlOrRouteId.includes("?")
      ? parsePocketUri(urlOrRouteId, normalizeOpts, currentEntryCache?.pathname ?? "/")
      : undefined;
    const targetUri = buildTargetString(urlOrRouteId, navOpts);
    const parsed = parsePocketUri(targetUri, normalizeOpts, currentEntryCache?.pathname ?? "/");
    const rawStackParam = OWN.call(rawInputParsed?.query ?? {}, STACK_QUERY_PARAM)
      ? rawInputParsed?.query[STACK_QUERY_PARAM]
      : OWN.call(parsed.query, STACK_QUERY_PARAM)
        ? parsed.query[STACK_QUERY_PARAM]
        : undefined;
    const explicitStack =
      typeof rawStackParam === "string" && rawStackParam.length > 0
        ? rawStackParam.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

    const cleanQueryRecord: Record<string, QueryValue> = { ...parsed.query };
    delete cleanQueryRecord[STACK_QUERY_PARAM];
    const cleanSearch = stringifySearchRecord(cleanQueryRecord);
    const cleanHash = parsed.hash ? `#${encodeUriPart(parsed.hash)}` : "";
    const cleanQuery = parseSearchString(cleanSearch);

    const matched = matcher.match(parsed.decodedSegments);
    const routeDef = matched?.data ?? fallbackRoute;
    const params = matched?.params ?? {};

    if (routeDef.redirectTo) {
      const nextTarget =
        typeof routeDef.redirectTo === "function"
          ? routeDef.redirectTo({ params, query: cleanQuery, parsed })
          : routeDef.redirectTo;
      return resolveEntry(
        nextTarget,
        { preserveRetainedParams: navOpts.preserveRetainedParams },
        hop + 1,
        dryRun,
      );
    }

    if (routeDef.beforeEnter) {
      const guardResult = routeDef.beforeEnter({
        to: parsed,
        params,
        from: currentEntryCache,
      });
      if (guardResult === false) return undefined;
      if (typeof guardResult === "string") {
        return resolveEntry(guardResult, {}, hop + 1, dryRun);
      }
    }

    const validatedState = routeDef.searchSchema
      ? parseSearchWithSchema(cleanQuery, routeDef.searchSchema)
      : { ...cleanQuery };

    // Canonicalize pathname when navigated via alias (e.g. `/ui` -> `/gallery`)
    let canonicalPathname = parsed.pathname;
    if (matched && matched.pattern !== routeDef.path && !routeDef.path.includes(":")) {
      canonicalPathname = normalizePathname(routeDef.path);
    }
    const finalHref = `${canonicalPathname}${cleanSearch}${cleanHash}`;
    const finalUri = `${parsed.scheme}://${parsed.authority}${finalHref}`;
    const seq = dryRun ? entrySequence + 1 : ++entrySequence;

    const entry: PocketHistoryEntry<Id, Meta> = {
      key: `${routeDef.id}-${seq}`,
      routeId: routeDef.id,
      pattern: routeDef.path,
      scheme: parsed.scheme,
      authority: parsed.authority,
      pathname: canonicalPathname,
      search: cleanSearch,
      hash: parsed.hash,
      href: finalHref,
      uri: finalUri,
      params,
      query: cleanQuery,
      state: validatedState,
      primary: routeDef.primary === true,
      meta: routeDef.meta,
    };

    return { entry, explicitStack };
  };

  const buildRetainedSeedFromLeaf = (
    leafEntry: PocketHistoryEntry<Id, Meta>,
  ): Record<string, QueryValue> => {
    const seed: Record<string, QueryValue> = {};
    for (const key of options.retainParams ?? []) {
      if (OWN.call(leafEntry.query, key) && leafEntry.query[key] !== undefined) {
        seed[key] = leafEntry.query[key];
      }
    }
    return seed;
  };

  const synthesizeAncestors = (
    leafEntry: PocketHistoryEntry<Id, Meta>,
    explicitBackStack?: readonly string[],
  ): PocketHistoryEntry<Id, Meta>[] => {
    const retainedSeed = buildRetainedSeedFromLeaf(leafEntry);
    const hasRetainedSeed = Object.keys(retainedSeed).length > 0;

    if (explicitBackStack && explicitBackStack.length > 0) {
      const built: PocketHistoryEntry<Id, Meta>[] = [];
      for (let i = 0; i < explicitBackStack.length; i += 1) {
        const resolved = resolveEntry(explicitBackStack[i]!, {
          preserveRetainedParams: false,
          ...(hasRetainedSeed
            ? {
                search: (existing) => ({ ...retainedSeed, ...existing }),
              }
            : {}),
        });
        if (resolved && resolved.entry.routeId !== leafEntry.routeId) {
          built.push(resolved.entry);
        }
      }
      built.push(leafEntry);
      return built;
    }

    if (leafEntry.primary) return [leafEntry];
    const chainDefs: PocketRouteDefinition<Id, Meta>[] = [];
    const visited = new Set<Id>([leafEntry.routeId]);
    let cursor = routeMap.get(leafEntry.routeId)?.parent;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const parentDef = routeMap.get(cursor);
      if (!parentDef) break;
      chainDefs.unshift(parentDef);
      if (parentDef.primary) break;
      cursor = parentDef.parent;
    }
    const entries: PocketHistoryEntry<Id, Meta>[] = [];
    for (let i = 0; i < chainDefs.length; i += 1) {
      const ancestor = resolveEntry(chainDefs[i]!.id, {
        preserveRetainedParams: false,
        ...(hasRetainedSeed ? { search: retainedSeed } : {}),
      });
      if (ancestor) entries.push(ancestor.entry);
    }
    entries.push(leafEntry);
    return entries;
  };

  const initialResolved =
    resolveEntry(options.initialUrl ?? fallbackRoute.path, { preserveRetainedParams: false }) ?? {
      entry: {
        key: `${fallbackRoute.id}-${++entrySequence}`,
        routeId: fallbackRoute.id,
        pattern: fallbackRoute.path,
        scheme: normalizeOpts.defaultScheme ?? "pocket",
        authority: normalizeOpts.defaultAuthority ?? "showcase",
        pathname: normalizePathname(fallbackRoute.path),
        search: "",
        hash: "",
        href: normalizePathname(fallbackRoute.path),
        uri: `${normalizeOpts.defaultScheme ?? "pocket"}://${normalizeOpts.defaultAuthority ?? "showcase"}${normalizePathname(fallbackRoute.path)}`,
        params: {},
        query: {},
        state: fallbackRoute.searchSchema ? parseSearchWithSchema({}, fallbackRoute.searchSchema) : {},
        primary: fallbackRoute.primary === true,
        meta: fallbackRoute.meta,
      },
      explicitStack: undefined,
    };

  const initialStack = options.initialUrl
    ? synthesizeAncestors(initialResolved.entry, initialResolved.explicitStack)
    : [initialResolved.entry];
  currentEntryCache = initialStack[initialStack.length - 1]!;

  const [stack, setStack] = createSignal<readonly PocketHistoryEntry<Id, Meta>[]>(initialStack);
  const current = (): PocketHistoryEntry<Id, Meta> => {
    const list = stack();
    return list[list.length - 1]!;
  };
  const canGoBack = (): boolean => stack().length > 1;
  const uri = (): string => current().uri;
  const href = (): string => current().href;
  const pathname = (): string => current().pathname;
  const params = (): Readonly<Record<string, string>> => current().params;
  const query = (): QueryRecord => current().query;

  type CommitReason = "navigate" | "replace" | "pop" | "deeplink" | "search";
  const reasonPriority = (reason: CommitReason): number => {
    switch (reason) {
      case "deeplink":
        return 5;
      case "navigate":
      case "pop":
        return 4;
      case "replace":
        return 2;
      case "search":
        return 1;
    }
  };

  let batchDepth = 0;
  let pendingBatchCommit:
    | {
        top: PocketHistoryEntry<Id, Meta>;
        stack: readonly PocketHistoryEntry<Id, Meta>[];
        reason: CommitReason;
      }
    | undefined;

  const commitStack = (
    nextStack: readonly PocketHistoryEntry<Id, Meta>[],
    reason: CommitReason,
  ): void => {
    const top = nextStack[nextStack.length - 1]!;
    currentEntryCache = top;
    if (batchDepth > 0) {
      setStack(nextStack);
      const effectiveReason =
        pendingBatchCommit &&
        reasonPriority(pendingBatchCommit.reason) > reasonPriority(reason)
          ? pendingBatchCommit.reason
          : reason;
      pendingBatchCommit = { top, stack: nextStack, reason: effectiveReason };
      return;
    }
    runSolidBatch(() => {
      setStack(nextStack);
      options.onChange?.(top, nextStack, reason);
    });
  };

  const applyNavigation = (
    urlOrRouteId: string,
    navOpts: PocketNavigateOptions<Id> = {},
    reason: "navigate" | "replace" | "deeplink" | "search" = "navigate",
  ): boolean => {
    const resolved = resolveEntry(urlOrRouteId, navOpts);
    if (!resolved) return false;
    const nextEntry = resolved.entry;
    const prevStack = untrack(stack);
    const prevTop = prevStack[prevStack.length - 1]!;
    const mode = navOpts.history ?? "auto";

    if (mode === "replace" && prevTop.uri === nextEntry.uri && prevTop.routeId === nextEntry.routeId) {
      return true;
    }

    let nextStack: PocketHistoryEntry<Id, Meta>[];
    if (navOpts.backStack || resolved.explicitStack || navOpts.synthesizeStack) {
      nextStack = synthesizeAncestors(
        nextEntry,
        (navOpts.backStack as readonly string[] | undefined) ?? resolved.explicitStack,
      );
    } else if (mode === "reset" || (mode === "auto" && nextEntry.primary)) {
      nextStack = [nextEntry];
    } else if (mode === "replace") {
      nextStack = [...prevStack.slice(0, -1), { ...nextEntry, key: prevTop.key }];
    } else if (mode === "auto") {
      const existingIdx = prevStack.findLastIndex((item) => item.routeId === nextEntry.routeId);
      if (existingIdx >= 0) {
        nextStack = [...prevStack.slice(0, existingIdx), nextEntry];
      } else {
        nextStack = [...prevStack, nextEntry];
      }
    } else {
      // explicit "push"
      nextStack = [...prevStack, nextEntry];
    }

    const commitReason =
      reason === "deeplink" || reason === "search"
        ? reason
        : mode === "replace"
          ? "replace"
          : reason;
    commitStack(nextStack, commitReason);
    return true;
  };

  const router: PocketRouter<Id, Meta> = {
    routes: options.routes,
    current,
    stack,
    canGoBack,
    uri,
    href,
    pathname,
    params,
    query,
    getRoute: (id) => routeMap.get(id),
    resolve: (urlOrRouteId, navOpts) => resolveEntry(urlOrRouteId, navOpts, 0, true)?.entry,
    buildHref(urlOrRouteId, buildOpts = {}) {
      const full = router.buildUri(urlOrRouteId, buildOpts);
      return parsePocketUri(full, normalizeOpts).href;
    },
    buildUri(urlOrRouteId, buildOpts = {}) {
      let stackPaths: readonly string[] | undefined;
      if (Array.isArray(buildOpts.includeStack)) {
        stackPaths = buildOpts.includeStack.map((idOrPath) => {
          const def = routeMap.get(idOrPath as Id);
          if (def) return fillRoutePattern(def.path, {});
          return parsePocketUri(String(idOrPath), normalizeOpts).href;
        });
      } else if (buildOpts.includeStack === true) {
        const currentList = untrack(stack);
        if (currentList.length > 1) {
          stackPaths = currentList.slice(0, -1).map((item) => item.href);
        }
      }
      return buildTargetString(urlOrRouteId, buildOpts, stackPaths);
    },
    navigate: (urlOrRouteId, navOpts) => applyNavigation(urlOrRouteId, navOpts, "navigate"),
    push: (urlOrRouteId, navOpts) =>
      applyNavigation(urlOrRouteId, { ...navOpts, history: "push" }, "navigate"),
    replace: (urlOrRouteId, navOpts) =>
      applyNavigation(urlOrRouteId, { ...navOpts, history: "replace" }, "replace"),
    setSearch(patch, searchOpts = {}) {
      const prevStack = untrack(stack);
      const top = prevStack[prevStack.length - 1]!;
      const historyMode: NavigationHistoryAction =
        searchOpts.history === "push" ? "push" : "replace";
      const routeDef = routeMap.get(top.routeId);
      if (routeDef && !routeDef.redirectTo && !routeDef.beforeEnter) {
        const rawPatch = typeof patch === "function" ? patch(top.query) : patch;
        const mergedQuery = normalizeQueryPatch(rawPatch, top.query);
        if (routeDef.searchSchema) {
          for (const [stateKey, codec] of Object.entries(routeDef.searchSchema)) {
            const queryKey = codec.options.urlKey ?? stateKey;
            if (OWN.call(mergedQuery, queryKey) && codec.options.clearOnDefault !== false) {
              const parsedVal = codec.parse(mergedQuery[queryKey]);
              if (codec.equals(parsedVal, codec.defaultValue)) {
                delete mergedQuery[queryKey];
              }
            }
          }
        }
        const nextSearch = stringifySearchRecord(mergedQuery);
        const nextHash = searchOpts.hash !== undefined ? searchOpts.hash : top.hash;
        const hashSuffix = nextHash ? `#${encodeUriPart(nextHash)}` : "";
        const nextHref = `${top.pathname}${nextSearch}${hashSuffix}`;
        const nextUri = `${top.scheme}://${top.authority}${nextHref}`;
        if (historyMode === "replace" && nextUri === top.uri) {
          return true;
        }
        const cleanQuery = parseSearchString(nextSearch);
        const nextState = routeDef.searchSchema
          ? parseSearchWithSchema(cleanQuery, routeDef.searchSchema)
          : { ...cleanQuery };
        const nextEntry: PocketHistoryEntry<Id, Meta> = {
          ...top,
          key: historyMode === "replace" ? top.key : `${top.routeId}-${++entrySequence}`,
          search: nextSearch,
          hash: nextHash,
          href: nextHref,
          uri: nextUri,
          query: cleanQuery,
          state: nextState,
        };
        const nextStack =
          historyMode === "replace"
            ? [...prevStack.slice(0, -1), nextEntry]
            : [...prevStack, nextEntry];
        commitStack(nextStack, "search");
        return true;
      }
      return applyNavigation(
        top.pathname,
        {
          search: patch,
          hash: searchOpts.hash ?? top.hash,
          history: historyMode,
          preserveRetainedParams: false,
        },
        "search",
      );
    },
    batch<T>(fn: () => T): T {
      batchDepth += 1;
      return runSolidBatch(() => {
        try {
          return fn();
        } finally {
          batchDepth -= 1;
          if (batchDepth === 0 && pendingBatchCommit) {
            const committed = pendingBatchCommit;
            pendingBatchCommit = undefined;
            options.onChange?.(committed.top, committed.stack, committed.reason);
          }
        }
      });
    },
    back() {
      const list = untrack(stack);
      if (list.length <= 1) return false;
      commitStack(list.slice(0, -1), "pop");
      return true;
    },
    pop() {
      return router.back();
    },
    openDeepLink(rawInput, deepOpts = {}) {
      const uriText = extractLinkUri(rawInput);
      if (!uriText) return { handled: false, kind: "ignored" };

      const miniApp = inspectMiniAppUri(uriText);
      if (miniApp) {
        void options.onMiniAppLink?.(miniApp);
        return { handled: true, kind: "miniapp", miniApp };
      }

      const synthesize = deepOpts.synthesizeStack !== false;
      const ok = applyNavigation(
        uriText,
        {
          history: deepOpts.history ?? "auto",
          synthesizeStack: synthesize,
          preserveRetainedParams: false,
        },
        "deeplink",
      );
      return ok
        ? { handled: true, kind: "route", entry: untrack(current) }
        : { handled: false, kind: "ignored" };
    },
    bindPlatformExperience(experience, bindOpts = {}) {
      let disposed = false;
      let subscription: PlatformLinkSubscription | undefined;
      const synthesize = bindOpts.synthesizeStack !== false;

      if (bindOpts.checkInitial !== false) {
        void experience.links
          .initial()
          .then((payload) => {
            if (disposed) return;
            router.openDeepLink(payload, { synthesizeStack: synthesize });
          })
          .catch((error: unknown) => {
            if (!isUnsupportedPlatformError(error)) bindOpts.onError?.(error);
          });
      }

      if (bindOpts.subscribe !== false) {
        try {
          subscription = experience.subscribeLinks((payload) => {
            if (disposed) return;
            router.openDeepLink(payload, { synthesizeStack: synthesize });
          }, bindOpts.subscription);
        } catch (error) {
          if (!isUnsupportedPlatformError(error)) bindOpts.onError?.(error);
        }
      }

      return () => {
        disposed = true;
        subscription?.unsubscribe();
      };
    },
  };

  return router;
}

// ============================================================================
// 6. SolidJS Context & Fine-Grained Two-Way URL State Hooks
// ============================================================================

const PocketRouterContext = createContext<PocketRouter<any, any> | undefined>(undefined);
const PocketRouteScopeContext = createContext<string | undefined>(undefined);

function findScopedStackEntry<Id extends string = string, Meta = Record<string, unknown>>(
  router: PocketRouter<Id, Meta>,
  scopedRouteId: string | undefined,
): PocketHistoryEntry<Id, Meta> | undefined {
  if (!scopedRouteId) return router.current();
  const entries = router.stack();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const candidate = entries[i]!;
    if (candidate.routeId === scopedRouteId) return candidate;
  }
  return undefined;
}

export function PocketRouterProvider<Id extends string = string, Meta = Record<string, unknown>>(props: {
  router: PocketRouter<Id, Meta>;
  children: JSX.Element;
}): JSX.Element {
  return PocketRouterContext.Provider({
    value: props.router,
    get children() {
      return props.children;
    },
  });
}

/** Scopes `useSearchState` / `useParams` inside a retained `<RouteView>` page. */
export function PocketRouteScope(props: {
  routeId: string;
  children: JSX.Element;
}): JSX.Element {
  return PocketRouteScopeContext.Provider({
    value: props.routeId,
    get children() {
      return props.children;
    },
  });
}

export function usePocketRouter<
  Id extends string = string,
  Meta = Record<string, unknown>,
>(): PocketRouter<Id, Meta> {
  const router = useContext(PocketRouterContext);
  if (!router) {
    throw new Error("usePocketRouter must be called inside <PocketRouterProvider>");
  }
  return router as PocketRouter<Id, Meta>;
}

export function useOptionalPocketRouter<
  Id extends string = string,
  Meta = Record<string, unknown>,
>(): PocketRouter<Id, Meta> | undefined {
  return useContext(PocketRouterContext) as PocketRouter<Id, Meta> | undefined;
}

export function useLocation<
  Id extends string = string,
  Meta = Record<string, unknown>,
>(): Accessor<PocketHistoryEntry<Id, Meta>> {
  return usePocketRouter<Id, Meta>().current;
}

/**
 * Reactive route path parameters (`:tab`, `:id`), reading the route's own stack
 * frame when retained underneath another page and preserving the last matched
 * params while an outgoing `<RouteView>` animates off-screen.
 */
export function useRouteParams<
  Params extends Record<string, string | undefined> = Record<string, string | undefined>,
>(options: { routeId?: string } = {}): Accessor<Readonly<Params>> {
  const router = useOptionalPocketRouter();
  const scopedRouteId = options.routeId ?? useContext(PocketRouteScopeContext);
  let lastMatched: Readonly<Record<string, string>> = {};
  return (): Readonly<Params> => {
    if (!router) return lastMatched as unknown as Readonly<Params>;
    const entry = findScopedStackEntry(router, scopedRouteId);
    if (entry) {
      lastMatched = entry.params;
    }
    return lastMatched as unknown as Readonly<Params>;
  };
}

export interface UseSearchStateOptions extends SearchSyncOptions {
  /**
   * Optional route scope for retained `<RouteView>` pages. Reads the route's
   * own stack entry when retained underneath another route, and preserves its
   * last value after pop without polluting the foreground route's query string.
   */
  readonly routeId?: string;
}

/**
 * Two-way reactive URL search-param hook (`nuqs` `useQueryState` + SolidJS Signal).
 *
 * Works seamlessly both inside `<PocketRouterProvider>` (syncing live with the
 * router URL) and standalone in isolated component tests (falling back to a
 * local Solid signal).
 */
export function useSearchState<T>(
  key: string,
  codec: StateCodec<T>,
  options: UseSearchStateOptions = {},
): [Accessor<T>, (next: T | ((prev: T) => T), callOptions?: SearchSyncOptions) => void] {
  const router = useOptionalPocketRouter();
  const scopedRouteId = options.routeId ?? useContext(PocketRouteScopeContext);
  const queryKey = options.urlKey ?? codec.options.urlKey ?? key;
  const clearOnDefault = options.clearOnDefault ?? codec.options.clearOnDefault ?? true;
  const defaultHistory = options.history ?? codec.options.history ?? "replace";

  const [fallbackSignal, setFallbackSignal] = createSignal<T>(codec.defaultValue);
  let cachedValue: T = codec.defaultValue;

  const value = (): T => {
    if (!router) return fallbackSignal();
    const entry = findScopedStackEntry(router, scopedRouteId);
    if (!entry) {
      return cachedValue;
    }
    const raw = OWN.call(entry.query, queryKey) ? entry.query[queryKey] : undefined;
    const parsed = codec.parse(raw);
    if (!codec.equals(parsed, cachedValue)) {
      cachedValue = parsed;
    }
    return cachedValue;
  };

  const setValue = (
    updater: T | ((prev: T) => T),
    callOptions: SearchSyncOptions = {},
  ): void => {
    const prev = untrack(value);
    const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
    cachedValue = next;
    setFallbackSignal(() => next);
    if (!router) return;

    const top = untrack(router.current);
    if (scopedRouteId && top.routeId !== scopedRouteId) {
      return;
    }
    const shouldClear = (callOptions.clearOnDefault ?? clearOnDefault) && codec.equals(next, codec.defaultValue);
    const serialized = shouldClear ? undefined : codec.serialize(next);
    router.setSearch(
      (prevQuery) => ({
        ...prevQuery,
        [queryKey]: serialized ?? null,
      }),
      { history: callOptions.history ?? defaultHistory },
    );
  };

  return [value, setValue];
}

/**
 * Atomic multi-key search state hook (`nuqs` `useQueryStates` for SolidJS).
 */
export function useSearchStates<S extends Record<string, StateCodec<any>>>(
  schema: S,
  options: { routeId?: string; history?: SearchHistoryMode } = {},
): [
  Accessor<InferSchemaState<S>>,
  (
    patch:
      | Partial<InferSchemaState<S>>
      | ((prev: InferSchemaState<S>) => Partial<InferSchemaState<S>>),
    callOptions?: { history?: SearchHistoryMode },
  ) => void,
] {
  const router = useOptionalPocketRouter();
  const scopedRouteId = options.routeId ?? useContext(PocketRouteScopeContext);
  const initial = parseSearchWithSchema({}, schema);
  const [fallback, setFallback] = createSignal<InferSchemaState<S>>(initial);
  let cached: InferSchemaState<S> = initial;

  const values = (): InferSchemaState<S> => {
    if (!router) return fallback();
    const entry = findScopedStackEntry(router, scopedRouteId);
    if (!entry) {
      return cached;
    }
    const parsed = parseSearchWithSchema(entry.query, schema);
    if (!deepEqualState(parsed, cached)) {
      cached = parsed;
    }
    return cached;
  };

  const setValues = (
    updater:
      | Partial<InferSchemaState<S>>
      | ((prev: InferSchemaState<S>) => Partial<InferSchemaState<S>>),
    callOptions: { history?: SearchHistoryMode } = {},
  ): void => {
    const prev = untrack(values);
    const patch = typeof updater === "function" ? updater(prev) : updater;
    const merged = { ...prev, ...patch } as InferSchemaState<S>;
    cached = merged;
    setFallback(() => merged);
    if (!router) return;
    const top = untrack(router.current);
    if (scopedRouteId && top.routeId !== scopedRouteId) return;
    router.setSearch(
      (prevQuery) => serializeSearchWithSchema(patch, schema, prevQuery),
      { history: callOptions.history ?? options.history ?? "replace" },
    );
  };

  return [values, setValues];
}
