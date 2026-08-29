#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `bun install` の prepare。**hook が装着されていることを保証する。**
 *
 * `|| true` にはしない。hook 未装着がログ無しで通ると、gate が全部無効なまま
 * 誰も気づかない。ただし「install を毎回打つ」でもない — 下の 2 つの理由で
 * `lefthook install` は打てないことがある。
 *
 * ## 1. linked worktree から install してはいけない
 *
 * git の hook は **common dir 側**（`<main>/.git/hooks`）に 1 セットしかなく、
 * 全 worktree で共有される。worktree から `lefthook install` を打つと、
 * その 1 セットを**その worktree の `node_modules` を指すように書き換える**（実測）:
 *
 *     - .../myrrh-rental-space/node_modules/lefthook-windows-x64/bin/lefthook.exe
 *     + .../myrrh-rental-space/.claude/worktrees/<name>/node_modules/...
 *
 * worktree は使い捨てなので、消した瞬間に main checkout 側の参照が消える。
 * 「動くように」`--force` を足すと、まさにこれが起きる。
 *
 * ## 2. `core.hooksPath` が設定されていると lefthook は install を拒否する
 *
 * このリポジトリは `.git/config` と worktree の `config.worktree` の両方に
 * `core.hooksPath = <main>/.git/hooks` を持っている（既定の置き場を明示しただけの
 * 値だが、lefthook はこれを custom path と見なす）。結果 `lefthook install` が
 * exit 1 になり、**`bun install` が毎回非ゼロで終わっていた**。
 * 拒否そのものは 1 の事故を防いでいるので正しい。こちらが install を呼ばない。
 *
 * ## したがって
 *
 * 装着済みかを**先に確かめ**、済んでいれば何もしない。欠けているときだけ install し、
 * worktree では install せず**落として** main checkout での `bun install` を促す。
 *
 * 装着済み判定は「lefthook.yml が宣言する hook 名のファイルが hooks dir にあり、
 * 中に `LEFTHOOK` の marker がある」。**内容の鮮度までは見ない** — lefthook 本体を
 * 上げて shim の中身が変わったときは手で `lefthook install` を打つ。
 */

/** lefthook が hook shim に必ず書く marker（`$LEFTHOOK` の分岐）。 */
const LEFTHOOK_MARKER = "LEFTHOOK";

export type LefthookPreparePlan =
  | { readonly kind: "skip"; readonly reason: string }
  | { readonly kind: "install" }
  | { readonly kind: "fail"; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `lefthook.yml` が宣言する hook 名。
 *
 * top-level の key のうち、`jobs` / `commands` / `scripts` を持つものだけ。
 * `colors` のような設定 key を hook と誤認しないため。
 */
export function declaredHookNames(lefthookYaml: string): string[] {
  const document: unknown = Bun.YAML.parse(lefthookYaml);
  if (!isRecord(document)) return [];
  return Object.entries(document)
    .filter(
      ([, value]) =>
        isRecord(value) &&
        ("jobs" in value || "commands" in value || "scripts" in value),
    )
    .map(([name]) => name);
}

/** 装着されていない hook 名（ファイルが無い / marker が無い）。 */
export function findMissingHooks(options: {
  readonly names: readonly string[];
  readonly readHook: (name: string) => string | null;
}): string[] {
  return options.names.filter((name) => {
    const content = options.readHook(name);
    return content === null || !content.includes(LEFTHOOK_MARKER);
  });
}

export function planLefthookPrepare(options: {
  readonly ci: string | undefined;
  readonly gitEntryExists: boolean;
  readonly linkedWorktree: boolean;
  readonly missingHooks: readonly string[];
}): LefthookPreparePlan {
  if (options.ci === "true") {
    return { kind: "skip", reason: "CI" };
  }
  if (!options.gitEntryExists) {
    return { kind: "skip", reason: ".git が無い（コンテナ等）" };
  }
  if (options.missingHooks.length === 0) {
    return { kind: "skip", reason: "hook は装着済み" };
  }
  if (options.linkedWorktree) {
    return {
      kind: "fail",
      reason:
        `hook が未装着: ${options.missingHooks.join(", ")}。` +
        "linked worktree から install すると共有 hook がこの worktree を指してしまうので、" +
        "main checkout で `bun install`（または `lefthook install`）を実行してください。",
    };
  }
  return { kind: "install" };
}

export async function runPrepareLefthook(options: {
  readonly plan: LefthookPreparePlan;
  readonly install: () => Promise<number>;
  readonly log: (message: string) => void;
}): Promise<number> {
  if (options.plan.kind === "skip") {
    options.log(`[prepare-lefthook] skip: ${options.plan.reason}`);
    return 0;
  }
  if (options.plan.kind === "fail") {
    options.log(`[prepare-lefthook] ${options.plan.reason}`);
    return 1;
  }
  return options.install();
}

if (import.meta.main) {
  // git が無い環境（一部のコンテナ）では空文字を返す。そのとき linkedWorktree は
  // false・hooks dir は不明になり、下の判定は従来どおり `lefthook install` へ倒れる。
  const capture = async (args: string[]): Promise<string> => {
    try {
      const proc = Bun.spawn(["git", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      return out.trim();
    } catch {
      return "";
    }
  };

  const gitEntryExists = existsSync(".git");
  const [gitDir, gitCommonDir, hooksDir] = gitEntryExists
    ? await Promise.all([
        capture(["rev-parse", "--absolute-git-dir"]),
        capture(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
        capture(["rev-parse", "--path-format=absolute", "--git-path", "hooks"]),
      ])
    : ["", "", ""];

  const names = existsSync("lefthook.yml")
    ? declaredHookNames(readFileSync("lefthook.yml", "utf8"))
    : [];

  const exitCode = await runPrepareLefthook({
    plan: planLefthookPrepare({
      ci: process.env["CI"],
      gitEntryExists,
      linkedWorktree: gitDir !== gitCommonDir,
      missingHooks: findMissingHooks({
        names,
        readHook: (name) => {
          const path = join(hooksDir, name);
          return existsSync(path) ? readFileSync(path, "utf8") : null;
        },
      }),
    }),
    install: async () => {
      const proc = Bun.spawn(["lefthook", "install"], {
        stdout: "inherit",
        stderr: "inherit",
      });
      return proc.exited;
    },
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });
  process.exit(exitCode);
}
