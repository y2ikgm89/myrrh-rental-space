/**
 * DB の enum に裏打ちされた列を、TS 側で `string` と宣言していないか。
 *
 * ## なぜ要るのか
 *
 * `string` と宣言すると、**値域が動いてもコンパイラが何も言わなくなる**。
 * `string` と文字列リテラルの比較は合法だからで、`=== "connected"` は型検査を
 * 素通りする。
 *
 * 実害の記録（20260805100000 の直後、Codex #1937 が指摘）:
 *
 * | 場所 | 宣言 | 起きたこと |
 * | --- | --- | --- |
 * | `settings/types.ts` の `stripeConnectionStatus` | `string \| null` | 接続済みの Stripe が**エラー表示**になる |
 * | `settings/types.ts` の `googleCalendarConnectionStatus` | `string \| null` | 同上 |
 * | `admin-queries.ts` の `parseCalendarConnectionStatus(value: string \| null)` | `string \| null` | パーサが常に null を返し、**カレンダー連携と双方向同期が無言で止まる** |
 *
 * 値を大文字へ寄せる migration を書いた時点で、これらは全部壊れていた。**型検査も
 * 生 SQL ゲートも何も言わなかった。** 直す前に `string` を enum へ変えたところ、
 * コンパイラが 8 箇所を正確に指した — 型が正しければ探す必要は無い。
 *
 * ## 判定
 *
 * schema.prisma で enum 型の列を集め、その field 名が TS の型宣言で `string` に
 * なっている箇所を違反とする。**enum 型そのものを使えば型検査が働く。**
 *
 * 同名の別概念を巻き込みうるので、`AMBIGUOUS_FIELD_NAMES` に理由付きで登録できる。
 * ただし「たまたま同じ名前」以外の理由で載せない — `string` にしたい理由が
 * あるなら、それは値域が enum で表せていないという設計の話になる。
 *
 * ## 既存分は ratchet で扱う
 *
 * ConnectionStatus を直した時点で同じ形が **30 件**残っていた。1 つの PR に
 * 無関係な変更を大量に混ぜないため、出発点を凍結して減らす方向にだけ動かす。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPrismaSchema } from "../../support/prisma-sources";

/**
 * `string` 宣言を許す field 名と、その理由。
 *
 * **「同名の別概念」以外を載せない。**
 */
const AMBIGUOUS_FIELD_NAMES: ReadonlyMap<string, string> = new Map([
  [
    "type",
    "汎用すぎる。Media / BlockedDate / Coupon など多数のモデルが持ち、UI の union 型・discriminated union の判別子・HTML の input type とも衝突する",
  ],
  [
    "status",
    "同上。Prisma enum の status と、Server Action の submission status / fetch の status が同名で共存する",
  ],
  [
    "scope",
    "OAuth の scope（Account.scope は enum ではない素の文字列）と BlockedDate.scope が同名",
  ],
  ["role", "Prisma の Role enum と ARIA role が同名"],
  ["format", "Prisma の EventFormat と、日付フォーマット指定の文字列が同名"],
]);

/**
 * **これは ratchet。凍結された出発点で、縮む方向にしか動かさない。**
 *
 * ConnectionStatus の事故を直した時点で、同じ形の宣言が 30 件残っていた。
 * 一度に直すと 1 つの PR に無関係な変更が大量に混ざるので、出発点を凍結して
 * ここから減らす。**空になったらこの一覧ごと削除する**（空の ratchet は
 * 「一覧に足せば免除される」抜け道でしかない — 命名規約ゲートで一度そうなった）。
 *
 * 形式は `<path>::<field>`。片付いたら消す。消し忘れは下の test が落とす。
 */
