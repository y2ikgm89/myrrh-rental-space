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
 * 落とす。house pattern は conform + Zod。
 *
 * こちらは **ratchet**。allowlist は現在 **空**（全フォーム移行済み）で、
 * 新しい手書きフォームが入った時点で落ちる。
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
 * conform 未使用のまま残っているフォーム。
 *
 * **現在ゼロ。** 追加するときは **なぜ conform に載らないのか**を書く。単に
 * 「まだ直していない」ものは足さず、直してから消すこと。移行が済んだ entry は
 * 「allowlist の entry は今も違反している」テストが落として消し忘れを防ぐ。
 */
const CONFORM_MIGRATION_ALLOWLIST = new Map<string, string>([]);

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
 * gate が数を数えられなくなる書き方。
 *
 * `import { useForm as useConformForm }` のように別名を付けられると識別子ベースの
 * 検出が 0 件になり、**guard を 1 つも持たないフォームが素通りする**
 * （Codex #1808 指摘、probe で再現済み）。静かに緩めるのではなく明示的に落として、
 * 別名を付けない書き方に戻させる。
 */
const ALIASED_HOOK_IMPORT = /\b(useForm|useActionState)\s+as\s+\w+/u;
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
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると violations も必ず空になり、緑が「違反なし」を
    // 意味しなくなる（local/gate-scan-must-not-be-silently-empty が強制）。
    expect(collectTsxFiles(APP_ROOT).length).toBeGreaterThan(20);
  });

  test("helper と app root が存在する（rename を silent green にしない）", () => {
    expect(existsSync(APP_ROOT)).toBe(true);
    expect(existsSync(HELPER)).toBe(true);
  });

  /**
   * **検出できる範囲を明示しておく。**
   *
   * このテストが落とせるのは「conform + Server Action のファイルに guard が
   * 1 つも無い」場合と「hook を別名 import して検出不能にした」場合。
   * 1 ファイルに複数の action フォームがあり **その一部だけ** guard を欠く形は
   * 検出できない。
   *
   * 件数比較を 3 通り試したが、いずれも正当なコードを誤検出した:
   *
   * | 数える対象      | 誤検出する正当な形                                          |
   * | --------------- | ----------------------------------------------------------- |
   * | `<form action>` | 1 設定を条件分岐で 2 つの `<form>` として描画する            |
   * | `useForm`       | action を持たない client-only の conform 設定が同居している   |
   * | `useActionState`| 2 つの Dialog が共通の Form コンポーネントに action を渡す（`FaqCategoryDialog`） |
   *
   * 静的解析では「どの hook がどの `<form>` に対応するか」を追えない。
   * **誤検出は正しいコードを書けなくする**ので、そちらを避けて範囲を狭めた。
   * 部分的な漏れはレビューで見る。
   */
  test("conform + <form action> のファイルは auto-reset の guard を持つ", () => {
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(APP_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      if (!HAS_FORM.test(source)) continue;
      if (!IMPORTS_CONFORM.test(source)) continue;
      // `<form action>` は「この gate の対象か」の判定だけに使う
      if (!FORM_ACTION_PROP.test(source)) continue;

      // **alias の判定は usage の絞り込みより前に置く。** `useActionState as X`
      // と書かれると `USES_ACTION_STATE` が一致せず、その時点で continue して
      // alias 判定に到達しない = guard 皆無のフォームが素通りする
      // （Codex #1809 指摘、probe で再現済み: 5 pass のまま緑だった）。
      if (ALIASED_HOOK_IMPORT.test(source)) {
        violations.push(
          `${toRepoPath(filePath)} (useForm / useActionState を別名 import している。gate が検出できないので別名を付けない)`,
        );
        continue;
      }

      if (!USES_ACTION_STATE.test(source)) continue;
      if (countGuards(source) > 0) continue;

      violations.push(
        `${toRepoPath(filePath)} (auto-reset の guard が 1 つも無い)`,
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
