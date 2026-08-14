import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Linter } from "eslint";
import { describe, expect, test } from "bun:test";

// eslint-rules/*.mjs は raw ESM で公開されている（bun test は .mjs を素で解決）
import rule from "../../../eslint-rules/seed-respects-unique-constraints.mjs";

/**
 * `local/seed-respects-unique-constraints` の drift gate。
 *
 * ## この rule が置き換えたもの
 *
 * 前身は `prisma/seed.ts` を正規表現で走査する `seed-probe-key-contract.test.ts`
 * だった。壊れ方が判明するたびに広げ、5 回広げた末の 1 回のレビューで穴が
 * 3 つ出た。3 つとも「文字列は構造を見られない」ことの現れなので、
 * **その 3 つをここで名指しで固定する**。広げ方の問題ではなく手法の問題だった、
 * という判断を将来に残すため。
 *
 * ## 実 seed の検証はどこで行われるか
 *
 * ここは rule の振る舞いだけを見る（合成コード片 + fixture schema）。
 * 実 schema × 実 seed の組み合わせは ESLint 本体が見る
 * （`bun run lint:files -- prisma/seed.ts`、CI の Lint & Format）。
 * 配線が外れたら `eslint.config.mjs` の検査（末尾）で落ちる。
 */

const ROOT = process.cwd();
const RULE_NAME = "local/seed-respects-unique-constraints";
const SCHEMA_PATH = join(
  ROOT,
  "__tests__/fixtures/prisma-unique-constraints.prisma",
);

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter();
  return linter.verify(code, {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    plugins: {
      local: { rules: { "seed-respects-unique-constraints": rule } },
    },
    rules: { [RULE_NAME]: ["error", { schemaPath: SCHEMA_PATH }] },
  });
}

function messageIds(code: string): string[] {
  return lint(code).map((message) => message.messageId ?? "");
}

describe("seed の一意制約 rule — 通すべきもの", () => {
  test("削除がキー空間を過不足なく空にしていれば literal を通す", () => {
    // 実 seed の `seedEvents` と同じ形。
    expect(
      messageIds(`
        async function seed() {
          await tx.ticket.deleteMany({ where: { eventId: event.id } });
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual([]);
  });

  test("条件なしの削除は母集合ごと空にする", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.deleteMany({});
          await prisma.slot.create({ data: { position: 0 } });
        }
      `),
    ).toEqual([]);
  });

  test("リテラルでない値は対象外", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.ticket.create({
            data: { eventId: event.id, sortOrder: item.order },
          });
        }
      `),
    ).toEqual([]);
  });

  test("partial unique の述語を同じ値で含む probe は通る", () => {
    expect(
      messageIds(`
        async function seed() {
          await tx.article.findFirst({ where: { slug: input.slug, deletedAt: null } });
        }
      `),
    ).toEqual([]);
  });

  test("client の変数名に依存しない（tx でも db でも見る）", () => {
    // 変数名で絞ると transaction 化した瞬間に呼び出しが視界から消える。
    expect(
      messageIds(`
        async function seed() {
          await db.slot.create({ data: { position: 0 } });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });
});

