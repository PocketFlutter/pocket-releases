import { randomUUID } from "node:crypto";
import { constants as openConstants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrebuiltTools } from "../scripts/prebuilt_tools.mjs";
import { loadValidatedResourceCatalog } from "./resources.ts";

const appIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const slugPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const projectInputDirectories = new Set([
  "node_modules", ".git", ".pocket-build", "build", "builds", "dist", "out", "updates", "keys",
]);
const ignoredDirectories = new Set([".cache", ".output", "coverage", "target"]);
const allowedExternalSdkLinks = new Set([
  "vendor/pocket-ui",
  "vendor/pocket-looseleaf",
  "vendor/pocket-arc",
]);
const maxJsonBytes = 256 * 1024;
const maxSourceBytes = 16 * 1024 * 1024;

type JsonObject = Record<string, unknown>;
type FileSnapshot = { exists: false } | { exists: true; bytes: Buffer; mode: number };
type PlannedWrite = { path: string; bytes: Buffer; original: Buffer; mode: number };

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let cachedTypeScript: any;

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${label} must contain a JSON object`);
  return value;
}

async function rootDirectory(projectRoot: string): Promise<string> {
  const input = resolve(projectRoot);
  const info = await lstat(input);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("project root must be a regular directory");
  return await realpath(input);
}

async function safeProjectFile(root: string, relativePath: string, required = true): Promise<string> {
  if (!relativePath || relativePath.includes("\0") || relativePath.includes("\\") || isAbsolute(relativePath)) {
    throw new Error(`unsafe project file path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`unsafe project file path: ${relativePath}`);
  }
  const path = resolve(root, ...segments);
  if (!isInside(root, path)) throw new Error(`project file escapes project root: ${relativePath}`);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return path;
      throw new Error(`project file is unavailable: ${relativePath}`);
    }
    if (info.isSymbolicLink()) throw new Error(`project identity path must not be a symlink: ${relativePath}`);
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw new Error(`project path parent is not a directory: ${relativePath}`);
    }
    if (index === segments.length - 1 && !info.isFile()) {
      throw new Error(`project identity path is not a regular file: ${relativePath}`);
    }
  }
  const canonical = await realpath(path);
  if (!isInside(root, canonical)) throw new Error(`project file escapes project root: ${relativePath}`);
  return path;
}

