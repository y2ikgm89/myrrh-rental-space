/**
 * フォーム実装の house pattern gate。
 *
 * 2 つの不変条件を静的に固定する。
 *
 * ## 1. conform フォームは React 19 の form auto-reset を止める
 *
 * React 19 は `action` prop に渡した関数が resolve した時点でフォームを自動
 * リセットする（公式 Server Functions:「React handles the submission and
 * automatically resets the form upon success」）。`useActionState` の action は
 * throw せず `SubmissionResult` を返すため、**サーバーが form-level エラーを
 * 返した応答もリセット対象**になる。
 *
 * リセットで input が空になると conform は空の FormData で再検証し、その
 * field errors が **サーバーのメッセージを上書きして消す**。実測
 * (CI run 30695870083 の trace): VIEWER の顧客作成でサーバーが
 * `customerのcreate権限がありません` を返し `aria-describedby` まで付いた
 * +76ms 後の状態から、+236ms で拒否メッセージが消え、空欄由来の
 * `Invalid input: expected string, received undefined` だけが残っていた。
 * 公開側では「このタイムスロットは満員です」等の DomainError が同じ経路で消える。
 *
 * 対策は `dispatchWithoutFormReset`（`src/shared/lib/forms/conform-submit.ts`）を
 * conform の `onSubmit` に渡すこと。ref の capture 等で helper に渡せない場合は
 * 同じ処理を `onSubmit(event, { formData })` として inline で書く。
 * **`action` prop は外さない** — `getFormProps` は `method` を返さないので、
 * 外すと hydration 前の submit がネイティブ GET になり入力内容が URL に載る。
 *
 * この条件は **allowlist を持たない**。全 60 フォームを対応済みで 0 件が現状値。
 *
 * ## 2. テキスト入力を持つフォームは conform を使う
 *
 * 手書きの `useState` + `if (!name) toast.error(...)` は、Zod schema と検証を
 * 二重管理し、field-level エラー表示と `aria-invalid` / `aria-describedby` を
 * 落とす。house pattern は conform + Zod（`.claude/rules/forms-mutations.md`）。
 *
 * こちらは **ratchet**。既存の逸脱を allowlist に固定し、新規追加だけを止める。
 * allowlist から 1 件ずつ外していくのが解消手順。
 *
 * @see https://react.dev/reference/rsc/server-functions
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "src", "app");
const HELPER = join(ROOT, "src", "shared", "lib", "forms", "conform-submit.ts");

/**
 * conform 未使用のまま残っているフォーム（Tier 2 の解消対象）。
 *
 * 追加するときは **なぜ conform に載らないのか**を書く。単に「まだ直していない」
 * ものは足さず、直してから消すこと。
 */
const CONFORM_MIGRATION_ALLOWLIST = new Map<string, string>([
  [
    "src/app/(admin)/admin/(dashboard)/events/[id]/check-in/_components/ProxyRegistrationDialog.tsx",
    "代行登録ダイアログ (7 項目)。action が MutationResult を返す形なので、移行には Server Action の signature 変更を伴う",
  ],
  [
    "src/app/(admin)/admin/(dashboard)/events/[id]/check-in/_components/WalkInDialog.tsx",
    "当日参加ダイアログ (7 項目)。同上",
  ],
  [
    "src/app/(admin)/admin/(dashboard)/settings/_components/sections/sidebar/SidebarWidgetDialog.tsx",
    "サイドバーウィジェット (4 項目)。Zod を URL 検証にだけ部分使用しており、schema 全体の定義から必要",
  ],
  [
    "src/app/(public)/mypage/inquiries/[id]/_components/inquiry-reply-form.tsx",
    "問い合わせ返信。action が引数受け取り (inquiryId, body, token) なので FormData 化が必要",
  ],
  [
    "src/app/(public)/receipts/reissue-request/_components/receipt-resend-form.tsx",
    "領収書再発行依頼。同上",
  ],
]);

const HAS_FORM = /<form[\s>]/u;
const IMPORTS_CONFORM = /from "@conform-to\/react"/u;
const USES_ACTION_STATE = /useActionState\(/u;
/** `<form ... action={...}>`。属性は改行を跨ぐので dotAll で見る */
const FORM_ACTION_PROP = /<form[^>]*action=\{/su;
/**
 * helper を conform の `onSubmit` に **渡している**こと。
 * 素朴に `dispatchWithoutFormReset` を探すと **import 行だけで通ってしまう**
 * （この gate 自身の self-test で実際に踏んだ: 呼び出しを消しても import が
 * 残っていたため緑になった）。呼び出しの形まで見る。
 */
const USES_HELPER = /onSubmit:\s*dispatchWithoutFormReset\(/u;
/** ref capture 等で helper に載せられない場合の inline 実装 */
const HAS_INLINE_ONSUBMIT = /onSubmit\(event/u;
/** inline 版は preventDefault で React の action 実行を止めているのが必須 */
const HAS_PREVENT_DEFAULT = /event\.preventDefault\(\)/u;

function stopsAutoReset(source: string): boolean {
  if (USES_HELPER.test(source)) return true;
  return HAS_INLINE_ONSUBMIT.test(source) && HAS_PREVENT_DEFAULT.test(source);
}
/**
 * ユーザーがテキストを打ち込む入力。select / switch / checkbox しか無い
 * フォームは client validation する対象が無いので対象外にする。
 */
const HAS_TEXT_INPUT =
  /<(Input|Textarea)[\s/>]|<input[^>]*type="(text|email|tel|password|search|url|number)"/u;

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectTsxFiles(p));
    } else if (ent.isFile() && ent.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function toRepoPath(absolute: string): string {
  return relative(ROOT, absolute).split("\\").join("/");
}

describe("conform form pattern", () => {
  test("helper と app root が存在する（rename を silent green にしない）", () => {
    expect(existsSync(APP_ROOT)).toBe(true);
    expect(existsSync(HELPER)).toBe(true);
  });

  test("conform + <form action> のフォームは form auto-reset を止めている", () => {
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      if (!HAS_FORM.test(source)) continue;
      if (!IMPORTS_CONFORM.test(source)) continue;
      if (!USES_ACTION_STATE.test(source)) continue;
      if (!FORM_ACTION_PROP.test(source)) continue;
      if (stopsAutoReset(source)) continue;

      violations.push(toRepoPath(filePath));
    }

    expect(violations).toEqual([]);
  });

  test("テキスト入力を持つフォームは conform を使う（allowlist は解消待ち）", () => {
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      if (!HAS_FORM.test(source)) continue;
      if (IMPORTS_CONFORM.test(source)) continue;
      if (!HAS_TEXT_INPUT.test(source)) continue;

      const repoPath = toRepoPath(filePath);
      if (CONFORM_MIGRATION_ALLOWLIST.has(repoPath)) continue;

      violations.push(repoPath);
    }

    expect(violations).toEqual([]);
  });

  test("allowlist に死んだ path が残っていない", () => {
    const stale = [...CONFORM_MIGRATION_ALLOWLIST.keys()].filter(
      (p) => !existsSync(join(ROOT, p)),
    );

    expect(stale).toEqual([]);
  });
});
