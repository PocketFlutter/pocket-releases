/** Project support files shared by CLI and Studio; all commands use SDK entry points. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeProjectSupport(project: string, sdk: string, name: string): void {
  const quote = (value: string) => {
    const normalized = process.platform === "win32" ? value.replaceAll("\\", "/") : value;
    if (process.platform !== "win32") return "'" + normalized.replaceAll("'", "'\\''") + "'";
    if (/[%!"\r\n]/.test(normalized)) throw new Error("SDK/project path contains unsupported Windows shell characters");
    return '"' + normalized + '"';
  };
  const invoke = `node ${quote(join(sdk, "scripts/project_commands.mjs"))}`;
  const flutter = existsSync(join(project, "flutter/pubspec.yaml"));
  const scripts = {
    start: `${invoke} start`, build: `${invoke} build`, "build:web": `${invoke} build:web`,
    "editor:status": `${invoke} status`, "editor:stop": `${invoke} stop`,
  };
  const path = join(project, "package.json");
  const pkg = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { name, private: true, type: "module" };
  pkg.scripts = { ...scripts, ...pkg.scripts };
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  const tsconfig = join(project, "tsconfig.json");
  if (!existsSync(tsconfig)) writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve", strict: true, skipLibCheck: true } }, null, 2) + "\n");
  mkdirSync(join(project, "assets"), { recursive: true });
  const ignore = join(project, ".gitignore");
  const prior = existsSync(ignore) ? readFileSync(ignore, "utf8") : "";
  const patterns = ["node_modules/", "build/", ".pocket-build/", ".pocket-ui.lock", ".pocket-ui-backup-*", ".pocket-*.lock", ".pocket-*-backup-*", "flutter/.dart_tool/", "flutter/build/"];
  const missing = patterns.filter(line => !prior.split(/\r?\n/).includes(line));
  if (missing.length) writeFileSync(ignore, prior + (prior && !prior.endsWith("\n") ? "\n" : "") + missing.join("\n") + "\n");
  const readme = join(project, "README.md");
  const priorReadme = existsSync(readme) ? readFileSync(readme, "utf8") : `# ${name}\n`;
  if (!priorReadme.includes("## Project commands")) writeFileSync(readme, priorReadme + `\n## Project commands\n\nRun from this directory:\n\n\`\`\`sh\nnpm start\nnpm run build\nnpm run build:web\nnpm run editor:status\nnpm run editor:stop\n\`\`\`\n\nOpen http://127.0.0.1:8791. Edit \`app.tsx\` and \`assets/\`, then rebuild.\nThe project uses the SDK at \`${sdk}\`; install its matching platform tools first.\nSource developers explicitly set \`POCKET_SOURCE_BUILD=1\` and install source prerequisites.\n${flutter ? "The native Flutter host is under `flutter/`; native libraries still require the target build tools.\n" : "This is a JS/Preview project; it does not generate a Flutter host.\n"}\nApplication state, routing and component composition belong in JS. Use the existing Worker/IO contracts for network and expensive business work; rendering Workers remain opt-in.\n`);
}
