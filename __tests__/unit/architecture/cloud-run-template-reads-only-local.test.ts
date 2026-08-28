/**
 * Cloud Run の `template` block は local からしか値を読まない
 *
 * ## なぜ
 *
 * `revision` 名を template 全体のハッシュから決定的に導くため
 * （`docs/superpowers/plans/2026-08-28-terraform-owns-cloud-run-image.md`）。
 * ハッシュが `local.cloud_run_<surface>_template` を対象にしている以上、
 * **template に入る値が全てその local に載っていること**が正しさの前提になる。
 *
 * 載っていない項目があると、その項目を変えた人が
 *
 *   Error 409: Revision named '...' with different configuration already exists.
 *
 * を踏む。**同名・別内容**の revision を作ろうとするため。しかもこれは
 * 「変えた本人が本番デプロイで初めて気づく」形で出る（2026-08-27 に実際に起きた）。
 *
 * ## 何を見るか
 *
 * `terraform/` の `google_cloud_run_v2_service` を宣言する全ファイルについて、
 * `template` block 内の**スカラー代入の右辺**が次のいずれかであること:
 *
 * - `local.cloud_run_<surface>_template.<...>`
 * - `env.key` / `env.value`（`dynamic "env"` の反復子）
 * - `google_secret_manager_secret.secret[env.key].secret_id`
 *
 * 最後の 1 つだけが例外。secret の実 ID は resource から引くしかないが、
 * **どの secret かを決める `env.key` は local の `secret_versions` 由来**なので、
 * ハッシュは実質的にこれを覆っている。
 *
 * ## 手法の限界
 *
 * - **block の追加は見ていない。** `template` に新しい block（例: `volumes`）を
 *   丸ごと足すと、その中の代入は検査されるが「local に載せるべき項目が増えた」
 *   ことまでは分からない。
 * - HCL を正しくパースしていない。`= {` で始まる map / block 開始は判定から外す。
 *
 * ## 直し方
 *
 * 値を `terraform/locals_cloud_run.tf` の `cloud_run_template_base` か、
 * サーフェス別の override へ移し、template からはそれを参照する。
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TERRAFORM_DIR = join(process.cwd(), "terraform");

/** `google_cloud_run_v2_service` を宣言している .tf を集める。 */
function listCloudRunServiceFiles(): string[] {
  return readdirSync(TERRAFORM_DIR)
    .filter((name) => name.endsWith(".tf"))
    .filter((name) =>
      readFileSync(join(TERRAFORM_DIR, name), "utf8").includes(
        'resource "google_cloud_run_v2_service"',
      ),
    )
    .sort();
}

const ALLOWED = [
  /^local\.cloud_run_[a-z]+_template(\.[a-zA-Z_0-9]+)+$/,
  /^env\.(key|value)$/,
  // 唯一の例外。理由は上の docblock。
  /^google_secret_manager_secret\.secret\[env\.key\]\.secret_id$/,
];

/** template block 内で local を経由していない代入を返す。 */
export function findNonLocalTemplateAssignments(source: string): string[] {
  const block = /^ {2}template \{\n[\s\S]*?^ {2}\}\n/m.exec(source);
  if (block === null) return ["<template block が見つからない>"];

  const body = block[0].replace(/#.*/g, "");
  const offenders: string[] = [];

  for (const match of body.matchAll(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/gm)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    // map / block の開始は代入ではない。
    if (value === "{") continue;
    if (!ALLOWED.some((pattern) => pattern.test(value))) {
      offenders.push(`${name} = ${value}`);
    }
  }
  return offenders;
}

describe("Cloud Run の template は local からしか値を読まない", () => {
  const serviceFiles = listCloudRunServiceFiles();

  test("走査対象の service ファイルが存在する", () => {
    // 走査が 0 件でも緑になる形を避けるための下限。
    expect(serviceFiles.length).toBeGreaterThan(2);
  });

  test("template 内の代入が全て local 経由である", () => {
    const offenders = serviceFiles.flatMap((name) => {
      const found = findNonLocalTemplateAssignments(
        readFileSync(join(TERRAFORM_DIR, name), "utf8"),
      );
      return found.map((line) => `${name}: ${line}`);
    });
    expect(offenders).toEqual([]);
  });

  test("実在の service ファイルは違反にならない（witness）", () => {
    // 合成ではなくツリー内の実例で「落ちてはいけない形」を固定する。
    const witness = readFileSync(
      join(TERRAFORM_DIR, "cloud_run_public.tf"),
      "utf8",
    );
    expect(findNonLocalTemplateAssignments(witness)).toEqual([]);
  });

  test("var を直接読むと違反になる（fixture）", () => {
    const source = [
      'resource "google_cloud_run_v2_service" "x" {',
      "  template {",
      "    service_account = var.runtime_sa_email",
      "  }",
      "}",
      "",
    ].join("\n");

    expect(findNonLocalTemplateAssignments(source)).toEqual([
      "service_account = var.runtime_sa_email",
    ]);
  });

  test("リテラル直書きも違反になる（fixture）", () => {
    // **参照だけを見る実装への退行を捕まえる。** ハッシュから漏れて 409 を
    // 起こすのは、多くの場合こちらの形（値をその場に書いてしまう）。
    const source = [
      'resource "google_cloud_run_v2_service" "x" {',
      "  template {",
      "    containers {",
      "      resources {",
      "        limits = {",
      '          memory = "2Gi"',
      "        }",
      "      }",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");

    expect(findNonLocalTemplateAssignments(source)).toEqual(['memory = "2Gi"']);
  });

  test("許可された 3 形は違反にならない（fixture）", () => {
    const source = [
      'resource "google_cloud_run_v2_service" "x" {',
      "  template {",
      "    service_account = local.cloud_run_public_template.service_account",
      '    dynamic "env" {',
      "      content {",
      "        name  = env.key",
      "        secret = google_secret_manager_secret.secret[env.key].secret_id",
      "      }",
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");

    expect(findNonLocalTemplateAssignments(source)).toEqual([]);
  });
});