async function readRegular(path: string, maximum: number, label: string): Promise<{ bytes: Buffer; mode: number }> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label} must be a regular file`);
  if (info.size > maximum) throw new Error(`${label} exceeds the ${maximum}-byte limit`);
  return { bytes: await readFile(path), mode: info.mode & 0o777 };
}

async function readJson(path: string, label: string): Promise<{ value: JsonObject; bytes: Buffer; mode: number }> {
  const file = await readRegular(path, maxJsonBytes, label);
  let value: unknown;
  try {
    value = JSON.parse(file.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { value: requireObject(value, label), ...file };
}

async function planJsonField(
  root: string,
  relativePath: string,
  field: string,
  oldId: string,
  newId: string,
  plan: Map<string, PlannedWrite>,
): Promise<void> {
  const path = await safeProjectFile(root, relativePath, false);
  const snapshot = await snapshotPath(root, path);
  if (!snapshot.exists) return;
  const value = requireObject(JSON.parse(snapshot.bytes.toString("utf8")), relativePath);
  if (value[field] === undefined) return;
  if (value[field] !== oldId) throw new Error(`${relativePath}.${field} must match catalog package ${oldId}`);
  addPlan(plan, path, snapshot.bytes, snapshot.mode, jsonBytes({ ...value, [field]: newId }));
}

function remapObjectKeys(value: JsonObject, ids: ReadonlyMap<string, string>, label: string): JsonObject {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    const nextKey = ids.get(key) ?? key;
    if (Object.hasOwn(result, nextKey)) throw new Error(`${label} key collides after app id rename: ${nextKey}`);
    result[nextKey] = entry;
  }
  return result;
}

function addPlan(plan: Map<string, PlannedWrite>, path: string, original: Buffer, mode: number, next: string | Buffer): void {
  const bytes = Buffer.isBuffer(next) ? next : Buffer.from(next, "utf8");
  if (bytes.equals(original)) return;
  const previous = plan.get(path);
  if (previous && !previous.bytes.equals(bytes)) throw new Error(`conflicting identity edits target ${path}`);
  plan.set(path, { path, bytes, original, mode });
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableChildSuffix(packageId: string, packageRoot: string, oldRootId: string): string {
  const prefix = `${oldRootId}.`;
  if (packageId.startsWith(prefix)) {
    const suffix = packageId.slice(prefix.length);
    if (!suffix || !appIdPattern.test(`${oldRootId}.${suffix}`)) {
      throw new Error(`managed child package has an invalid suffix: ${packageId}`);
    }
    return suffix;
  }
  const tail = packageId.slice(packageId.lastIndexOf(".") + 1);
  const candidates = [tail, basename(packageRoot)];
  for (const candidate of candidates) {
    const slug = candidate
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/-+$/g, "");
    if (slugPattern.test(slug)) return slug;
  }
  throw new Error(`cannot derive a stable child slug from ${packageId} or ${packageRoot}`);
}

function mappedReference(value: string, ids: ReadonlyMap<string, string>): string | undefined {
  const direct = ids.get(value);
  if (direct && direct !== value) return direct;
  const prefix = "pocket://app/";
  if (!value.startsWith(prefix)) return undefined;
  const tail = value.slice(prefix.length);
  const boundary = tail.search(/[/?#]/);
  const oldId = boundary < 0 ? tail : tail.slice(0, boundary);
  const nextId = ids.get(oldId);
  if (!nextId || nextId === oldId) return undefined;
  return `${prefix}${nextId}${tail.slice(oldId.length)}`;
}

function pinnedTypeScript(): any {
  if (cachedTypeScript) return cachedTypeScript;
  const roots: string[] = [];
  const configured = process.env.POCKET_UPSTREAM_ROOT?.trim();
  if (configured) roots.push(resolve(configured));
  try { roots.push(resolvePrebuiltTools(sdkRoot).compiler); } catch {}
  roots.push(join(sdkRoot, ".cache/pocketjs"));
  for (const compilerRoot of new Set(roots)) {
    const tsPath = join(compilerRoot, "node_modules/typescript/lib/typescript.js");
    if (!existsSync(tsPath)) continue;
    cachedTypeScript = require(tsPath);
    return cachedTypeScript;
  }
  throw new Error("the pinned PocketJS TypeScript parser is unavailable; run npm run setup");
}

function renderStringLiteral(value: string, original: string): string {
  const quote = original[0];
  if (quote === "'") return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n").replaceAll("\r", "\\r")}'`;
  if (quote === "`") return `\`${value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${")}\``;
  return JSON.stringify(value);
}

function rewriteSource(source: string, ids: ReadonlyMap<string, string>, filePath: string): string {
  const ts = pinnedTypeScript();
  const extension = extname(filePath).toLowerCase();
  const scriptKind = extension === ".tsx" ? ts.ScriptKind.TSX
    : extension === ".jsx" ? ts.ScriptKind.JSX
      : [".js", ".mjs", ".cjs"].includes(extension) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`cannot safely migrate app ids in syntactically invalid source: ${filePath}`);
  }
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const visit = (node: any): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const next = mappedReference(node.text, ids);
      if (next && next !== node.text) {
        const start = node.getStart(sourceFile);
        const end = node.getEnd();
        replacements.push({ start, end, text: renderStringLiteral(next, source.slice(start, end)) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (replacements.length === 0) return source;
  replacements.sort((left, right) => right.start - left.start);
  let result = source;
  let previousStart = source.length + 1;
  for (const replacement of replacements) {
    if (replacement.end > previousStart) throw new Error(`overlapping app id string nodes in ${filePath}`);
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
    previousStart = replacement.start;
  }
  return result;
}

async function sourcePlan(
  root: string,
  packageRoot: string,
  excludedDirectories: ReadonlySet<string>,
  ids: ReadonlyMap<string, string>,
  plan: Map<string, PlannedWrite>,
): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).replaceAll("\\", "/");
      if (entry.name === "assets") {
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error(`project assets directory must not be a symlink: ${relativePath}`);
        if (!info.isDirectory()) throw new Error(`project assets path must be a directory: ${relativePath}`);
        continue;
      }
      const editorBackupDirectory = /^\.pocket-ui-backup-[A-Za-z0-9]+$/.test(entry.name);
      if (projectInputDirectories.has(entry.name) || editorBackupDirectory) {
        // Mirror the Editor source-input boundary: package-managed dependencies
        // are not followed, including a symlinked node_modules. The other
        // ignored build/output directories must be real directories.
        if (entry.isSymbolicLink() && entry.name !== "node_modules") {
          throw new Error(`source tree contains a symlink: ${relativePath}`);
        }
        continue;
      }
      if (ignoredDirectories.has(entry.name)) {
        if (entry.isSymbolicLink()) throw new Error(`source tree contains a symlink: ${relativePath}`);
        continue;
      }
      if (excludedDirectories.has(resolve(path))) continue;
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        if (!allowedExternalSdkLinks.has(relativePath)) throw new Error(`source tree contains a symlink: ${relativePath}`);
        try {
          await realpath(path);
        } catch {
          throw new Error(`external SDK link is dangling: ${relativePath}`);
        }
        continue;
      }
      if (info.isDirectory()) { await visit(path); continue; }
      if (!info.isFile() || !sourceExtensions.has(extname(entry.name))) continue;
      if (info.size > maxSourceBytes) throw new Error(`source file exceeds the ${maxSourceBytes}-byte limit: ${relative(root, path)}`);
      const canonical = await realpath(path);
      if (!isInside(root, canonical) || !isInside(packageRoot, canonical)) throw new Error(`source file escapes its package root: ${relative(root, path)}`);
      const original = await readFile(path);
      const source = original.toString("utf8");
      if (!Buffer.from(source, "utf8").equals(original)) throw new Error(`source file is not valid UTF-8: ${relative(root, path)}`);
      const rewritten = rewriteSource(source, ids, path);
      if (rewritten !== source) addPlan(plan, path, original, info.mode & 0o777, rewritten);
    }
  };
  await visit(packageRoot);
}