const BASELINE_STRING_DECLARATIONS: ReadonlySet<string> = new Set([
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/types.ts::contentWidth",
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-news-editor.ts::contentWidth",
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-post-editor.ts::contentWidth",
  "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx::contentWidth",
  "src/app/(admin)/admin/(dashboard)/_shared/lib/audit.ts::action",
  "src/app/(admin)/admin/(dashboard)/_shared/types/media-picker.ts::usage",
  "src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx::usage",
  "src/app/(admin)/admin/(dashboard)/media/_components/MediaListWrapper.tsx::usage",
  "src/app/(admin)/admin/(dashboard)/settings/_components/sections/HeaderSection.tsx::headerBackgroundMode",
  "src/app/(admin)/admin/(dashboard)/settings/_components/sections/HeaderSection.tsx::headerScrollBehavior",
  "src/app/(public)/mypage/_components/reservation-card.tsx::paymentStatus",
  "src/app/(public)/mypage/_components/reservation-list.tsx::paymentStatus",
  "src/app/(public)/mypage/_lib/build-reservation-list-items.ts::paymentStatus",
  "src/app/(public)/mypage/events/_components/event-registration-list.tsx::paymentStatus",
  "src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx::paymentStatus",
  "src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx::taxRateType",
  "src/shared/domain/events/edit-eligibility.ts::paymentStatus",
  "src/shared/domain/events/guest-status-view.ts::paymentStatus",
  "src/shared/domain/events/registration-customer-update-commands.ts::paymentStatus",
  "src/shared/domain/instagram/commands.ts::mediaType",
  "src/shared/domain/instagram/types.ts::mediaType",
  "src/shared/domain/media/queries.ts::usage",
  "src/shared/domain/receipts/issue-core.ts::paymentStatus",
  "src/shared/domain/reservations/edit-eligibility.ts::paymentStatus",
  "src/shared/domain/reservations/reservation-card-deadline.ts::paymentStatus",
  "src/shared/domain/settings/queries/organization.ts::platform",
  "src/shared/domain/spaces/queries.ts::discountType",
  "src/shared/domain/spaces/queries.ts::durationDiscountOverride",
  "src/shared/lib/smart-lock/switchbot-client.ts::deviceType",
  "src/shared/lib/turnstile.ts::action",
]);

const ROOTS = ["src"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const schema = readPrismaSchema();

/** schema.prisma で enum 型が付いている列の field 名。 */
function enumBackedFieldNames(): Set<string> {
  const enumNames = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gmu)].map((m) => m[1] ?? ""),
  );
  const out = new Set<string>();
  for (const match of schema.matchAll(/^model \w+ \{([\s\S]*?)^\}/gmu)) {
    const body = match[1];
    if (body === undefined) continue;
    for (const line of body.split(/\r?\n/u)) {
      const column = /^ {2}(\w+)\s+(\w+)/u.exec(line);
      if (!column) continue;
      const [, field, type] = column;
      if (field === undefined || type === undefined) continue;
      if (enumNames.has(type)) out.add(field);
    }
  }
  return out;
}

const enumFields = enumBackedFieldNames();

/** `field: string` / `field: string | null` 形の宣言。関数引数もこの形で書かれる。 */
function declaredAsString(source: string, field: string): boolean {
  return new RegExp(
    `\\b${field}\\??\\s*:\\s*string(\\s*\\|\\s*(null|undefined))*\\s*[;,)]`,
    "u",
  ).test(source);
}

const files = ROOTS.flatMap((root) => walk(root));

/** いま `string` で宣言されている `<path>::<field>` の一覧。 */
function currentViolations(): string[] {
  const targets = [...enumFields].filter((f) => !AMBIGUOUS_FIELD_NAMES.has(f));
  const out: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const field of targets) {
      if (!source.includes(field)) continue;
      if (declaredAsString(source, field)) {
        out.push(`${file.replaceAll("\\", "/")}::${field}`);
      }
    }
  }
  return out;
}

describe("DB enum の列を string で宣言していない", () => {
  test("走査が空振りしていない", () => {
    // 実測: enum 裏打ちの field 名 40 種前後 / src 配下 2000 ファイル超。
    expect(enumFields.size).toBeGreaterThan(20);
    expect(files.length).toBeGreaterThan(500);
  });

  test("凍結した出発点に無い string 宣言が増えていない", () => {
    const added = currentViolations()
      .filter((v) => !BASELINE_STRING_DECLARATIONS.has(v))
      .map(
        (v) =>
          `${v} — schema.prisma では enum 列。enum 型で受ければ値域が動いたとき型検査が止める`,
      );
    expect(added).toEqual([]);
  });

  test("片付いた entry が出発点に残っていない", () => {
    // 消し忘れると、後で同じ場所が `string` に戻っても黙って免除される。
    const current = new Set(currentViolations());
    const stale = [...BASELINE_STRING_DECLARATIONS].filter(
      (v) => !current.has(v),
    );
    expect(stale).toEqual([]);
  });

  test("同名衝突の免除に実在しない field 名が混ざっていない", () => {
    const unknown = [...AMBIGUOUS_FIELD_NAMES.keys()].filter(
      (f) => !enumFields.has(f),
    );
    expect(unknown).toEqual([]);
  });
});
