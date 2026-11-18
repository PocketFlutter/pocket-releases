#!/usr/bin/env node
/**
 * Bootstrap a standalone Pocket Web SDK + Studio from an official GitHub
 * Release. This file intentionally has no local imports so it can run from
 * `curl ... | node -` before the SDK exists on disk.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const RELEASES_URL = 'https://api.github.com/repos/PocketFlutter/Pocket/releases';
export const RELEASE_TAG_URL = 'https://api.github.com/repos/PocketFlutter/Pocket/releases/tags';
export const SOURCE_REPOSITORY = 'PocketFlutter/Pocket';
export const MIN_NODE_VERSION = '22.22.2';
export const MAX_RELEASE_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_CHECKSUM_BYTES = 64 * 1024;
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
export const MAX_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_TAR_ENTRIES = 16_384;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_INSTALL_DIR = join(homedir(), '.pocket', 'studio');

const TRUSTED_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseStableVersion(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^sdk-v/, '').replace(/^v/, '');
  const match = normalized.match(VERSION_RE);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  return { major: parts[0], minor: parts[1], patch: parts[2], version: parts.join('.') };
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseStableVersion(left) : left;
  const b = typeof right === 'string' ? parseStableVersion(right) : right;
  if (!a || !b) throw new Error(`稳定版号无效：${String(left)} / ${String(right)}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  return 0;
}

export function platformTuple(platform = process.platform, arch = process.arch) {
  const tuple = `${platform}-${arch}`;
  if (tuple !== 'darwin-arm64' && tuple !== 'win32-x64') {
    throw new Error(`当前平台 ${tuple} 暂不支持；安装器仅支持 macOS Apple Silicon (darwin-arm64) 和 Windows x64 (win32-x64)。`);
  }
  return tuple;
}

export function releaseAssetNames(version, tuple) {
  const parsed = parseStableVersion(version);
  if (!parsed) throw new Error(`只接受稳定版格式 MAJOR.MINOR.PATCH：${String(version)}`);
  if (tuple !== 'darwin-arm64' && tuple !== 'win32-x64') {
    throw new Error(`不支持的平台归档：${String(tuple)}`);
  }
  const archiveName = `pocket-web-sdk-tools-${tuple}-${parsed.version}.tgz`;
  return { version: parsed.version, tagName: `sdk-v${parsed.version}`, archiveName, checksumName: `${archiveName}.sha256` };
}

export function checkNodeVersion(value = process.versions.node) {
  const actual = parseStableVersion(value);
  const minimum = parseStableVersion(MIN_NODE_VERSION);
  if (!actual || compareVersions(actual, minimum) < 0) {
    throw new Error(`需要 Node.js >= ${MIN_NODE_VERSION}；当前是 ${value || '未知版本'}。请升级 Node.js 后重试，安装器不会修改系统 Node.js。`);
  }
  return actual.version;
}

export function officialHttpsUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); }
  catch { throw new Error('GitHub Release 返回了无效下载地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || !TRUSTED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`拒绝非官方 HTTPS 下载来源：${url.protocol}//${url.host}`);
  }
  if (url.hostname.toLowerCase() === 'github.com' &&
      !/^\/PocketFlutter\/Pocket\/releases\/(?:download|tag)\//i.test(url.pathname)) {
    throw new Error('拒绝不属于 PocketFlutter/Pocket Release 的 GitHub 地址');
  }
  if (url.hostname.toLowerCase() === 'api.github.com' &&
      !/^\/repos\/PocketFlutter\/Pocket\/releases(?:\/tags\/sdk-v\d+\.\d+\.\d+)?$/i.test(url.pathname)) {
    throw new Error('拒绝不属于 PocketFlutter/Pocket Releases API 的地址');
  }
  return url;
}

async function fetchOfficial(fetchImpl, rawUrl, { timeoutMs, headers = {}, maxRedirects = 5 } = {}) {
  let url = officialHttpsUrl(rawUrl);
  const deadline = Date.now() + (timeoutMs ?? DEFAULT_TIMEOUT_MS);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('GitHub Release 请求超时');
    const response = await fetchImpl(url.toString(), {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(remainingMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      if (!location) throw new Error('GitHub Release 重定向缺少 Location');
      if (redirect === maxRedirects) throw new Error('GitHub Release 重定向次数超过上限');
      url = officialHttpsUrl(new URL(location, url).toString());
      continue;
    }
    const finalUrl = response.url || url.toString();
    officialHttpsUrl(finalUrl);
    if (!response.ok) throw new Error(`GitHub Release 请求失败（HTTP ${response.status}）`);
    return response;
  }
  throw new Error('GitHub Release 重定向失败');
}

export async function readBoundedBytes(response, maxBytes, label) {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new Error(`${label} 超过 ${maxBytes} 字节上限`);
  }
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`${label} 超过 ${maxBytes} 字节上限`);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`${label} 超过 ${maxBytes} 字节上限`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, size);
}

function expectedAssets(release, tuple, version) {
  if (!release || release.draft === true || release.prerelease === true) return null;
  const expected = releaseAssetNames(version, tuple);
  if (release.tag_name !== expected.tagName) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const archive = assets.find(asset => asset?.name === expected.archiveName);
  const checksum = assets.find(asset => asset?.name === expected.checksumName);
  if (!archive?.browser_download_url || !checksum?.browser_download_url) return null;
  const archiveUrl = officialHttpsUrl(archive.browser_download_url);
  const checksumUrl = officialHttpsUrl(checksum.browser_download_url);
  const expectedPath = `/PocketFlutter/Pocket/releases/download/${expected.tagName}/`;
  for (const [label, url, filename] of [
    ['SDK archive', archiveUrl, expected.archiveName],
    ['SHA-256 file', checksumUrl, expected.checksumName],
  ]) {
    if (url.hostname.toLowerCase() !== 'github.com' ||
        url.pathname.toLowerCase() !== `${expectedPath}${filename}`.toLowerCase()) {
      throw new Error(`拒绝不匹配的官方 ${label} 地址`);
    }
  }
  return { ...expected, archiveUrl: archiveUrl.toString(), checksumUrl: checksumUrl.toString() };
}

export function selectStableRelease(releases, tuple, requestedVersion = null) {
  const candidates = Array.isArray(releases) ? releases : [releases];
  if (requestedVersion) {
    const expected = releaseAssetNames(requestedVersion, tuple);
    const match = candidates.find(item => item?.tag_name === expected.tagName);
    const selected = expectedAssets(match, tuple, expected.version);
    if (!selected) throw new Error(`官方 Release ${expected.tagName} 缺少匹配的 ${tuple} 归档或 SHA-256 文件`);
    return selected;
  }
  const stable = candidates
    .filter(item => item && item.draft !== true && item.prerelease !== true)
    .map(item => {
      const parsed = parseStableVersion(item.tag_name);
      return parsed ? { item, parsed } : null;
    })
    .filter(Boolean)
    .sort((a, b) => compareVersions(b.parsed, a.parsed));
  for (const candidate of stable) {
    const selected = expectedAssets(candidate.item, tuple, candidate.parsed.version);
    if (selected) return selected;
  }
  throw new Error(`找不到带有 macOS arm64 或 Windows x64 对应完整归档与 SHA-256 的稳定版 Release（${tuple}）`);
}

export function parseSha256File(text, expectedArchiveName) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('SHA-256 校验文件为空');
  for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const match = line.match(/^([a-f\d]{64})(?:\s+\*?(.+?))?$/i);
    if (!match) continue;
    const filename = match[2]?.replaceAll('\\', '/').split('/').at(-1);
    if (!filename || filename === expectedArchiveName) return match[1].toLowerCase();
  }
  throw new Error(`SHA-256 文件未包含 ${expectedArchiveName} 的摘要`);
}

function parseOctal(block, offset, length) {
  const raw = block.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/, '').trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw new Error('tar 包含非法八进制字段');
  return Number.parseInt(raw, 8);
}

function verifyTarChecksum(block) {
  const expected = parseOctal(block, 148, 8);
  let actual = 0;
  for (let index = 0; index < 512; index += 1) actual += index >= 148 && index < 156 ? 32 : block[index];
  if (actual !== expected) throw new Error('tar 头部校验和无效');
}

function parsePax(bytes) {
  const text = bytes.toString('utf8');
  let cursor = 0;
  const result = {};
  while (cursor < text.length) {
    const space = text.indexOf(' ', cursor);
    if (space < 0) break;
    const length = Number.parseInt(text.slice(cursor, space), 10);
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error('tar PAX 长度无效');
    const record = text.slice(space + 1, cursor + length - 1);
    const equals = record.indexOf('=');
    if (equals > 0) result[record.slice(0, equals)] = record.slice(equals + 1);
    cursor += length;
  }
  return result;
}

export function safeArchivePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath || rawPath.includes('\0') || rawPath.includes('\\')) {
    throw new Error('归档路径为空或包含非法字符');
  }
  if (rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) throw new Error(`拒绝绝对归档路径：${rawPath}`);
  const parts = rawPath.split('/');
  if (parts.some(part => part === '..')) throw new Error(`拒绝归档路径穿越：${rawPath}`);
  const filtered = parts.filter(part => part && part !== '.');
  if (!filtered.length) return '';
  if (filtered[0] !== 'package') throw new Error(`归档路径必须位于 package/ 下：${rawPath}`);
  filtered.shift();
  return filtered.join('/');
}

export function extractSafeTarGz(archive, destination, limits = {}) {
  if (!Buffer.isBuffer(archive) && !(archive instanceof Uint8Array)) throw new Error('归档必须是字节数组');
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_EXTRACTED_BYTES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_TAR_ENTRIES;
  const tar = gunzipSync(archive, { maxOutputLength: maxTotalBytes });
  if (!tar.length || tar.length % 512 !== 0) throw new Error('tar 归档长度无效');
  const entries = [];
  const kinds = new Map();
  let totalBytes = 0;
  let offset = 0;
  let paxPath = null;
  let longPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every(value => value === 0)) continue;
    verifyTarChecksum(header);
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const size = parseOctal(header, 124, 12);
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > tar.length) throw new Error('tar 条目大小越界');
    const mode = parseOctal(header, 100, 8);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const headerPath = prefix ? `${prefix}/${name}` : name;
    const payload = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (type === 'g') {
      const pax = parsePax(payload);
      if (pax.path || pax.linkpath) throw new Error('拒绝带全局路径覆盖的 tar');
      continue;
    }
    if (type === 'x') {
      const pax = parsePax(payload);
      if (pax.linkpath) throw new Error('拒绝 tar 符号链接/硬链接');
      if (pax.path) paxPath = pax.path;
      continue;
    }
    if (type === 'L') {
      longPath = payload.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    const effectivePath = paxPath ?? longPath ?? headerPath;
    paxPath = null;
    longPath = null;
    if (['1', '2', '3', '4', '6', 'K', 'S'].includes(type)) throw new Error(`拒绝 tar 链接或特殊节点：${effectivePath}`);
    if (type !== '0' && type !== '5') throw new Error(`不支持的 tar 条目类型：${type}`);
    const isDirectory = type === '5' || effectivePath.endsWith('/');
    const relativePath = safeArchivePath(effectivePath);
    if (!relativePath) continue;
    const priorKind = kinds.get(relativePath);
    const kind = isDirectory ? 'directory' : 'file';
    if (priorKind && (priorKind !== kind || kind === 'file')) throw new Error(`归档路径重复或冲突：${relativePath}`);
    kinds.set(relativePath, kind);
    if (!isDirectory) {
      if (size > maxFileBytes) throw new Error(`归档单文件超过大小限制：${relativePath}`);
      totalBytes += size;
      if (totalBytes > maxTotalBytes) throw new Error('归档解压内容超过总大小上限');
    }
    entries.push({ relativePath, isDirectory, mode: mode & 0o111 ? 0o755 : 0o644, payload });
    if (entries.length > maxEntries) throw new Error('归档条目数超过上限');
  }
  for (const entry of entries) {
    const parents = entry.relativePath.split('/');
    parents.pop();
    for (let index = 1; index <= parents.length; index += 1) {
      const parentPath = parents.slice(0, index).join('/');
      if (kinds.get(parentPath) === 'file') throw new Error(`归档文件与目录冲突：${parentPath}`);
    }
  }
  const root = resolve(destination);
  mkdirSync(root, { recursive: true });
  for (const entry of entries) {
    const target = resolve(root, entry.relativePath);
    const rel = relative(root, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`拒绝越界解压：${entry.relativePath}`);
    if (entry.isDirectory) mkdirSync(target, { recursive: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.payload, { mode: entry.mode, flag: 'wx' });
      try { chmodSync(target, entry.mode); } catch { /* Windows may ignore POSIX mode bits. */ }
    }
  }
  return { root, entries: entries.length, totalBytes };
}