async function snapshotPath(root: string, path: string): Promise<FileSnapshot> {
  if (!isInside(root, path)) throw new Error("identity transaction file escapes project root");
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`identity transaction target must be a regular file: ${relative(root, path)}`);
    if (info.size > maxJsonBytes) throw new Error(`identity transaction target exceeds the ${maxJsonBytes}-byte limit: ${relative(root, path)}`);
    return { exists: true, bytes: await readFile(path), mode: info.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function atomicWrite(root: string, path: string, bytes: Buffer, mode: number): Promise<void> {
  if (!isInside(root, path)) throw new Error("identity transaction write escapes project root");
  const parent = dirname(path);
  const parentReal = await realpath(parent);
  if (!isInside(root, parentReal)) throw new Error(`identity transaction parent escapes project root: ${relative(root, path)}`);
  const current = await lstat(path);
  if (current.isSymbolicLink() || !current.isFile()) throw new Error(`identity transaction target changed type: ${relative(root, path)}`);
  const temporary = join(parent, `.${basename(path)}.identity-${randomUUID()}.tmp`);
  const flags = openConstants.O_WRONLY | openConstants.O_CREAT | openConstants.O_EXCL | (openConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(temporary, flags, mode || 0o644);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    const rechecked = await lstat(path);
    if (rechecked.isSymbolicLink() || !rechecked.isFile()) throw new Error(`identity transaction target changed type: ${relative(root, path)}`);
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  const result = await lstat(path);
  if (result.isSymbolicLink() || !result.isFile()) throw new Error(`identity transaction wrote an unsafe target: ${relative(root, path)}`);
}

async function restoreSnapshot(root: string, path: string, snapshot: FileSnapshot): Promise<void> {
  if (snapshot.exists) {
    await atomicWrite(root, path, snapshot.bytes, snapshot.mode);
    return;
  }
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`cannot roll back unsafe identity target: ${relative(root, path)}`);
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Rename the root app identity across its managed local System catalog.
 * `commitRootConfig` is supplied by the Editor server so it can write its
 * canonical editor.json/pocket.json fields inside this file transaction.
 */
export async function renameProjectAppIdentity(
  projectRoot: string,
  oldAppId: string,
  newAppId: string,
  commitRootConfig: () => Promise<void>,
): Promise<void> {
  if (!appIdPattern.test(oldAppId) || !appIdPattern.test(newAppId)) throw new Error("app ids must use letters, numbers, dot, underscore, or hyphen and be at most 128 characters");
  const root = await rootDirectory(projectRoot);
  if (oldAppId === newAppId) { await commitRootConfig(); return; }

  const editorPath = await safeProjectFile(root, "editor.json", false);
  const editorSnapshot = await snapshotPath(root, editorPath);
  let editor: JsonObject = {};
  if (editorSnapshot.exists) {
    if (editorSnapshot.bytes.byteLength > maxJsonBytes) throw new Error("editor.json exceeds the project configuration size limit");
    editor = requireObject(JSON.parse(editorSnapshot.bytes.toString("utf8")), "editor.json");
  }
  const rawReuse = editor.reusePublishedPackages;
  if (rawReuse !== undefined && (!Array.isArray(rawReuse) || rawReuse.some((value) => typeof value !== "string" || !appIdPattern.test(value)))) {
    throw new Error("editor.json reusePublishedPackages must contain valid package ids");
  }
  const externalIds = new Set((rawReuse as string[] | undefined) ?? []);
  const idMap = new Map<string, string>([[oldAppId, newAppId]]);
  const plan = new Map<string, PlannedWrite>();
  const packageRoots: string[] = [];
  const excludedChildren = new Set<string>();
  const systemPath = await safeProjectFile(root, "pocket.system.json", false);
  const systemSnapshot = await snapshotPath(root, systemPath);

  if (systemSnapshot.exists) {
    if (systemSnapshot.bytes.byteLength > maxJsonBytes) throw new Error("pocket.system.json exceeds the project configuration size limit");
    const system = requireObject(JSON.parse(systemSnapshot.bytes.toString("utf8")), "pocket.system.json");
    const roles = requireObject(system.roles, "pocket.system.json.roles");
    const applications = requireObject(system.applications, "pocket.system.json.applications");
    const installation = requireObject(system.installation, "pocket.system.json.installation");
    if (roles.systemUI !== oldAppId) throw new Error(`pocket.system.json roles.systemUI must match the current app id ${oldAppId}`);
    if (!Array.isArray(applications.catalog) || !Array.isArray(installation.installedPackages)) {
      throw new Error("pocket.system.json must contain an application catalog and installedPackages list");
    }
    const policy = requireObject(applications.installPolicy, "pocket.system.json applications.installPolicy");
    if (policy.model !== "managed" || policy.mutable !== false) throw new Error("only immutable managed System catalogs can be renamed by the Editor");
    const validated = await loadValidatedResourceCatalog(root, systemPath);
    const rootPackage = validated.find((entry) => entry.package === oldAppId);
    if (!rootPackage) throw new Error(`pocket.system.json catalog does not contain root app ${oldAppId}`);
    const children = validated.filter((entry) => entry.package !== oldAppId);
    const managed = children.filter((entry) => !externalIds.has(entry.package));
    const childRoots = children.map((entry) => resolve(dirname(entry.path)));
    for (let index = 0; index < childRoots.length; index += 1) {
      const childRoot = childRoots[index]!;
      if (!isInside(root, childRoot) || childRoot === root) throw new Error("managed catalog package root must be a child of the project root");
      if (childRoots.some((other, otherIndex) => otherIndex !== index && isInside(other, childRoot))) {
        throw new Error("nested catalog package roots make app identity ownership ambiguous");
      }
      excludedChildren.add(childRoot);
    }
    for (const child of managed) {
      const childRoot = resolve(dirname(child.path));
      const suffix = stableChildSuffix(child.package, childRoot, oldAppId);
      const nextId = `${newAppId}.${suffix}`;
      if (!appIdPattern.test(nextId)) throw new Error(`renamed child app id exceeds the 128-character limit: ${nextId}`);
      if (externalIds.has(nextId)) throw new Error(`renamed child app id conflicts with an externally reused package: ${nextId}`);
      idMap.set(child.package, nextId);
    }

    const nextCatalogIds = new Set<string>();
    for (const entry of validated) {
      const nextId = idMap.get(entry.package) ?? entry.package;
      if (nextCatalogIds.has(nextId)) throw new Error(`renamed app id collides with another catalog package: ${nextId}`);
      nextCatalogIds.add(nextId);
    }

    const nextSystem: JsonObject = {
      ...system,
      roles: { ...roles, systemUI: newAppId },
      applications: {
        ...applications,
        catalog: (applications.catalog as unknown[]).map((raw) => {
          if (!isRecord(raw) || typeof raw.package !== "string") return raw;
          const nextId = idMap.get(raw.package);
          return nextId && nextId !== raw.package ? { ...raw, package: nextId } : raw;
        }),
      },
      installation: {
        ...installation,
        installedPackages: (installation.installedPackages as unknown[]).map((id) => typeof id === "string" ? (idMap.get(id) ?? id) : id),
      },
    };
    addPlan(plan, systemPath, systemSnapshot.bytes, systemSnapshot.exists ? (await lstat(systemPath)).mode & 0o777 : 0o644, jsonBytes(nextSystem));

    for (const entry of [rootPackage, ...managed]) {
      const nextId = idMap.get(entry.package)!;
      const manifestPath = resolve(entry.path);
      const relativeManifest = relative(root, manifestPath).replaceAll("\\", "/");
      const path = await safeProjectFile(root, relativeManifest, true);
      if (entry === rootPackage && relativeManifest === "pocket.json") continue;
      const manifest = await readJson(path, `catalog manifest ${relativeManifest}`);
      if (manifest.value.id !== entry.package) throw new Error(`catalog manifest ${relativeManifest} no longer matches ${entry.package}`);
      addPlan(plan, path, manifest.bytes, manifest.mode, jsonBytes({ ...manifest.value, id: nextId }));

      if (entry !== rootPackage) {
        const packageRoot = resolve(dirname(entry.path));
        const packageRelative = relative(root, packageRoot).split(sep).join("/");
        await planJsonField(root, `${packageRelative}/pocket.json`, "id", entry.package, nextId, plan);
        await planJsonField(root, `${packageRelative}/editor.json`, "appId", entry.package, nextId, plan);
      }
    }

    packageRoots.push(root);
    packageRoots.push(...managed.map((entry) => resolve(dirname(entry.path))));
  } else {
    packageRoots.push(root);
  }

  const resourcePath = await safeProjectFile(root, "pocket.resources.json", false);
  const resourceSnapshot = await snapshotPath(root, resourcePath);
  if (resourceSnapshot.exists) {
    const policy = requireObject(JSON.parse(resourceSnapshot.bytes.toString("utf8")), "pocket.resources.json");
    const packages = requireObject(policy.packages, "pocket.resources.json packages");
    const nextPackages: JsonObject = {};
    for (const [id, value] of Object.entries(packages)) {
      const nextId = idMap.get(id) ?? id;
      if (Object.hasOwn(nextPackages, nextId)) throw new Error(`resource policy package key collides after rename: ${nextId}`);
      nextPackages[nextId] = value;
    }
    const nextPolicy = { ...policy, packages: nextPackages };
    addPlan(plan, resourcePath, resourceSnapshot.bytes, (await lstat(resourcePath)).mode & 0o777, jsonBytes(nextPolicy));
  }

  const generatedPath = await safeProjectFile(root, "generated/compositor-surfaces.json", false);
  const generatedSnapshot = await snapshotPath(root, generatedPath);
  if (generatedSnapshot.exists) {
    const generated = requireObject(JSON.parse(generatedSnapshot.bytes.toString("utf8")), "generated/compositor-surfaces.json");
    if (generated.schemaVersion !== 1) throw new Error("generated/compositor-surfaces.json has an unsupported schema version");
    const surfaces = requireObject(generated.surfaces, "generated compositor surfaces");
    const nextGenerated: JsonObject = { ...generated, surfaces: remapObjectKeys(surfaces, idMap, "generated compositor surfaces") };
    if (generated.applications !== undefined) {
      nextGenerated.applications = remapObjectKeys(requireObject(generated.applications, "generated compositor applications"), idMap, "generated compositor applications");
    }
    addPlan(plan, generatedPath, generatedSnapshot.bytes, generatedSnapshot.mode, jsonBytes(nextGenerated));
  }

  const rootManifest = await safeProjectFile(root, "pocket.json", false);
  const sourceExcluded = new Set(excludedChildren);
  for (const packageRoot of packageRoots) await sourcePlan(root, packageRoot, sourceExcluded, idMap, plan);

  const rootConfigPaths = [editorPath, rootManifest];
  const snapshots = new Map<string, FileSnapshot>();
  for (const write of plan.values()) snapshots.set(write.path, { exists: true, bytes: write.original, mode: write.mode });
  for (const path of rootConfigPaths) if (!snapshots.has(path)) snapshots.set(path, await snapshotPath(root, path));
  const changed: string[] = [];
  let rootCommitStarted = false;
  try {
    for (const write of plan.values()) {
      changed.push(write.path);
      await atomicWrite(root, write.path, write.bytes, write.mode);
    }
    rootCommitStarted = true;
    await commitRootConfig();
  } catch (error) {
    const rollbackPaths = new Set(changed);
    if (rootCommitStarted) for (const path of rootConfigPaths) rollbackPaths.add(path);
    const rollbackErrors: string[] = [];
    for (const path of [...rollbackPaths].reverse()) {
      try { await restoreSnapshot(root, path, snapshots.get(path) ?? { exists: false }); }
      catch (rollbackError) { rollbackErrors.push(`${relative(root, path)}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`); }
    }
    if (rollbackErrors.length) {
      throw new Error(`app identity rename failed; rollback was incomplete (${rollbackErrors.join("; ")})`, { cause: error });
    }
    throw error;
  }
}
