#!/usr/bin/env bun

import { existsSync } from "node:fs";

/**
 * `lefthook install` を CI / コンテナ以外では失敗させる。
 * `|| true` だと hook 未装着がログ無しで通る。
 */
export function shouldSkipLefthookInstall(options: {
  readonly ci: string | undefined;
  readonly gitEntryExists: boolean;
}): boolean {
  return options.ci === "true" || !options.gitEntryExists;
}

export async function runPrepareLefthook(options: {
  readonly ci: string | undefined;
  readonly gitEntryExists: boolean;
  readonly install: () => Promise<number>;
}): Promise<number> {
  if (shouldSkipLefthookInstall(options)) {
    return 0;
  }
  return options.install();
}

if (import.meta.main) {
  const exitCode = await runPrepareLefthook({
    ci: process.env.CI,
    gitEntryExists: existsSync(".git"),
    install: async () => {
      const proc = Bun.spawn(["lefthook", "install"], {
        stdout: "inherit",
        stderr: "inherit",
      });
      return proc.exited;
    },
  });
  process.exit(exitCode);
}