export function validateSdkDirectory(sdkRoot, version, tuple) {
  const root = resolve(sdkRoot);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(join(root, 'provenance.json'), 'utf8'));
  const validNames = new Set(['@pocket/web-sdk-tools', `@pocket/web-sdk-tools-${tuple}`]);
  if (!validNames.has(pkg.name) || pkg.version !== version) throw new Error(`SDK package identity does not match ${tuple}@${version}`);
  if (provenance.sourceRepository !== SOURCE_REPOSITORY || !/^[a-f\d]{40}$/i.test(provenance.sourceCommit ?? '') ||
      !/^[a-f\d]{40}$/i.test(provenance.pinnedPocketJsRevision ?? '')) {
    throw new Error('官方 SDK provenance.json 仓库或固定 PocketJS revision 无效');
  }
  const prebuiltSource = readFileSync(join(root, 'scripts', 'prebuilt_tools.mjs'), 'utf8');
  const readSourceConstant = name => prebuiltSource.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`))?.[1];
  if (readSourceConstant('SDK_VERSION') !== version ||
      readSourceConstant('UPSTREAM_REVISION') !== provenance.pinnedPocketJsRevision) {
    throw new Error('官方 SDK 固定编译器 revision 与 provenance.json 不匹配');
  }
  if (!existsSync(join(root, 'editor', 'server.ts')) ||
      !existsSync(join(root, 'scripts', 'editor_service.mjs')) ||
      !existsSync(join(root, 'scripts', 'studio_upgrade.mjs')) ||
      !existsSync(join(root, 'prebuilt', `pocket-tools-${tuple}-${version}.tgz`))) {
    throw new Error('官方 SDK 安装包缺少 Studio 入口或当前平台预编译工具');
  }
  for (const script of ['setup', 'doctor', 'start']) {
    if (typeof pkg.scripts?.[script] !== 'string') throw new Error(`SDK package 缺少 npm ${script} 命令`);
  }
  return { root, version: pkg.version, packageName: pkg.name, sourceCommit: provenance.sourceCommit };
}

export function inspectManagedInstallation(target, tuple) {
  let stat;
  try { stat = lstatSync(target); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`安装路径已存在且不是普通目录：${target}`);
  try {
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    const provenance = JSON.parse(readFileSync(join(target, 'provenance.json'), 'utf8'));
    const resolvedTarget = resolve(target);
    const parent = resolve(resolvedTarget, '..');
    const hasGitInRoot = existsSync(join(resolvedTarget, '.git'));
    const hasParentSourceRepo = existsSync(join(parent, '.git')) &&
      existsSync(join(parent, 'demo')) && resolve(join(parent, 'sdk')) === resolvedTarget;
    const hasEditorTestTree = existsSync(join(resolvedTarget, 'editor', 'test'));
    const isManaged = (pkg.name === '@pocket/web-sdk-tools' || pkg.name === `@pocket/web-sdk-tools-${tuple}`) &&
      parseStableVersion(pkg.version) && provenance.sourceRepository === SOURCE_REPOSITORY &&
      /^[a-f\d]{40}$/i.test(provenance.sourceCommit ?? '') &&
      !hasGitInRoot && !hasParentSourceRepo && !hasEditorTestTree &&
      existsSync(join(target, 'scripts', 'studio_upgrade.mjs')) &&
      existsSync(join(target, 'scripts', 'editor_service.mjs'));
    if (isManaged) return { version: parseStableVersion(pkg.version).version, root: resolve(target) };
  } catch { /* The destination is not an owned installation; do not alter it. */ }
  throw new Error(`安装路径非空或无法识别为受管 Pocket SDK，已拒绝覆盖：${target}`);
}

function findNpmInvocation() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) return { command: process.execPath, prefix: [npmExecPath] };
  if (process.platform === 'win32') {
    const candidates = [
      join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ];
    const where = spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8', windowsHide: true });
    if (where.status === 0) {
      for (const line of String(where.stdout).split(/\r?\n/).filter(Boolean)) {
        candidates.push(join(dirname(line.trim()), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
      }
    }
    const npmCli = candidates.find(existsSync);
    if (!npmCli) throw new Error('找不到 npm CLI；请安装 Node.js 附带的 npm 后重试');
    return { command: process.execPath, prefix: [npmCli] };
  }
  return { command: 'npm', prefix: [] };
}

function runNpm(args, cwd, { spawn = spawnSync, npmInvocation = findNpmInvocation() } = {}) {
  const result = spawn(npmInvocation.command, [...npmInvocation.prefix, ...args], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw new Error(`npm ${args.join(' ')} 执行失败：${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} 失败（退出码 ${result.status ?? result.signal ?? 'unknown'}）`);
}

async function fetchRelease(fetchImpl, tuple, requestedVersion) {
  const requested = requestedVersion && releaseAssetNames(requestedVersion, tuple);
  const endpoint = requested
    ? `${RELEASE_TAG_URL}/${requested.tagName}`
    : `${RELEASES_URL}?per_page=100`;
  const response = await fetchOfficial(fetchImpl, endpoint, {
    timeoutMs: 15_000,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'pocket-studio-installer' },
  });
  const bytes = await readBoundedBytes(response, MAX_RELEASE_JSON_BYTES, 'GitHub Release 列表');
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('GitHub Release 响应不是有效 JSON'); }
  return selectStableRelease(payload, tuple, requested?.version ?? null);
}

async function downloadAndVerify(fetchImpl, release) {
  const checksumResponse = await fetchOfficial(fetchImpl, release.checksumUrl, {
    timeoutMs: 15_000,
    headers: { 'user-agent': 'pocket-studio-installer' },
  });
  const checksumText = (await readBoundedBytes(checksumResponse, MAX_CHECKSUM_BYTES, 'SHA-256 文件')).toString('utf8');
  const expectedHash = parseSha256File(checksumText, release.archiveName);
  const archiveResponse = await fetchOfficial(fetchImpl, release.archiveUrl, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    headers: { 'user-agent': 'pocket-studio-installer' },
  });
  const archive = await readBoundedBytes(archiveResponse, MAX_ARCHIVE_BYTES, 'SDK Release 归档');
  const actualHash = createHash('sha256').update(archive).digest('hex');
  if (actualHash !== expectedHash) throw new Error(`SDK SHA-256 不匹配（期望 ${expectedHash}，实际 ${actualHash}）`);
  return archive;
}

function validateNodeAndNpm(options) {
  checkNodeVersion(options.nodeVersion ?? process.versions.node);
  if (options.runNpm) return;
  const invocation = findNpmInvocation();
  const result = (options.spawn ?? spawnSync)(invocation.command, [...invocation.prefix, '--version'], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
  });
  if (result.error || result.status !== 0) throw new Error('需要安装 npm 并确保它位于 PATH 中；本安装器不会安装或替换系统 Node.js/npm');
  options.npmInvocation = invocation;
}

export function parseArgs(args) {
  const result = { dir: DEFAULT_INSTALL_DIR, projectRoot: null, version: null, noStart: false, help: false };
  const valueOptions = new Set(['--dir', '--project-root', '--version']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--no-start') { result.noStart = true; continue; }
    const equals = arg.indexOf('=');
    const name = equals >= 0 ? arg.slice(0, equals) : arg;
    if (!valueOptions.has(name)) throw new Error(`未知参数：${arg}`);
    const value = equals >= 0 ? arg.slice(equals + 1) : args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值`);
    if (name === '--dir') result.dir = value;
    if (name === '--project-root') result.projectRoot = value;
    if (name === '--version') {
      const parsed = parseStableVersion(value);
      if (!parsed || parsed.version !== value.trim()) throw new Error('--version 只接受稳定版格式 MAJOR.MINOR.PATCH，例如 0.1.21');
      result.version = parsed.version;
    }
  }
  return result;
}

