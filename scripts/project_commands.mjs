#!/usr/bin/env node
// Consumer npm commands forward to the existing SDK tools. No compiler/runtime here.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.cwd();
const [command, ...extra] = process.argv.slice(2);
const native = existsSync(join(project, 'flutter/pubspec.yaml'));
let script;
let args;
if (['start', 'status', 'stop'].includes(command)) {
  script = 'editor_service.mjs';
  args = command === 'start'
    ? ['start', `--project-root=${project}`, ...(native ? [`--flutter-root=${join(project, 'flutter')}`] : [])]
    : [command];
} else if (command === 'build' || command === 'build:web') {
  script = 'toolchain.mjs';
  args = command === 'build:web'
    ? ['run', 'scripts/build_web.ts', `--project-root=${project}`, `--outdir=${join(project, 'build/web')}`]
    : native && existsSync(join(sdk, 'pocket.ts'))
      ? ['run', 'pocket.ts', 'build', project, `--sdk-root=${sdk}`]
      : ['build:guest', `--project-root=${project}`, `--outdir=${join(project, 'build/pocket')}`];
} else {
  console.error('Usage: project_commands.mjs start|build|build:web|status|stop');
  process.exit(1);
}
const result = spawnSync(process.execPath, [join(sdk, 'scripts', script), ...args, ...extra], {
  cwd: project, stdio: 'inherit', env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
