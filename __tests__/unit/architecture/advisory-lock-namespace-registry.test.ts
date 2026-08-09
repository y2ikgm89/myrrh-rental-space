/**
 * **advisory lock の namespace は 1 箇所にしか書かない。**
 *
 * ## なぜ
 *
 * 採番の一覧は `.claude/rules/db-domain.md` にあり、PR #2076 でその置き場ごと
 * 消えた。消えたあとも 4 箇所が番号をリテラルで直書きしたまま残り、次に採番する
 * 人が「今どこまで使われているか」を知る手段が無い状態になっていた。
 *
 * 衝突しても**何も落ちない**のが厄介なところで、症状は「別ドメインの書込が
 * 黙って直列化される」＝たまに遅い、としか出ない。番号が 1 箇所にしか書かれて
 * いなければ一覧は常に正しいので、リテラル直書きを禁じる。
 *
 * ## 何を見るか
 *
 * `src/` の `pg_advisory_*` 呼び出しに数値リテラルが直接書かれていないこと。
 * SSoT である `advisory-lock-namespaces.ts` だけが数値を持つ。
 *
 * 番号の**意味**（どのドメインが持つか）までは見ない。それは SSoT の docstring が
 * 持つもので、静的には確かめられない。ここが保証するのは
 * 「番号の出どころが 1 つであること」と「重複が無いこと」だけ。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { ADVISORY_LOCK_NAMESPACES } from "@/shared/domain/advisory-lock-namespaces";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/** SSoT 本体。ここだけが数値リテラルを持ってよい。 */
const REGISTRY = "src/shared/domain/advisory-lock-namespaces.ts";

/** `pg_advisory_xact_lock(728351::int4, …)` のように数値を直書きしている呼び出し。 */
const LITERAL_NAMESPACE_CALL =
  /pg_(?:try_)?advisory_(?:xact_)?(?:un)?lock\(\s*\d+/gu;

export function findLiteralNamespaceCalls(source: string): string[] {
  return [...source.matchAll(LITERAL_NAMESPACE_CALL)].map((m) => m[0]);
}

describe("advisory lock namespace の採番は SSoT が持つ", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    const files = trackedTextFiles(ROOT).filter((file) =>
      file.startsWith("src/"),
    );
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(REGISTRY);
  });

  test("検出が効いている（見本）", () => {
    expect(
      findLiteralNamespaceCalls(
        "SELECT pg_advisory_xact_lock(728351::int4, hashtext(x))",
      ),
    ).toEqual(["pg_advisory_xact_lock(728351"]);
    expect(
      findLiteralNamespaceCalls("SELECT pg_try_advisory_lock(728349)"),
    ).toEqual(["pg_try_advisory_lock(728349"]);
    // 定数経由は拾わない。
    expect(
      findLiteralNamespaceCalls(
        "SELECT pg_advisory_xact_lock(${SPACE_SCHEDULE_LOCK_NAMESPACE}::int4, hashtext(x))",
      ),
    ).toEqual([]);
  });

  test("採番に重複が無い", () => {
    expect(new Set(ADVISORY_LOCK_NAMESPACES).size).toBe(
      ADVISORY_LOCK_NAMESPACES.length,
    );
  });

  test("src で namespace を直書きしている箇所が無い", () => {
    const offenders: string[] = [];

    for (const file of trackedTextFiles(ROOT)) {
      if (!file.startsWith("src/") || file === REGISTRY) continue;
      const found = findLiteralNamespaceCalls(
        readFileSync(join(ROOT, file), "utf8"),
      );
      if (found.length === 0) continue;
      offenders.push(`${file} :: ${found.join(", ")}`);
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? `advisory lock の namespace は ${REGISTRY} から import する。直書きすると採番の一覧がそこだけ古くなり、衝突しても何も落ちないまま別ドメインの書込が直列化する`
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
