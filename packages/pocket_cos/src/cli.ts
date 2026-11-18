import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCosClient } from "./client.ts";
import {
  inspectLocalCosEnvironment,
  resolveLocalCosCredentials,
} from "./local_config.ts";
import { publishReleaseDirectoryToCos } from "./publisher.ts";
import { resolveCosTarget } from "./types.ts";

const BOOLEAN_FLAGS = new Set(["dry-run", "allow-insecure-http", "json"]);

function usage(): never {
  throw new Error(
    [
      "usage:",
      "  bun packages/pocket_cos/src/cli.ts inspect [--workspace-keys-dir DIR] [--json]",
      "  bun packages/pocket_cos/src/cli.ts check --bucket BUCKET --region REGION [--prefix PREFIX] [--endpoint URL] [--public-base-url URL]",
      "  bun packages/pocket_cos/src/cli.ts publish (--deploy-root DIR | --dir DIR) [--bucket BUCKET] [--region REGION] [--prefix PREFIX] [--endpoint URL] [--public-base-url URL] [--key-file FILE | --public-key-file FILE] [--dry-run]",
    ].join("\n"),
  );
}

function parseCliArgs(argv: string[]): {
  command: string;
  flags: Map<string, string>;
  booleans: Set<string>;
} {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h")) {
    usage();
  }
  const command = args[0] && !args[0].startsWith("--") ? args.shift()! : "inspect";
  const flags = new Map<string, string>();
  const booleans = new Set<string>();

  while (args.length > 0) {
    const arg = args.shift()!;
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const eqIndex = arg.indexOf("=");
    if (eqIndex >= 0) {
      const k = arg.slice(2, eqIndex);
      const v = arg.slice(eqIndex + 1);
      if (v === "" && BOOLEAN_FLAGS.has(k)) {
        booleans.add(k);
      } else {
        flags.set(k, v);
      }
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      booleans.add(name);
    } else {
      const val = args.shift();
      if (val === undefined || val.startsWith("--")) {
        throw new Error(`Missing value for --${name}`);
      }
      flags.set(name, val);
    }
  }

  return { command, flags, booleans };
}

export async function runCosCli(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  const { command, flags, booleans } = parseCliArgs(argv);
  const workspaceKeysDir = flags.get("workspace-keys-dir");

  if (command === "inspect") {
    const inspection = inspectLocalCosEnvironment({
      ...(workspaceKeysDir ? { workspaceKeysDir } : {}),
    });
    return inspection;
  }

  const inspection = inspectLocalCosEnvironment({
    ...(workspaceKeysDir ? { workspaceKeysDir } : {}),
  });
  const bucket =
    flags.get("bucket") ??
    process.env.POCKET_COS_BUCKET ??
    process.env.COS_BUCKET ??
    inspection.defaultBucket?.bucket;
  const region =
    flags.get("region") ??
    process.env.POCKET_COS_REGION ??
    process.env.COS_REGION ??
    inspection.defaultBucket?.region;
  const endpoint =
    flags.get("endpoint") ??
    process.env.POCKET_COS_ENDPOINT ??
    process.env.COS_ENDPOINT ??
    inspection.discoveredBuckets.find((b) => b.bucket === bucket && b.region === region)
      ?.endpoint;
  const keyPrefix = flags.get("prefix") ?? process.env.POCKET_COS_PREFIX;
  const publicBaseUrl =
    flags.get("public-base-url") ?? process.env.POCKET_COS_PUBLIC_BASE_URL;
  const allowInsecureHttpForTesting = booleans.has("allow-insecure-http");

  if (!bucket || !region) {
    throw new Error("COS --bucket and --region are required (or must be discoverable in local config)");
  }

  const target = resolveCosTarget({
    bucket,
    region,
    endpoint,
    keyPrefix,
    publicBaseUrl,
    allowInsecureHttpForTesting,
  });

  if (command === "check") {
    const { credentials } = resolveLocalCosCredentials({
      ...(workspaceKeysDir ? { workspaceKeysDir } : {}),
    });
    const client = createCosClient({ target, credentials });
    const access = await client.checkAccess();
    return {
      ok: access.ok,
      status: access.status,
      bucket: target.bucket,
      region: target.region,
      keyPrefix: target.keyPrefix,
      publicBaseUrl: target.publicBaseUrl,
    };
  }

  if (command === "publish") {
    const deployRoot = flags.get("deploy-root");
    const packageDir = flags.get("dir");
    if (!deployRoot && !packageDir) {
      throw new Error("publish requires either --deploy-root or --dir");
    }
    if (deployRoot && packageDir) {
      throw new Error("publish accepts either --deploy-root or --dir, not both");
    }

    const dryRun = booleans.has("dry-run");
    const credentials = dryRun
      ? (() => {
          try {
            return resolveLocalCosCredentials({
              ...(workspaceKeysDir ? { workspaceKeysDir } : {}),
            }).credentials;
          } catch {
            return { secretId: "DRY_RUN_AK", secretKey: "DRY_RUN_SK" };
          }
        })()
      : resolveLocalCosCredentials({
          ...(workspaceKeysDir ? { workspaceKeysDir } : {}),
        }).credentials;

    const keyFile = flags.get("key-file") ?? flags.get("public-key-file");
    const publicKey = keyFile ? readFileSync(resolve(keyFile), "utf8") : undefined;

    const client = createCosClient({ target, credentials });
    if (!dryRun) {
      await client.checkAccess();
    }

    return await publishReleaseDirectoryToCos({
      client,
      deployRoot,
      packageDir,
      publicKey,
      dryRun,
    });
  }

  usage();
}

if (import.meta.main) {
  try {
    const result = await runCosCli(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
