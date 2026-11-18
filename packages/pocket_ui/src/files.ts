import type { HostBridge } from "./host.ts";

export const POCKET_FILES_CHUNK_BYTES = 128 * 1024;

export interface PocketPickedFile {
  /** Opaque host handle. The guest never sees a filesystem path. */
  readonly handle: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
}

export interface PocketFilesPickOptions {
  /** Bare extensions such as "png" (no dot, no wildcard). Omit to accept any file. */
  readonly accept?: readonly string[];
  readonly multiple?: boolean;
}

export interface PocketFileChunk {
  readonly handle: string;
  readonly offset: number;
  readonly length: number;
  readonly size: number;
  readonly eof: boolean;
  /** base64 of `length` raw bytes. */
  readonly data: string;
}

export class PocketFilesError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PocketFilesError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function parseFile(value: unknown): PocketPickedFile {
  if (!isRecord(value) || typeof value.handle !== "string" || !/^[0-9a-f]{32}$/.test(value.handle) ||
      typeof value.name !== "string" || value.name.length === 0 || /[\\/]/.test(value.name) ||
      !isCount(value.size) || typeof value.mime !== "string") {
    throw new PocketFilesError("invalid_files_response", "files.pickOpen returned a malformed file entry");
  }
  return { handle: value.handle, name: value.name, size: value.size, mime: value.mime };
}

function parseChunk(value: unknown, handle: string, offset: number, length: number): PocketFileChunk {
  if (!isRecord(value) || value.handle !== handle || value.offset !== offset || !isCount(value.length) ||
      value.length > length || !isCount(value.size) || typeof value.eof !== "boolean" || typeof value.data !== "string") {
    throw new PocketFilesError("invalid_files_response", "files.readChunk returned a malformed chunk");
  }
  return { handle, offset, length: value.length, size: value.size, eof: value.eof, data: value.data };
}

/**
 * Thin client over the optional pocket_file_picker provider. The guest manifest
 * must declare the capabilities and the `files.open` permission, and the trusted
 * host must grant it. Failures reject with the host bridge error
 * (`capability_unavailable`, `plugin_permission_denied`, `too_large`, `busy`,
 * `file_changed`, `handle_not_found`, `invalid_params`, ...). Call `pickOpen`
 * from an explicit user action.
 */
export function createPocketFilesClient(host: Pick<HostBridge, "request">) {
  return {
    /** Shows the platform open dialog. Resolves `[]` when the user cancels. */
    async pickOpen(options: PocketFilesPickOptions = {}): Promise<PocketPickedFile[]> {
      const params: Record<string, unknown> = {};
      if (options.accept !== undefined) {
        for (const extension of options.accept) {
          if (!/^[A-Za-z0-9]{1,16}$/.test(extension)) throw new TypeError(`accept entries must be bare extensions: ${extension}`);
        }
        params.accept = [...options.accept];
      }
      if (options.multiple !== undefined) params.multiple = options.multiple;
      const result = await host.request<{ files: unknown }>("files.pickOpen", params);
      if (!isRecord(result) || !Array.isArray(result.files)) {
        throw new PocketFilesError("invalid_files_response", "files.pickOpen must return a files array");
      }
      return result.files.map(parseFile);
    },
    async readChunk(handle: string, offset: number, length: number = POCKET_FILES_CHUNK_BYTES): Promise<PocketFileChunk> {
      if (!/^[0-9a-f]{32}$/.test(handle)) throw new TypeError("handle must be a file handle");
      if (!isCount(offset)) throw new RangeError("offset must be a non-negative integer");
      if (!isCount(length) || length < 1 || length > POCKET_FILES_CHUNK_BYTES) {
        throw new RangeError(`length must be 1..${POCKET_FILES_CHUNK_BYTES}`);
      }
      return parseChunk(await host.request("files.readChunk", { handle, offset, length }), handle, offset, length);
    },
    async release(handle: string): Promise<boolean> {
      if (!/^[0-9a-f]{32}$/.test(handle)) throw new TypeError("handle must be a file handle");
      const result = await host.request<{ released: boolean }>("files.release", { handle });
      return isRecord(result) && result.released === true;
    },
  };
}

export type PocketFilesClient = ReturnType<typeof createPocketFilesClient>;

export function pickOpenFiles(host: Pick<HostBridge, "request">, options?: PocketFilesPickOptions): Promise<PocketPickedFile[]> {
  return createPocketFilesClient(host).pickOpen(options);
}
