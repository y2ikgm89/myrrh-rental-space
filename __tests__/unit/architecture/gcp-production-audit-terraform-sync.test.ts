/**
 * **本番監査モデルが宣言する secret version は、Terraform が実際に pin している
 * version と一致しなければならない。**
 *
 * ## なぜ
 *
 * `scripts/gcp-production-audit-model.ts` の `REQUIRED_*_SECRET_ENV_REFS` は
 * Terraform の値を**転写**したもので、両者を突き合わせる仕組みが無かった。
 * 2026-08-08 の DB 切替 (WP24) で Terraform 側が
 * `DATABASE_URL` 2→3 / migrate Job `DIRECT_URL` 1→2 (+ `DATABASE_URL` 注入廃止) と
 * 進んだあとも、監査モデルは旧値のまま残り、`docs/gcp-production-setup.md` も
 * 旧値を手順として書き続けていた。実害は 2 つある:
 *
 * - `bun run gcp:audit-production-iap` は「本番の姿を証明する gate」と runbook が
 *   宣言しているのに、**正しく切り替わった本番を不一致として落とす**
 * - runbook の bootstrap 手順に従うと migrate Job が**旧 DB**を指し、Prisma は
 *   `No pending migrations to apply.` を exit 0 で返す = 切替失敗が成功に見える
 *
 * 転写である限りこの drift は静かに再発する。ここで Terraform を**読んで**突き合わせ、
 * 転写を機械が検算する形にする。
 *
 * ## 何を見るか
 *
 * Terraform の宣言（`variables.tf` の `cloud_run_secret_versions` と
 * `cloud_run_migrate_job.tf` の `env` ブロック）を parse し、監査モデルの定数と
 * 完全一致すること。**どちらが正か**は Terraform（実際に apply される側）。
 * モデルを直すのであってこの gate を緩めない。
 *
 * 値そのものが正しいか（v3 が本当に新 DB を指すか）は Secret Manager 側の事実で、
 * 静的には確かめられない。ここが保証するのは「2 つの宣言が食い違わないこと」だけ。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  FORBIDDEN_CLOUD_RUN_MIGRATE_JOB_ENV_NAMES,
  REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS,
  REQUIRED_CLOUD_RUN_SECRET_ENV_REFS,
} from "../../../scripts/gcp-production-audit-model";

const ROOT = process.cwd();

function readTerraform(file: string): string {
  return readFileSync(join(ROOT, "terraform", file), "utf8");
}

/** 行頭コメント (`#`) を落とす。値の中の `#` は消さない。 */
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/u.test(line))
    .join("\n");
}

/**
 * `variable "cloud_run_secret_versions"` の `default` map を読む。
 * 返すのは secret_id → version の対応。
 */
export function readCloudRunSecretVersions(
  variablesTf: string,
): Map<string, string> {
  const block =
    /variable\s+"cloud_run_secret_versions"\s*\{([\s\S]*?)\n\}/u.exec(
      variablesTf,
    );
  const versions = new Map<string, string>();
  if (!block?.[1]) return versions;

  for (const line of stripLineComments(block[1]).split("\n")) {
    const entry = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"\s*$/u.exec(line);
    if (entry?.[1] && entry[2]) versions.set(entry[1], entry[2]);
  }
  return versions;
}

/**
 * Cloud Run Job の `env { name = "X" ... secret_key_ref { secret = ...["Y"]... version = "N" } }`
 * を読む。plain env（`value = ...`）は secret binding ではないので拾わない。
 */
export function readJobSecretEnvRefs(
  jobTf: string,
): { name: string; secret: string; version: string }[] {
  const refs: { name: string; secret: string; version: string }[] = [];
  const pattern =
    /env\s*\{\s*name\s*=\s*"([A-Z][A-Z0-9_]*)"\s*value_source\s*\{\s*secret_key_ref\s*\{([\s\S]*?)\}\s*\}\s*\}/gu;

  for (const match of stripLineComments(jobTf).matchAll(pattern)) {
    const name = match[1];
    const body = match[2];
    if (!name || !body) continue;
    const secret = /secret\s*=\s*[^\n]*?\[\s*"([A-Z][A-Z0-9_]*)"\s*\]/u.exec(
      body,
    )?.[1];
    const version = /version\s*=\s*"([^"]+)"/u.exec(body)?.[1];
    if (secret && version) refs.push({ name, secret, version });
  }
  return refs;
}

describe("本番監査モデルは Terraform の pin と一致する", () => {
  test("parser が実ファイルから読めている（gate が空振りしていない）", () => {
    const versions = readCloudRunSecretVersions(readTerraform("variables.tf"));
    expect(versions.size).toBe(REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.length);
    expect(versions.get("DATABASE_URL")).toBeDefined();

    const jobRefs = readJobSecretEnvRefs(
      readTerraform("cloud_run_migrate_job.tf"),
    );
    expect(jobRefs.length).toBeGreaterThan(0);
  });

  test("parser は drift を検出できる（見本）", () => {
    const drifted = readCloudRunSecretVersions(`
variable "cloud_run_secret_versions" {
  type = map(string)
  default = {
    # DATABASE_URL = "9" ← コメントは読まない
    DATABASE_URL       = "3"
    BETTER_AUTH_SECRET = "1"
  }
}
`);
    expect([...drifted]).toEqual([
      ["DATABASE_URL", "3"],
      ["BETTER_AUTH_SECRET", "1"],
    ]);

    const jobRefs = readJobSecretEnvRefs(`
        env {
          name = "DIRECT_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secret["DIRECT_URL"].secret_id
              version = "2"
            }
          }
        }
        env {
          name  = "APP_SURFACE"
          value = "admin"
        }
`);
    expect(jobRefs).toEqual([
      { name: "DIRECT_URL", secret: "DIRECT_URL", version: "2" },
    ]);
  });

  test("runtime secret の name と version が Terraform と一致する", () => {
    const versions = readCloudRunSecretVersions(readTerraform("variables.tf"));

    expect(
      Object.fromEntries(
        REQUIRED_CLOUD_RUN_SECRET_ENV_REFS.map((ref): [string, string] => {
          return [ref.name, ref.version];
        }),
      ),
    ).toEqual(Object.fromEntries(versions));
  });

  test("migrate Job の secret binding が Terraform と一致する", () => {
    const jobRefs = readJobSecretEnvRefs(
      readTerraform("cloud_run_migrate_job.tf"),
    );

    expect(
      jobRefs.map((ref) => {
        return { name: ref.name, version: ref.version };
      }),
    ).toEqual(
      REQUIRED_CLOUD_RUN_MIGRATE_JOB_SECRET_ENV_REFS.map(
        (ref): { name: string; version: string } => {
          return { name: ref.name, version: ref.version };
        },
      ),
    );

    // env 名と secret 名が食い違うと「別の secret を読んでいる」ことになる。
    for (const ref of jobRefs) expect(ref.secret).toBe(ref.name);

    // 禁止 env が Terraform 側に復活していないこと（旧 DB を指す形への差し戻し）。
    for (const forbidden of FORBIDDEN_CLOUD_RUN_MIGRATE_JOB_ENV_NAMES) {
      expect(jobRefs.map((ref) => ref.name)).not.toContain(forbidden);
    }
  });
});