export function helpText() {
  return [
    'Pocket Studio 独立 Web SDK 一键安装',
    '',
    '要求：Node.js >= 22.22.2 和 npm。仅支持 macOS Apple Silicon、Windows x64。',
    '用法：node install_studio.mjs [--version=0.1.21] [--dir=PATH] [--project-root=PATH] [--no-start] [--help]',
    '默认目录：~/.pocket/studio。已有受管安装只执行 doctor/start，不覆盖项目文件。',
  ].join('\n');
}

export async function installStudio(options = {}) {
  const tuple = platformTuple(options.platform ?? process.platform, options.arch ?? process.arch);
  validateNodeAndNpm(options);
  const target = resolve(options.targetDir ?? DEFAULT_INSTALL_DIR);
  const projectRoot = options.projectRoot ? resolve(options.projectRoot) : null;
  if (projectRoot) {
    let stat;
    try { stat = lstatSync(projectRoot); }
    catch { throw new Error(`--project-root 不存在：${projectRoot}`); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`--project-root 必须是普通目录：${projectRoot}`);
  }
  const run = options.runNpm ?? ((args, cwd) => runNpm(args, cwd, { spawn: options.spawn ?? spawnSync, npmInvocation: options.npmInvocation }));
  const doStart = async root => {
    if (options.noStart) return { root, started: false };
    const args = ['run', 'start'];
    if (projectRoot) args.push('--', `--project-root=${projectRoot}`);
    await run(args, root);
    return { root, started: true };
  };

  const existing = inspectManagedInstallation(target, tuple);
  if (existing) {
    if (options.version && options.version !== existing.version) {
      throw new Error(`此目录已安装 Pocket SDK ${existing.version}；安装器不会覆盖或升级既有目录。请通过 Studio 内的既有升级流程升级，或选择新的 --dir。`);
    }
    if (options.log) options.log(`发现受管安装 ${existing.version}；保留现有文件，仅运行 doctor${options.noStart ? '' : ' 和 Studio'}。`);
    await run(['run', 'doctor'], target);
    return { ...await doStart(target), version: existing.version, reused: true };
  }

  if (options.log) options.log(`正在查询 PocketFlutter/Pocket 官方稳定 Release${options.version ? ` sdk-v${options.version}` : ''}。`);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('此 Node.js 没有可用的 fetch；请升级到 Node.js 22.22.2+');
  const release = options.release ?? await fetchRelease(fetchImpl, tuple, options.version ?? null);
  const archive = options.archive ?? await downloadAndVerify(fetchImpl, release);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const parentStat = statSync(parent);
  if (!parentStat.isDirectory()) throw new Error(`安装父路径不是目录：${parent}`);
  // System temp paths such as macOS /tmp are directory symlinks. Resolve the
  // parent for staging so rename remains on the same filesystem while the
  // requested target path itself is still checked for symlinks above.
  const stageParent = realpathSync(parent);
  const stage = mkdtempSync(join(stageParent, `.pocket-studio-install-${randomUUID()}-`));
  let placed = false;
  try {
    extractSafeTarGz(archive, stage);
    const validated = validateSdkDirectory(stage, release.version, tuple);
    if (options.log) options.log(`已校验官方 ${tuple} Release ${release.tagName}（provenance ${validated.sourceCommit.slice(0, 12)}）。`);
    await run(['run', 'setup'], stage);
    await run(['run', 'doctor'], stage);
    if (existsSync(target)) throw new Error(`安装路径在准备期间已被创建；为保护其中内容，停止放置：${target}`);
    renameSync(stage, target);
    placed = true;
  } finally {
    if (!placed && existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
  if (options.log) options.log(`Pocket Web SDK ${release.version} 已安装到 ${target}。`);
  return { ...await doStart(target), version: release.version, reused: false };
}

export async function main(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    (options.log ?? console.log)(helpText());
    return { help: true };
  }
  const log = options.log ?? console.log;
  const result = await installStudio({ ...parsed, ...options, log, targetDir: resolve(parsed.dir) });
  if (!result.started) log(`Studio 启动已跳过（--no-start）。版本 ${result.version}，目录 ${result.root}`);
  else log('Pocket Studio 正在运行：打开 http://127.0.0.1:8791');
  return result;
}

function isStdinEntrypoint() {
  if (process.argv[1] === '-') return true;
  if (!process.argv[1]) return false;
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); }
  catch { return false; }
}

if (isStdinEntrypoint()) {
  main().catch(error => {
    console.error(`Pocket Studio 安装失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
