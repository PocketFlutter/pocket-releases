/** OS directory selection for the loopback-only Studio project opener. */
import { isAbsolute } from "node:path";

export function directoryPickerCommand(platform: string): string[] {
  if (platform === "darwin") return ["/usr/bin/osascript", "-e", 'try\nactivate\nreturn POSIX path of (choose folder with prompt "选择 Pocket 项目目录（或包含 js 的 Flutter 工程）")\non error number -128\nreturn ""\nend try'];
  if (platform === "win32") return ["powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command", `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 Pocket 项目目录（或包含 js 的 Flutter 工程）'
$dialog.ShowNewFolderButton = $false
try { if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) } } finally { $dialog.Dispose() }
`];
  throw new Error("当前系统不支持原生目录选择，请手动输入项目路径");
}

export async function pickProjectDirectory(signal?: AbortSignal): Promise<string | null> {
  const child = Bun.spawn(directoryPickerCommand(process.platform), { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const cancel = () => { try { child.kill(); } catch { /* Already exited. */ } };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 120_000);
  try {
    const [status, output] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (timedOut) throw new Error("目录选择已超时，请重新选择或手动输入路径");
    if (status !== 0) throw new Error("无法打开系统目录选择器，请手动输入项目路径");
    const selected = output.trim();
    if (!selected) return null;
    if (!isAbsolute(selected) || selected.includes("\0")) throw new Error("系统目录选择器返回了无效路径");
    return selected;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