describe("seed の一意制約 rule — 前身の正規表現 gate が通していた 3 つ", () => {
  test("① where が変数の削除を「条件なし」と同一視しない", () => {
    // 旧実装は解析できないと null を返し、それを「where 無し」と潰していた。
    expect(
      messageIds(`
        async function seed() {
          await prisma.ticket.deleteMany({ where: filter });
          await prisma.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["unprovableDeletion"]);
  });

  test("① spread を含む where も証明に使えない", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.ticket.deleteMany({ where: { ...base, eventId: event.id } });
          await prisma.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["unprovableDeletion"]);
  });

  test("② 単一列 unique で免除が無条件 true に潰れない", () => {
    // 旧実装は「自分以外の列」を絞ってから every() を回すので、単一列だと
    // 空配列 → 常に true。無関係な条件の削除でも免除されていた。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.deleteMany({ where: { status: "DRAFT" } });
          await prisma.slot.create({ data: { position: 0, status: "OPEN" } });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("② 単一列 unique は自分自身が同じ値で固定されていれば通る", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.deleteMany({ where: { position: 0 } });
          await prisma.slot.create({ data: { position: 0, status: "OPEN" } });
        }
      `),
    ).toEqual([]);
  });

  test("③ 証明は create ごと — 別スライスへの 2 つ目に流用されない", () => {
    // 旧実装は (関数, model, 列) 単位で免除していたので、1 つ目の証明が
    // 別の eventId へ書く 2 つ目にもかかっていた。
    expect(
      messageIds(`
        async function seed() {
          await tx.ticket.deleteMany({ where: { eventId: event.id } });
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
          await tx.ticket.create({
            data: { eventId: otherEvent.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });
});

describe("seed の一意制約 rule — AST 版の 2 巡目に塞いだ 3 つ", () => {
  test("④ 引数が変数の deleteMany を「条件なし」と同一視しない", () => {
    // 前回は `where` の値だけを見ていたので、引数そのものを変数へ括り出されると
    // 「where が無い＝全件削除」に化けていた。
    // 報告は `unprovableDeletion`（「解析できない」）— 原因を名指しできる分、
    // 素の `literalUniqueWrite` より直せる情報が多い。
    expect(
      messageIds(`
        async function seed() {
          const args = { where: { status: "DRAFT" } };
          await prisma.slot.deleteMany(args);
          await prisma.slot.create({ data: { position: 0, status: "OPEN" } });
        }
      `),
    ).toEqual(["unprovableDeletion"]);
  });

  test("⑤ createMany の配列ペイロードを検査する", () => {
    // 直下のオブジェクトしか見ていないと、配列の中のリテラルを丸ごと見落とす。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.createMany({ data: [{ position: 0 }] });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑤ .map() と const 配列の中も検査する", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.createMany({
            data: rows.map((row) => ({ position: 0, status: row.status })),
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);

    expect(
      messageIds(`
        async function seed() {
          const rows = [{ position: 0 }];
          await prisma.slot.createMany({ data: rows });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑥ 条件分岐の中の削除は証明にならない", () => {
    // 条件が false の経路では既存行が残ったまま create に進む。
    expect(
      messageIds(`
        async function seed() {
          if (reconcile) {
            await tx.ticket.deleteMany({ where: { eventId: event.id } });
          }
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑥ 同じ枝の中なら通る", () => {
    expect(
      messageIds(`
        async function seed() {
          if (reconcile) {
            await tx.ticket.deleteMany({ where: { eventId: event.id } });
            await tx.ticket.create({
              data: { eventId: event.id, sortOrder: 0 },
            });
          }
        }
      `),
    ).toEqual([]);
  });

  test("⑥ 同じループ本体なら通る（実 seedEvents の形）", () => {
    expect(
      messageIds(`
        async function seed() {
          for (const event of events) {
            await tx.ticket.deleteMany({ where: { eventId: event.id } });
            await tx.ticket.create({
              data: { eventId: event.id, sortOrder: 0 },
            });
          }
        }
      `),
    ).toEqual([]);
  });

  test("⑥ ループの中で消してループの外で作るのは通らない", () => {
    // ループが 0 回なら削除は一度も走らない。
    expect(
      messageIds(`
        async function seed() {
          for (const event of events) {
            await tx.ticket.deleteMany({ where: { eventId: event.id } });
          }
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑥ 外側が式文でも内側の分岐を見失わない（実 seed の形）", () => {
    // 実 seed は `await prisma.$transaction(async (tx) => { ... })` の中に居る。
    // 制御パスを**最初の**式文で切ると、その外側の式文で切れてしまい内側の
    // `if` が消える。合成コード片だけで検証していたので一度これを見逃した。
    expect(
      messageIds(`
        async function seed() {
          await prisma.$transaction(async (tx) => {
            if (existing) {
              await tx.ticket.deleteMany({ where: { eventId: event.id } });
            }
            await tx.ticket.create({
              data: { eventId: event.id, sortOrder: 0 },
            });
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑥ transaction の中でも同じ枝なら通る", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.$transaction(async (tx) => {
            await tx.ticket.deleteMany({ where: { eventId: event.id } });
            await tx.ticket.create({
              data: { eventId: event.id, sortOrder: 0 },
            });
          });
        }
      `),
    ).toEqual([]);
  });

  test("読めない spread があっても、見えるリテラルは検査する", () => {
    // spread 全体で bail すると `...declaredContent` を持つ正常な seed を
    // 22 箇所叩いて blanket disable を招く。逆に無視すると見えるリテラルまで
    // 漏らす。**見える分だけ**検査するのが正しい境界。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.create({ data: { ...base, position: 0 } });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });
});

describe("seed の一意制約 rule — AST 版の 3 巡目に塞いだ 3 つ", () => {
  test("⑦ 引数そのものが変数でも検査する", () => {
    // `create(args)` の形で丸ごと括り出されると、引数が ObjectExpression では
    // ないので早期 return していた。行単位で走査していた前身は見えていた。
    expect(
      messageIds(`
        async function seed() {
          const args = { data: { position: 0 } };
          await prisma.slot.create(args);
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑧ 配列に spread があっても、見えている行は検査する", () => {
    // spread は追えないが、その隣のリテラルは見えている。配列ごと捨てると
    // 「見える分は検査する」という約束と食い違う。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.createMany({
            data: [...baseRows, { position: 0 }],
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("⑨ その値自体を upsert の where キーにする形は通す", () => {
    // 規約が名指ししている安全な形。
    // キーが一致していれば既存行は update されるだけで衝突しえない。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.upsert({
            where: { position: 0 },
            update: {},
            create: { position: 0, status: "OPEN" },
          });
        }
      `),
    ).toEqual([]);
  });

  test("⑨ 複合キーの wrapper も開く", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.ticket.upsert({
            where: { eventId_sortOrder: { eventId: event.id, sortOrder: 0 } },
            update: {},
            create: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual([]);
  });

  test("⑨ where のキーが create の値と違えば通さない", () => {
    // 「upsert だから安全」ではない。**同じ値で固定されている**ことが根拠。
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.upsert({
            where: { position: 1 },
            update: {},
            create: { position: 0, status: "OPEN" },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });
});

describe("seed の一意制約 rule — その他の不変条件", () => {
  test("削除を狭める余分な条件があれば証明にならない", () => {
    // `isAvailable: true` を足すと非公開行が残り、キー空間は空にならない。
    expect(
      messageIds(`
        async function seed() {
          await tx.ticket.deleteMany({
            where: { eventId: event.id, isAvailable: true },
          });
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("削除が create より後ろにあっては守られない", () => {
    expect(
      messageIds(`
        async function seed() {
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
          await tx.ticket.deleteMany({ where: { eventId: event.id } });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  test("別の関数の削除は証明にならない", () => {
    expect(
      messageIds(`
        async function clear() {
          await tx.ticket.deleteMany({ where: { eventId: event.id } });
        }
        async function seed() {
          await tx.ticket.create({
            data: { eventId: event.id, sortOrder: 0 },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });

  // 監査 F-17: **元の欠陥の形は `findUnique`** だった（`prisma/seed.ts` のコメントが
  // 記録している）。partialIndexes preview により生成 client の WhereUniqueInput は
  // partial unique の列を単独 unique キーとして受け付けるので、`findFirst` から
  // `findUnique` に戻すだけで旧 rule は緑になっていた。
  test("findUnique / findMany / count の probe でも述語の欠落を検出する", () => {
    for (const probe of [
      "await tx.article.findUnique({ where: { slug: input.slug } });",
      "await tx.article.findUniqueOrThrow({ where: { slug: input.slug } });",
      "await tx.article.findFirstOrThrow({ where: { slug: input.slug } });",
      "await tx.article.findMany({ where: { slug: input.slug } });",
      "await tx.article.count({ where: { slug: input.slug } });",
    ]) {
      expect(
        messageIds(`
        async function seed() {
          ${probe}
        }
      `),
      ).toEqual(["missingPredicate"]);
    }
  });

  test("述語が揃っていれば findUnique でも通る", () => {
    expect(
      messageIds(`
        async function seed() {
          await tx.article.findUnique({
            where: { slug: input.slug, deletedAt: null },
          });
        }
      `),
    ).toEqual([]);
  });

  test("partial unique の述語が抜けた probe を検出する", () => {
    expect(
      messageIds(`
        async function seed() {
          await tx.article.findFirst({ where: { slug: input.slug } });
        }
      `),
    ).toEqual(["missingPredicate"]);
  });

  test("partial unique の述語を反転させた probe を検出する", () => {
    // 一番危険な形。前身は入れ子を跨げず、これを丸ごと走査対象外にしていた。
    expect(
      messageIds(`
        async function seed() {
          await tx.article.findFirst({
            where: { slug: input.slug, deletedAt: { not: null } },
          });
        }
      `),
    ).toEqual(["predicateValueMismatch"]);
  });

  test("unique の列で引いていない probe は対象外", () => {
    expect(
      messageIds(`
        async function seed() {
          await tx.article.findFirst({ where: { deletedAt: { not: null } } });
        }
      `),
    ).toEqual([]);
  });

  test("upsert の create 側も見る", () => {
    expect(
      messageIds(`
        async function seed() {
          await prisma.slot.upsert({
            where: { id: "x" },
            update: {},
            create: { position: 0, status: "OPEN" },
          });
        }
      `),
    ).toEqual(["literalUniqueWrite"]);
  });
});

describe("配線", () => {
  test("rule が prisma/seed.ts に適用されている", () => {
    const config = readFileSync(join(ROOT, "eslint.config.mjs"), "utf8");

    // 配線が外れると rule は静かに何も守らなくなる。
    const block = /name: "seed-unique-constraint-gate"[\s\S]*?\n  \},/u.exec(
      config,
    );
    if (!block) throw new Error("seed-unique-constraint-gate ブロックが無い");

    expect(block[0]).toContain('files: ["prisma/seed.ts"]');
    expect(block[0]).toContain(
      '"local/seed-respects-unique-constraints": "error"',
    );
  });

  test("fixture schema が rule の前提とする形を持っている", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");

    // fixture が痩せると、上のケースが「たまたま通る」だけになる。
    expect(schema).toContain("@@unique([eventId, sortOrder])");
    expect(schema).toMatch(/position\s+Int\s+@unique/u);
    expect(schema).toContain("@@unique([slug], where: { deletedAt: null })");
  });
});
