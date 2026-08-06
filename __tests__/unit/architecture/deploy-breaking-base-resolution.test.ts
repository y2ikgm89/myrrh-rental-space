/**
 * 破壊的 migration の判定範囲（base commit）の決め方を、**実際に shell を走らせて**
 * 固定する。
 *
 * ## なぜ実行するのか
 *
 * この処理の危険は「失敗したときに何をするか」にある。旧実装は
 * `gcloud run services describe ... 2>/dev/null || true` で失敗を握りつぶし、
 * `DEPLOYED_IMAGE` が空になると base を **`GITHUB_SHA^`（直前 1 コミット）** へ
 * 黙って縮退させていた。認証切れ・region 誤り・一時障害のいずれでもそうなる。
 *
 * 窓が 1 コミットに縮むと、それ以前に merge 済みの破壊的 migration が
 * `git diff` に現れない。つまり **DROP COLUMN を含むデプロイが計画ダウンタイム
 * 無しで本番に出る**。旧 revision は消えた列を SELECT し続けて 500 を返す。
 *
 * 文字列一致（`toContain("gcloud run services describe")`）ではこの分岐を
 * 検査できない。`|| true` を足しても消しても同じ文字列は含まれるからだ。
 * **失敗させて、何が起きるかを見る。**
 *
 * ## 何を固定するか
 *
 * | describe の結果 | 期待 |
 * | --- | --- |
 * | 成功 + tag が既知の commit | その commit を base にする。計画ダウンタイムは付けない |
 * | サービス未作成（初回デプロイ） | 履歴全体を走査し、安全側（計画ダウンタイム）へ倒す |
 * | それ以外の失敗（認証・region・一時障害） | **exit 非 0 で停止**。判定できないまま進まない |
 * | tag が SHA 形でない / commit が無い | 履歴全体 + 計画ダウンタイム。窓を狭めない |
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

/** workflow の `Submit Cloud Build` step から base 解決部分だけを切り出す。 */
function baseResolutionScript(): string {
  const workflow = readFileSync(
    join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
    "utf8",
  );
  const start = workflow.indexOf('BREAKING_MIGRATION_DEPLOY="false"');
  expect(start).toBeGreaterThan(-1);
  const endMarker = "printf 'Breaking-migration base:";
  const end = workflow.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  const endOfLine = workflow.indexOf("\n", end);

  const block = workflow.slice(start, endOfLine);
  // YAML のブロックスカラー分のインデントを落とす。
  const lines = block.split(/\r?\n/u);
  const indent = /^(\s*)/u.exec(lines[1] ?? "")?.[1]?.length ?? 0;
  return lines
    .map((line, i) => (i === 0 ? line : line.slice(indent)))
    .join("\n");
}

type Outcome = { code: number; base: string; breaking: string; stderr: string };

let work: string;
let firstSha = "";
let headSha = "";

/** `gcloud` を差し替えた環境で base 解決部分を走らせる。 */
function run(gcloudStub: string): Outcome {
  const binDir = join(work, "bin");
  writeFileSync(
    join(binDir, "gcloud"),
    `#!/usr/bin/env bash\n${gcloudStub}\n`,
    {
      mode: 0o755,
    },
  );

  const script = [
    "set -euo pipefail",
    baseResolutionScript(),
    `printf 'RESULT base=%s breaking=%s\\n' "\${BASE_SHA}" "\${BREAKING_MIGRATION_DEPLOY}"`,
  ].join("\n");

  const proc = Bun.spawnSync(["bash", "-c", script], {
    cwd: join(work, "repo"),
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
      SERVICE_NAME: "myrrh-public",
      PROJECT_ID: "test-project",
      REGION: "asia-northeast1",
      GITHUB_SHA: headSha,
    },
  });

  const stdout = proc.stdout.toString();
  const match = /RESULT base=(\S*) breaking=(\S*)/u.exec(stdout);
  return {
    code: proc.exitCode ?? -1,
    base: match?.[1] ?? "",
    breaking: match?.[2] ?? "",
    stderr: proc.stderr.toString(),
  };
}

function git(...args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd: join(work, "repo") });
  return proc.stdout.toString().trim();
}

if (process.platform === "win32") {
  test("base 解決 shell 契約は Linux CI で実行（worktree GIT_DIR 漏れ回避）", () => {});
} else {
  describe("破壊的 migration の base 解決は fail-closed", () => {
    beforeAll(() => {
      work = mkdtempSync(join(tmpdir(), "deploy-base-"));
      mkdirSync(join(work, "bin"), { recursive: true });
      mkdirSync(join(work, "repo"), { recursive: true });

      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      writeFileSync(join(work, "repo", "a.txt"), "1");
      git("add", "-A");
      git("commit", "-qm", "first");
      firstSha = git("rev-parse", "HEAD");
      writeFileSync(join(work, "repo", "a.txt"), "2");
      git("add", "-A");
      git("commit", "-qm", "second");
      headSha = git("rev-parse", "HEAD");
    });

    afterAll(() => {
      rmSync(work, { recursive: true, force: true });
    });

    test("デプロイ済み tag が既知の commit なら、そこを base にする（縮退も停止もしない）", () => {
      const outcome = run(
        `echo "asia-northeast1-docker.pkg.dev/p/r/i:${firstSha}"`,
      );

      expect({
        code: outcome.code,
        base: outcome.base,
        breaking: outcome.breaking,
      }).toEqual({
        code: 0,
        base: firstSha,
        breaking: "false",
      });
    });

    test("describe が認証エラーで落ちたらデプロイを止める（直前 1 コミットへ縮退しない）", () => {
      const outcome = run(
        `echo "ERROR: (gcloud.run.services.describe) You do not currently have an active account selected." >&2\nexit 1`,
      );

      expect(outcome.code).not.toBe(0);
      // 縮退した痕跡（base が解決されて先へ進む）が無いこと。
      expect(outcome.base).toBe("");
    });

    test("サービス未作成（初回デプロイ）は履歴全体 + 計画ダウンタイムへ倒す", () => {
      const outcome = run(
        `echo "ERROR: (gcloud.run.services.describe) Cannot find service [myrrh-public]: NOT_FOUND" >&2\nexit 1`,
      );

      expect({
        code: outcome.code,
        base: outcome.base,
        breaking: outcome.breaking,
      }).toEqual({
        code: 0,
        base: firstSha,
        breaking: "true",
      });
    });

    test("tag が SHA 形でないときも窓を狭めず、安全側へ倒す", () => {
      const outcome = run(`echo "asia-northeast1-docker.pkg.dev/p/r/i:latest"`);

      expect({
        code: outcome.code,
        base: outcome.base,
        breaking: outcome.breaking,
      }).toEqual({
        code: 0,
        base: firstSha,
        breaking: "true",
      });
    });

    test("tag は SHA 形だがこのリポジトリに無い commit でも、窓を狭めない", () => {
      const outcome = run(
        `echo "asia-northeast1-docker.pkg.dev/p/r/i:0123456789abcdef0123456789abcdef01234567"`,
      );

      expect({
        code: outcome.code,
        base: outcome.base,
        breaking: outcome.breaking,
      }).toEqual({
        code: 0,
        base: firstSha,
        breaking: "true",
      });
    });
  });
}
