/**
 * 管理画面の conform フォームが「form-level エラー」を画面に出すことを強制する gate。
 *
 * ## なぜ
 *
 * `executeConformMutation` は handler が失敗すると
 * `submission.reply({ formErrors: [error] })` を返す。この `formErrors` は
 * `fields.<name>.errors` には現れず、`form.errors` / `form.allErrors` を描画して
 * いる場所にしか出ない。描画していないコンポーネントでは、権限拒否・機能制限
 * (`assertAdminFeatureCreateAllowed`)・slug 重複といった保存失敗が
 * **画面上まったく無言**になる。管理者からは「押したのに何も起きない」に見えるので
 * 押し直され、重複登録や二重キャンセルに直結する。
 *
 * 実際に main へ入っていた: 予約シリーズのキャンセル失敗が無言だった件（修正済み）に
 * 加えて、振込先口座 / 振込案内文 / お知らせバー / ナビゲーション / SNS リンク /
 * 投稿カテゴリー / 投稿タグ / 臨時休業 / スマートロックデバイスの 9 フォーム。
 * 同じ指摘が 2 回出たので gate 化する。
 *
 * ## 何を見るか
 *
 * 1. `useForm(` を呼ぶ `(admin)/admin/(dashboard)` 配下の .tsx が、
 *    `form.errors` か `form.allErrors` を参照していること。
 * 2. form-level エラーを JSX 条件に持ち込んでいる**全ブロック**（現在 58 箇所）が、
 *    その近傍に `role="alert"` / `aria-live` を持つこと（支援技術への通知）。
 *
 * ## 直し方
 *
 * form の末尾に、既存 50 箇所と同じ形を足す:
 *
 * ```tsx
 * const formErrors = form.errors;
 * // ...
 * {formErrors && formErrors.length > 0 && (
 *   <div id={form.errorId} role="alert" className="...text-destructive">
 *     {formErrors.join(", ")}
 *   </div>
 * )}
 * ```
 *
 * ## 既知の粗さ
 *
 * grep 相当の静的検査で、AST も到達性も見ていない。
 *
 * - 2. が受け付ける識別子は `form.errors` / `form.allErrors` / `formErrors` /
 *   `errorMessages` の 4 種だけ。**別名のローカル変数に入れると検査を素通りする。**
 *   実測（2026-08-12）ではこの 4 種で 58 ブロックすべてを拾えており、違反 0 件。
 *   次に取りこぼしが出たら、正規表現をこれ以上広げずに AST へ移すこと
 *   （`.claude/rules/architecture-gates.md`）。
 * - 1. は `useForm` を呼ぶファイルと描画するファイルが分かれると誤検出する。
 *   現在そのような分割は 0 件。
 */
import { describe, expect, test } from "bun:test";

import { callsAnyHook } from "../../helpers/ts-hook-calls";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ADMIN_DASHBOARD_ROOT = join(
  ROOT,
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }

  return out;
}

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/u).length;
}

const CONFORM_FORM_HOOKS = new Set(["useForm"]);

/**
 * conform の `useForm` を駆動しているソースか。
 *
 * 監査 A-97: 以前は `source.includes("useForm(")` だったので、
 * **`useForm<z.input<typeof schema>>({` が一致せず**実在のファイルが
 * 黙って母集団から外れていた。AST へ移してある。
 */
function drivesConformForm(source: string, filePath: string): boolean {
  return callsAnyHook(source, filePath, CONFORM_FORM_HOOKS);
}

/** form-level エラー（`formErrors`）を描画に流しているソースか。 */
function rendersFormLevelErrors(source: string): boolean {
  return source.includes("form.errors") || source.includes("form.allErrors");
}

/**
 * form-level エラーを JSX の条件に持ち込んでいる箇所。
 *
 * `const formErrors = form.errors;` を挟む書き方（本リポジトリの多数派）も拾えるよう、
 * 受け付ける識別子を実際に使われている 4 種に限定して列挙する。
 * `fields.<name>.errors`（field-level）は識別子が違うので入らない。
 */
