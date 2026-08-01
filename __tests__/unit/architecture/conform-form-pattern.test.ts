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
/**
 * `<form ... action={...}>`。この gate の適用対象かどうかの判定にだけ使う。
 *
 * **JSX タグの数を guard 数と突き合わせてはいけない。** 1 つの conform 設定を
 * 条件分岐で 2 つの `<form>` として描画するのは正当だし、conform フォームと
 * 無関係な Server Action フォームが 1 ファイルに同居することもある。
 * どちらも guard は 1 つで足りるのに、タグ数で数えると落ちる（Codex #1806 指摘。
 * probe で誤検出を再現済み）。突き合わせる相手は `useForm` の数（下記）。
 */
const FORM_ACTION_PROP = /<form[^>]*action=\{/su;
/**
 * conform の設定 1 つ = guard 1 つが要る単位。
 *
 * **代入の形まで見る。** 素朴に `useForm[<(]` を数えると、canonical shape を
 * 説明する JSDoc の `useForm<z.input<typeof schema>>` まで 1 件に数えてしまい、
 * `BroadcastForm` が「useForm 2 件に対し guard 1 件」で落ちた。
 * `.claude/rules` に記録済みの prose 誤検出（#1772）と同型。
 */
const USE_FORM_CONFIG = /=\s*useForm[<(]/gu;
/**
 * helper を conform の `onSubmit` に **渡している**こと。
 * 素朴に `dispatchWithoutFormReset` を探すと **import 行だけで通ってしまう**
 * （この gate 自身の self-test で実際に踏んだ: 呼び出しを消しても import が
 * 残っていたため緑になった）。呼び出しの形まで見る。
 */
const USES_HELPER = /onSubmit:\s*dispatchWithoutFormReset\(/gu;
/** ref capture 等で helper に載せられない場合の inline 実装 */
const INLINE_ONSUBMIT = /onSubmit\(event/gu;
/** inline 版は preventDefault で React の action 実行を止めているのが必須 */
const HAS_PREVENT_DEFAULT = /event\.preventDefault\(\)/u;

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

/**
 * auto-reset を止めている箇所の数。
 *
 * **ファイル単位の真偽値にしてはいけない。** `TaxonomyEditor` のように conform
 * フォームを 2 つ持つファイルでは「どこかに 1 つあれば緑」になり、片方の退行を
 * 取り逃す（self-test で確認: 2 つのうち 1 つを消しても 4 pass のままだった）。
 * `<form action>` の数と突き合わせるためにカウントを返す。
 */
function countGuards(source: string): number {
  const helperCalls = countMatches(source, USES_HELPER);
  // inline 版は preventDefault とセットのときだけ有効とみなす
  const inlineCalls = HAS_PREVENT_DEFAULT.test(source)
    ? countMatches(source, INLINE_ONSUBMIT)
    : 0;
  return helperCalls + inlineCalls;
}

/** conform 由来の UI プリミティブ（常にテキスト入力） */
const CONFORM_UI_INPUT = /<(Input|Textarea)[\s/>]/u;
const NATIVE_INPUT_TAG = /<input\b[^>]*>/gsu;
/**
 * テキスト入力**ではない** native input の type。
 *
 * `type` を書かない `<input name="title" />` は HTML 既定で `text` なので
 * **テキスト入力として数える**。明示 type だけを列挙する書き方だと、この
 * 一番ありふれた形が gate をすり抜ける。`type={expr}` の動的指定も判別
 * できない以上テキスト側に倒し、gate を緩める方向には解釈しない。
 */
const NON_TEXT_INPUT_TYPE =
  /\btype=\s*\{?\s*["']?\s*(hidden|checkbox|radio|file|submit|button|reset|image|range|color)\b/u;

/** conform を使わず、ユーザーがテキストを打ち込むフォーム = 移行対象 */
function isHandRolledTextForm(source: string): boolean {
  if (!HAS_FORM.test(source)) return false;
  if (IMPORTS_CONFORM.test(source)) return false;
  if (CONFORM_UI_INPUT.test(source)) return true;
  return (source.match(NATIVE_INPUT_TAG) ?? []).some(
    (tag) => !NON_TEXT_INPUT_TYPE.test(tag),
  );
}

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

  test("conform + <form action> は 1 フォームごとに auto-reset を止めている", () => {
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      if (!HAS_FORM.test(source)) continue;
      if (!IMPORTS_CONFORM.test(source)) continue;
      if (!USES_ACTION_STATE.test(source)) continue;

      // `<form action>` は「この gate の対象か」の判定だけに使う
      if (!FORM_ACTION_PROP.test(source)) continue;

      const configs = countMatches(source, USE_FORM_CONFIG);
      const guards = countGuards(source);
      if (guards >= configs) continue;

      violations.push(
        `${toRepoPath(filePath)} (useForm ${configs.toString()} 件に対し guard ${guards.toString()} 件)`,
      );
    }

    expect(violations).toEqual([]);
  });

  test("テキスト入力を持つフォームは conform を使う（allowlist は解消待ち）", () => {
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      if (!isHandRolledTextForm(readFileSync(filePath, "utf8"))) continue;

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

  test("allowlist の entry は今も違反している（移行が済んだら消す）", () => {
    // path の存在だけを見ると、移行済みファイルの entry が残り続ける。その状態で
    // 後から conform を外すと、残骸の entry が黙って免除してしまう。
    // 「今も手書きのままか」を毎回検証して、ratchet に死んだ免除を溜めない。
    const alreadyMigrated: string[] = [];

    for (const repoPath of CONFORM_MIGRATION_ALLOWLIST.keys()) {
      const absolute = join(ROOT, repoPath);
      // 消滅は上のテストが検出するのでここでは飛ばす
      if (!existsSync(absolute)) continue;
      if (isHandRolledTextForm(readFileSync(absolute, "utf8"))) continue;

      alreadyMigrated.push(repoPath);
    }

    expect(alreadyMigrated).toEqual([]);
  });
});