const FORM_LEVEL_ERROR_RENDER =
  /\{\s*(?:form\.errors|form\.allErrors|formErrors|errorMessages)[^\n]*&&[^\n]*\(/gu;

describe("admin form error notifications", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    // 収集が黙って 0 件になると offenders も必ず空になり、緑が「違反なし」を
    // 意味しなくなる。件数の下限をここで固定する
    // （local/gate-scan-must-not-be-silently-empty が強制）。
    expect(collectTsxFiles(ADMIN_DASHBOARD_ROOT).length).toBeGreaterThan(20);
  });

  test("判定関数は「落ちるべき形」と「落ちてはいけない形」を区別する", () => {
    const missing = `
      const [form, fields] = useForm({ lastResult });
      return <form {...getFormProps(form)}>{fields.name.errors}</form>;
    `;
    const viaLocalConst = `
      const [form, fields] = useForm({ lastResult });
      const formErrors = form.errors;
      return <form {...getFormProps(form)}>{formErrors?.join(", ")}</form>;
    `;
    const viaAllErrors = `
      const [form] = useForm({ lastResult });
      const messages = Object.values(form.allErrors).flat();
      return <form {...getFormProps(form)}>{messages}</form>;
    `;

    expect(drivesConformForm(missing, "fixture.tsx")).toBe(true);
    expect(rendersFormLevelErrors(missing)).toBe(false);

    expect(rendersFormLevelErrors(viaLocalConst)).toBe(true);
    expect(rendersFormLevelErrors(viaAllErrors)).toBe(true);

    // useForm を呼ばないコンポーネントは対象外
    expect(
      drivesConformForm("return <p>{fields.name.errors}</p>;", "fixture.tsx"),
    ).toBe(false);

    // 型引数付きの呼出も母集団に入る（監査 A-97。旧実装の
    // `source.includes("useForm(")` はこれを黙って落としていた）。
    expect(
      drivesConformForm(
        "const [form, fields] = useForm<z.input<typeof schema>>({ lastResult });",
        "fixture.tsx",
      ),
    ).toBe(true);
  });

  test("conform フォームは form-level エラーを描画に流している", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    const drivers: string[] = [];
    const violations: string[] = [];

    for (const filePath of collectTsxFiles(ADMIN_DASHBOARD_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      if (!drivesConformForm(source, filePath)) continue;

      drivers.push(filePath);
      if (!rendersFormLevelErrors(source)) {
        violations.push(relative(ROOT, filePath));
      }
    }

    // 走査規模の下限。`useForm` の呼び出しが検出できなくなると violations も
    // 必ず空になるため、緑が「違反なし」を意味しなくなる。
    expect(drivers.length).toBeGreaterThan(40);
    expect(violations).toEqual([]);
  });

  test("form-level Conform errors are announced to assistive technology", () => {
    expect(existsSync(ADMIN_DASHBOARD_ROOT)).toBe(true);

    const violations: string[] = [];
    let blocks = 0;

    for (const filePath of collectTsxFiles(ADMIN_DASHBOARD_ROOT)) {
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(FORM_LEVEL_ERROR_RENDER)) {
        const index = match.index ?? 0;
        blocks += 1;
        // 条件行から描画要素の属性までを含む窓。既存 58 ブロックの最長でも
        // 300 文字未満だが、余裕を持たせる。
        if (
          !/role="alert"|aria-live=/u.test(source.slice(index, index + 500))
        ) {
          violations.push(
            `${relative(ROOT, filePath)}:${lineNumberFor(source, index)}`,
          );
        }
      }
    }

    // 走査規模の下限。正規表現が実際の書き方から外れると走査が 0 件になり、
    // 緑が「違反なし」を意味しなくなる。現在 58 ブロック。
    expect(blocks).toBeGreaterThan(40);
    expect(violations).toEqual([]);
  });
});
