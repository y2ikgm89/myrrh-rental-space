# 第6次監査 是正計画 A — 実害のある欠陥

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 第 6 次監査の静的補完で確定した、利用者・管理者に実害が到達する 8 件の欠陥を直す。

**Architecture:** 各 Task は独立した 1 PR。すべて TDD で、先に落ちるテストを書いてから実装を直す。テストが「今は落ちる」ことを実測してから進む。共有 helper への抽出は原則しない（3 回目の重複から、という規約に従う）— 抽出する Task はその根拠を本文に書いている。

**Tech Stack:** Next.js 16 (App Router, `APP_SURFACE` で public / admin の 2 サービス) / React 19 / TypeScript / Prisma 7 / PostgreSQL 18 (Neon) / Bun / conform + zod4 / Tailwind / bun:test / Playwright

## Global Constraints

これは全タスクに暗黙で適用される。タスクごとに再掲しない。

- **1 PR = 1 論理変更。** 目安 300 行 / 10 ファイル。超えるなら分割する。
- **1 つの振る舞いにつきテストは 1 本。** 網羅は既存 gate と CI の仕事。テストを盛らない。
- **抽象化は 3 回目の重複から。** 2 回目まではコピーのままでよい。
- **型のエスケープハッチ（`as any` / `@ts-ignore`）を足さない。** この repo では実質使われていない。
- **緑を偽装しない。** 落ちている gate を通すために gate 側を触らない。`skip` / assertion の弱め /
  allowlist 追記 / `--no-verify` / `LEFTHOOK=0` / 素の `bun test` はいずれも禁止（hook が deny する）。
- **成功を主張せず、証拠を出す。** 走らせたコマンドとその出力を示す。見ていないなら「未検証」と書く。
- 単一ファイルのテストは `bun run test -- <path>`。`bun run test:unit -- <file>` では**絞れない**（引数は追記されるだけ）。
- `bun run test -- <file>` は Prisma client を作り直さない。`schema.prisma` を触ったら先に `bun run db:generate`。
- `git push` は lefthook pre-push（type-check + architecture gate 全件）で 80〜110 秒かかる。**tool timeout は 300 秒以上。**
- `bun run format` は引数なしだとリポジトリ全体を書き換える。**触ったファイルだけ渡す。**
- commit message は conventional commits + 末尾 `[ai-gen]`。
- dev サーバーは人間が所有する。頼まれない限り起動も停止もしない。

## 出典

第 6 次コードベース監査（2026-08-15、変異検査ラウンド）。137 変異中 61 件が素通り、静的補完 12 件確定。
報告書: https://claude.ai/code/artifact/c6617756-f615-4eb2-a3f6-afae55611f56

**各タスクの記述は起案エージェントが現物で検証し、別の検証官が file:line・識別子・型・シグネチャを
再照合したうえで訂正したもの。**それでも行番号は書かれた時点のものなので、着手時にずれていたら訂正して進める。

---

## このプランの範囲

第 6 次監査の**静的補完で確定した 12 件のうち、実害が到達する 8 件**を直す。
どれも「利用者か管理者に実害が出る」ものだけで、体裁・命名・予防的指摘は含まない。

| Task | 内容                                          | 深刻度 | 実害                     |
| ---- | --------------------------------------------- | ------ | ------------------------ |
| 1    | 規約エディタの本文が保存されない              | 高     | 保存操作が無言で失敗する |
| 2    | 返金推奨額が税抜基準かつ既存返金を引かない    | 高     | 金額が誤る（両方向）     |
| 3    | 個人区分の顧客保存で会社名が null 上書き      | 中     | データ消失               |
| 4    | CONFLICT 復旧が他人の変更を消す               | 中     | データ消失               |
| 5    | イベント一斉配信が 0 通でも「送信しました」   | 中     | 失敗が成功に見える       |
| 6    | 顧客一括メールが 0 通を「配信停止済み」と表示 | 中     | 失敗が成功に見える       |
| 7    | キャンセル日時だけ UTC 生 ISO 表示            | 中     | 返金判断が 9 時間ずれる  |
| 8    | 参加者数が申込行数で実人数と不一致            | 中     | 表示が誤る               |

**着手順**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8。上ほど実害が重い。
各 Task は独立して PR にできる。依存関係は無い。

## このプランで**やらないこと**

以下は第 6 次で挙がったが、意図的に外した。**着手しないことがこのプランの一部**。

| 除外したもの                             | 理由                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| L-a 営業時間の一括適用が再検証しない     | 不正な値は保存されない。復旧はどの曜日の操作 1 回でよい                                        |
| L-b `updateContactInfo` の楽観ロック欠落 | 実害はあるが low。CAS を入れた PR #1509 のスコープ漏れで、別依頼として起票する                 |
| L-c スペース料金プレビューの定額割引     | 管理者の見積り表示のみ。実請求は正しい                                                         |
| news / post エディタの「プレビュー」失敗 | Task 1 と同原因だが本文保存は生きている。Task 1 の修正で自動的に直るかを Task 1 の中で判定する |
| `SidebarSection.tsx` の同型 CAS 問題     | Task 4 と同型。別コンポーネントなので別 PR。Task 4 完了後に同じ形で起票する                    |
| 変異検査で見つかった 61 件のうち 57 件   | 別プラン（関門の実効性）で 4 件のみ扱う。残りは下の「なぜ全部やらないか」参照                  |

### なぜ 61 件全部に gate を足さないか

CLAUDE.md の明文規約による。

> **新しい gate を足すのは、実際に起きた欠陥に対してだけ。**「将来こう間違えるかもしれない」で増やさない。
> 増やすコストは書く時間ではなく、以後すべての変更が通り抜ける関門の数。

61 件のうち「守り手が不在」は 13 件だが、そのうち実際に欠陥が起きた履歴があるのは一部。
GCP の PAUSED / maxScale / traffic は一度も起きていないので gate を足さない。
integration に guard がある 7 件は、gate を足すより**CI で本当に走っているかの確認**が安い。

---

### Task 1: 規約エディタの設定ダイアログ未マウント時の保存を修復する

**深刻度:** high / **見積り:** 約 108 行追加・44 行削除 / 3 ファイル（src 2・test 1）

**なぜ:** 設定ダイアログを一度も開いていない管理者が `/admin/terms/[id]/edit` で本文だけ編集して保存すると、`validateSettings()` のフォールバックが空の FormData を作り `slug` / `title` が欠落する。`parseWithZod` が `status: "error"` を返し `updateTerms` は呼ばれない。同じ `getSettingsDataForSubmit()` を通る「プレビュー」「公開」「下書きに戻す」も同様に無言で失敗する（toast は「入力内容に誤りがあります」だけ）。

**Files:**

- Add: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/terms-settings-form-data.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-terms-editor.ts:23`（import 差し替え）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-terms-editor.ts:188-231`（`validateSettings` 書き換え）
- Test: `__tests__/unit/components/editor/inline/terms-settings-form-data.test.ts`

**Interfaces:**

- Consumes:
  - `collectFormDataFromContainer(container: HTMLElement): FormData` — `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/shared/collect-form-data.ts:50`
  - `TermsSettingsFormState`（`{ type: string; slug: string; title: string; isPublished: boolean; scopes: TermsScope[]; changelog: string; showInFooter: boolean }`）— `use-terms-editor.ts:32-40`。**この型は移動させない**（理由は下の Step 3 の注記）
  - `termsSettingsFormSchema` — `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/terms.ts:54`（alias `@/admin/lib/validations/terms`）
  - `TermsScope` — `@/shared/lib/validations/enums/prisma-types`（`@generated/prisma/enums` の const オブジェクト再輸出。値として使える）
  - `parseWithZod` — `@conform-to/zod/v4`
- Produces:
  - `buildTermsSettingsFormData(container: HTMLElement | null, values: TermsSettingsFormState): FormData` — 後続タスク（news / post の同型修正）が参考にする形

**方針（1 つに決めた）**

`container` の有無で分岐する FormData 組み立てを新モジュールへ切り出し、`container === null` のとき外部 state を持たない `slug` / `title` を呼び出し側の値から明示的に入れる。

- 採らなかった案: hook 内に留めて `Object.entries(settingsFields)` を `formData.set("slug", slug)` / `formData.set("title", title)` の 2 行に置き換えるだけ（6 行差分）。React を描画しないと検証できずテストが書けないので採らない。
- 共有 helper への抽出はしない。3 hook の fallback は**形が違う**（terms は boolean を `"on" | ""` に、news は boolean 分岐 + 配列を `JSON.stringify`、post は boolean 分岐なし）ので「同じものが 3 回」ではない。今回作るモジュールは呼び出し元 1 つのままで、目的は共有ではなくテスト用の seam。

---

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/components/editor/inline/terms-settings-form-data.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import { buildTermsSettingsFormData } from "@/admin/components/editor/inline/hooks/terms-settings-form-data";
import { termsSettingsFormSchema } from "@/admin/lib/validations/terms";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

describe("buildTermsSettingsFormData", () => {
  test("設定ダイアログ未マウント (container=null) でも DB 初期値の slug / title が載り、設定スキーマを success で通る", () => {
    // 保存済み規約を開いた直後。設定ダイアログを一度も開いていないので
    // `[data-settings-form-container]` は DOM に存在せず container は null。
    // values は conform の defaultValue (= toSettingsFormData(terms)) と同じ値。
    const formData = buildTermsSettingsFormData(null, {
      type: "terms-of-use",
      slug: "kiyaku",
      title: "利用規約",
      isPublished: true,
      scopes: [TermsScope.RESERVATION],
      changelog: "",
      showInFooter: true,
    });

    expect(formData.get("slug")).toBe("kiyaku");
    expect(formData.get("title")).toBe("利用規約");

    const submission = parseWithZod(formData, {
      schema: termsSettingsFormSchema,
    });
    expect(submission.status).toBe("success");
  });
});
```

置き場の根拠: `__tests__/unit/components/editor/inline/` は既存（`settings-dialog-structure.test.ts` がある）。`.test.ts` なので runner は `bunfig.nodom.toml`（JSDOM preload なし）で起動する（`scripts/test-runner-bunfig.ts` の `DOM_REQUIRED_EXTENSIONS` は `.test.tsx` のみ、`DOM_REQUIRED_PREFIXES` は `__tests__/unit/components/editor/lexical/` のみで、`inline/` は含まれない）。`container` に `null` を渡すので DOM は不要。`collect-form-data.ts` の `instanceof HTMLInputElement` は関数本体の中だけなので module load でも DOM を触らない。`__tests__/unit` は integration ではないので実 DB marker は不要。

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/components/editor/inline/terms-settings-form-data.test.ts`

期待: FAIL。モジュールがまだ無いので（Bun v1.3.14 の実出力。**引用符はシングル**）

```
error: Cannot find module '@/admin/components/editor/inline/hooks/terms-settings-form-data' from 'G:\workspace\work\website\customer\myrrh-rental-space\__tests__\unit\components\editor\inline\terms-settings-form-data.test.ts'
```

**Step 4 の後に必ず変異検査を 1 回やる**（このテストが本当に欠陥の形を掴んでいるかの確認）: `buildTermsSettingsFormData` の `if (container === null) { ... }` ブロックを一時的に丸ごと削除して同じコマンドを走らせ、

```
expect(received).toBe(expected)
Expected: "kiyaku"
Received: null
```

で赤くなることを確認してから元に戻す。これが現行実装（`Object.entries(settingsFields)` が常に `[]` を返す）と同じ状態。

- [ ] **Step 3: 実装を直す**

**(a) 新規** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/terms-settings-form-data.ts`

```ts
import { collectFormDataFromContainer } from "./shared/collect-form-data";
import type { TermsSettingsFormState } from "./use-terms-editor";

/**
 * 規約設定フォームの FormData を組み立てる。
 *
 * `container` は設定ダイアログの `[data-settings-form-container]`
 * (SettingsDialog.tsx:252)。Radix Dialog は Portal / Content を
 * `present: forceMount || context.open` で包むので、open=false の間は
 * ダイアログごとアンマウントされ **container は null になりうる**。
 *
 * null のとき conform の fields を列挙して補うことはできない。`useForm` が
 * 返す fields は `form.getFieldset()` の戻り値 = `new Proxy({}, { get })` で
 * **ownKeys トラップを持たない**ため `Object.entries(fields)` は常に `[]` を
 * 返す。外部 state を持たない `slug` / `title` は呼び出し側の値から入れる。
 *
 * `type` / `scopes` / `changelog` / `isPublished` / `showInFooter` は hook 側の
 * 外部 state が SSoT なので、container の有無に関わらず最後に上書きする
 * (`form.update` が dirty 連動しないケースがあるため)。
 */
export function buildTermsSettingsFormData(
  container: HTMLElement | null,
  values: TermsSettingsFormState,
): FormData {
  const formData =
    container === null
      ? new FormData()
      : collectFormDataFromContainer(container);

  if (container === null) {
    formData.set("slug", values.slug);
    formData.set("title", values.title);
  }

  formData.set("type", values.type);
  formData.delete("scopes");
  for (const scope of values.scopes) {
    formData.append("scopes", scope);
  }
  formData.set("changelog", values.changelog);
  formData.set("isPublished", values.isPublished ? "on" : "");
  formData.set("showInFooter", values.showInFooter ? "on" : "");

  return formData;
}
```

`formData.append("scopes", scope)` を `String(scope)` で包まないのは、`generated/prisma/enums.ts:453-461` が `export const TermsScope = { ... } as const` と `export type TermsScope = (typeof TermsScope)[keyof typeof TermsScope]` を出しており、`TermsScope` が文字列リテラル union だから。`FormData.append(name, value: string)` にそのまま渡って型検査を通る（現行 `use-terms-editor.ts:217` の `String(s)` は不要な包み）。

`import type { TermsSettingsFormState } from "./use-terms-editor";` は**型のみ**なので Bun / TS が消す（実測: 同型の probe を repo 内で `bun` 実行し、`use-terms-editor` の runtime graph — server action → prisma → `"use client"` — を一切ロードせずに完了することを確認）。ランタイムの import 辺は `use-terms-editor → terms-settings-form-data` の 1 本だけで循環しない。`eslint.config.mjs` に `import-x/no-cycle` は入っていないので lint も通る。

**型をこちらへ移さない理由:** `__tests__/unit/architecture/db-enum-columns-are-not-string.test.ts:79` が
`src/.../hooks/use-terms-editor.ts::type` を「Terms.type は String 列」の恒久除外として path 付きで固定しており、同 gate は消えた entry を stale 検査で落とす。`TermsSettingsFormState`（`type: string` の唯一の宣言）を移すとこの entry が空振りして gate が赤くなる。新モジュール側にも `<enum 列名>: string` を一切書かないこと。

**(b) 変更** `use-terms-editor.ts:23` — import を差し替える（`collectFormDataFromContainer` はこのファイルから使わなくなるので必ず消す。残すと ESLint の未使用 import で `bun run validate` が落ちる）

```ts
// before
import { collectFormDataFromContainer } from "./shared/collect-form-data";
// after
import { buildTermsSettingsFormData } from "./terms-settings-form-data";
```

`collect-form-data.ts` 自体は消さない。`use-news-editor.ts:43` と `use-post-editor.ts:49` が今も import しているので orphan にはならない。

**(c) 変更** `use-terms-editor.ts:188-231` — `validateSettings` を丸ごと置き換える

```ts
const validateSettings = (): ParsedTermsSettingsFormData | null => {
  const settingsContainer = document.querySelector<HTMLElement>(
    `[data-settings-form-container="${settingsForm.id}"]`,
  );

  const formData = buildTermsSettingsFormData(settingsContainer, {
    type: typeValue,
    slug,
    title,
    isPublished: isPublishedValue,
    scopes: [...scopesValue],
    changelog: changelogValue,
    showInFooter: showInFooterValue,
  });

  const submission = parseWithZod(formData, {
    schema: termsSettingsFormSchema,
  });
  if (submission.status !== "success") {
    toast.error("入力内容に誤りがあります");
    return null;
  }
  return submission.value;
};
```

- `slug` / `title` は同ファイル 173-182 行で既に定義済みの const（`settingsSnapshot?.x ?? settingsFields.x.value`）。ヘッダー表示に使っている値と同じものを保存に使うことになる。宣言は `validateSettings`（188 行）より前なので TDZ にならない。
- `scopes` に `[...scopesValue]` を渡すのは、`scopesValue` が `readonly TermsScope[]`（122 行）で `TermsSettingsFormState["scopes"]` が `TermsScope[]` のため。同ファイル 254 行の `buildUpdateInput` と同じ書き方。
- `instanceof HTMLElement` の判定は落とした。`document.querySelector<HTMLElement>` の戻り値は `HTMLElement | null` で、null 判定だけで足りる。

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/components/editor/inline/terms-settings-form-data.test.ts`

期待: PASS（1 pass / 0 fail）

続けて Step 2 に書いた変異検査（`if (container === null)` ブロックの一時削除 → 赤 → 復元 → 緑）を 1 往復する。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

```bash
bun run test -- __tests__/unit/architecture/module-reachability.test.ts
bun run test -- __tests__/unit/architecture/db-enum-columns-are-not-string.test.ts
bun run test -- __tests__/unit/components/editor/inline/settings-dialog-structure.test.ts
bun run validate
```

期待: すべて PASS。

- `module-reachability` は 3 つの allowlist（`REACHABILITY_ALLOWLIST` / `TEST_ONLY_ALLOWLIST` / `SCRIPT_ONLY_ALLOWLIST`）がいずれも空。新モジュールは `use-terms-editor.ts` から import されているので到達可能。
- `db-enum-columns-are-not-string` は Step 3 (a) の注記どおり `use-terms-editor.ts::type` が生きたままであることの確認。
- `settings-dialog-structure` は `SettingsDialog.tsx` のソース文字列を読むだけなので今回の変更では壊れようがない。同ディレクトリの唯一の既存テストなので安価な smoke として通しておく。
- `bun run validate` は type-check + lint のみ（テストを含まない）。`collectFormDataFromContainer` の消し忘れと `scopes` の readonly 不整合はここで出る。
- tool timeout は 300 秒以上を取る。

- [ ] **Step 6: commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/terms-settings-form-data.ts" "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-terms-editor.ts" "__tests__/unit/components/editor/inline/terms-settings-form-data.test.ts"
git commit -m "fix(admin): 規約エディタで設定ダイアログ未マウント時に保存が失敗する問題を修正 [ai-gen]"
```

---

**このタスクでやらないこと**

- `use-news-editor.ts:219-230` / `use-post-editor.ts:258-267` の同型の死んだ fallback は**直さない**。今回の修正では自動的に直らない（3 ファイルとも自前の `validateSettings` を持ち、fallback の本体も三者三様。terms のみ boolean を `"on" | ""`、news は boolean 分岐 + 配列を `JSON.stringify`、post は boolean 分岐なし）。news / post は本文保存が別 action（`updateNewsBody` / `updatePostBody`）なので保存自体は生きており、壊れているのは edit モードの「プレビュー」だけ。症状も深刻度も違うので別タスクにする。
- E2E の追加はしない。`e2e/authenticated/admin/content-preview.spec.ts` の 4 ケース（:37 投稿 / :75 お知らせ / :111 規約 / :149 固定ページ）はいずれも冒頭で設定ダイアログを開いて保存しており、この経路を通らない。カバーを足すなら別 PR。

## 起案者が確認したと主張している事実

すべて現物を開いて確認した。監査の主張は**成立する**（棄却しない）。

**死んだフォールバック本体**

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/use-terms-editor.ts:188-231` が `validateSettings`。うち 197-210 が「container が取れないとき」の分岐で、198 行が `for (const [key, field] of Object.entries(settingsFields))`。
- 同 214-221 で `type` / `scopes` / `changelog` / `isPublished` / `showInFooter` を無条件に上書き。`slug` と `title` はここに含まれない → fallback が空なら欠落する。

**settingsFields が列挙できないこと（一次資料で確認）**

- `node_modules/@conform-to/react/dist/hooks.js:68` — `useForm` は `return [form, form.getFieldset()];`。
- `node_modules/@conform-to/react/dist/context.js:131-138` — `getFieldset` は `() => new Proxy({}, { get(target, key, receiver) {...} })`。ターゲットが空 `{}`、`get` トラップのみ、**`ownKeys` トラップ無し**。
- 実測: `bun -e "console.log(JSON.stringify(Object.entries(new Proxy({},{get(){return {value:'X'}}}))))"` → `[]`（監査の node での実測と一致）。
- @conform-to/react は `1.21.0`（`node_modules/@conform-to/react/package.json`）。

**コンテナが open=false でアンマウントされること**

- `.../editor/inline/SettingsDialog.tsx:252` — `<div data-settings-form-container={injected.form.id}>` はここ 1 箇所だけ（repo 全体 grep で src 側は他に無し）。
- `SettingsDialog.tsx:237-238` — `<Dialog open={open}>` → `<DialogContent>`（`forceMount` 無し）。
- `src/app/(admin)/admin/(dashboard)/_shared/components/ui/dialog.tsx:48-103` — `DialogContent` は `<DialogPortal>` 内に `<DialogPrimitive.Content>` を置くだけで `forceMount` を渡していない。
- `node_modules/@radix-ui/react-dialog/dist/index.js:139` (Portal) / `:178` (Content) — どちらも `Presence` を `present: forceMount || context.open` で包む。version 1.1.15。→ open=false ではコンテナは DOM に無い。

**parse が実際に落ちること（実測）**

- 現行 fallback の再現 → `status = error`、`{"slug":["Invalid input: expected string, received undefined"],"title":["Invalid input: expected string, received undefined"]}`。
- 修正後の形（slug/title を明示 set）→ `status = success`、`{"type":"terms-of-use","slug":"kiyaku","title":"利用規約","isPublished":true,"scopes":["RESERVATION"],"changelog":null,"showInFooter":true}`。
- `scopes` を 1 件も append しない場合も `status = success`（`scopes: []`）。`termsSettingsFormSchema` は `z.strictObject` だが 7 キーちょうどなので unknown key にならない。
- スキーマ本体: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/terms.ts:8-21`（`slug` / `title` とも `.trim().min(1)`）、`:54-75`。

**回避経路が塞がっていること**

- `SettingsDialog.tsx:302-308` — 設定「保存」ボタンは `disabled={isPending || !isDirty}`。
- `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx:227` — そこへ渡しているのは `isDirty={editor.isSettingsDirty}`。本文だけ編集した状態では false なので押せない → `settingsSnapshot` を立てられない。
- `use-terms-editor.ts:233-239` — `getSettingsDataForSubmit` は `!isSettingsDialogOpen && settingsSnapshot` のときだけ snapshot を返す。

**Cmd+S 経路**

- `TermsInlineEditor.tsx:168`（`onSave={editor.handleSave}`）→ `InlineEditorShell.tsx:49` の `useKeyboardShortcuts(onSave ? { onSave } : {});` → `editor.handleSave`。

**既存の検査**

- `__tests__` / `e2e` 全体を grep して `use-terms-editor` / `collect-form-data` / `settingsFields` / `TermsInlineEditor` を参照するテストは 0 本。
- `e2e/authenticated/admin/content-preview.spec.ts` は 4 ケース（:37 投稿 / :75 お知らせ / :111 規約 / :149 固定ページ）。規約ケース (:119-128) は `/admin/terms/new` を開いて設定ダイアログを開き「保存」を押す。`e2e/` 内で `admin/terms` に触るのはこの 1 行だけ。
- `__tests__/unit/components/editor/inline/settings-dialog-structure.test.ts` は `SettingsDialog.tsx` / `ui/tabs.tsx` のソース文字列を読むだけ。

**修正に効く周辺事実**

- `TermsSettingsFormState` は `use-terms-editor.ts:32-40` で export され、`.../content-types/terms.tsx:23` が type-only import している（他に consumer 無し）。
- `__tests__/unit/architecture/db-enum-columns-are-not-string.test.ts:79` が `use-terms-editor.ts::type` を恒久除外（`NOT_A_DB_COLUMN`）として path 付きで固定。同 gate は消えた entry を stale 検査で落とす。
- `scripts/test-runner-bunfig.ts` — `NO_DOM_DEFAULT_TREES = ["__tests__/unit/"]`、`DOM_REQUIRED_EXTENSIONS = [".test.tsx"]`、`DOM_REQUIRED_PREFIXES = ["__tests__/unit/components/editor/lexical/"]`、`DOM_REQUIRED_FILES = []`。
- `eslint.config.mjs` に `import-x/no-cycle` は無い（`import-x` は `no-anonymous-default-export` のみ）。
- `tsconfig.json:37-43` — `@/admin/*` → `./src/app/(admin)/admin/(dashboard)/_shared/*`。
- `TermsScope` は `@/shared/lib/validations/enums/prisma-types.ts:29-77` の値 re-export（`export { ... } from "@generated/prisma/enums"`）経由で**値として** import 可能（実行して `{"LOGIN_SIGNUP":...,"RESERVATION":...}` を確認）。
- Bun の未解決 module エラー文言は `error: Cannot find module '<spec>' from '<importer>'`（Bun v1.3.14 で実測。引用符はシングル）。

## 起案者が報告した訂正

監査の結論は正しい。ずれ・補足が 4 点。

1. **行番号の精度（軽微）** — 監査は「use-terms-editor.ts:197」を箇所として挙げているが、197 行は `if (!(settingsContainer instanceof HTMLElement)) {` のガード行で、死んだ `Object.entries(settingsFields)` は **198 行**。ブロックは 197-210、`validateSettings` 全体は 188-231。

2. **影響範囲が監査の記述より広い（重要）** — 監査は「本文の編集は DB に一切送られない」までしか書いていないが、edit モードで壊れるのは保存だけではない。`getSettingsDataForSubmit()` の呼び出しは `use-terms-editor.ts` 全体で 292 / 307 / 376 / 445 / 459 の **5 箇所**あり、内訳は次のとおり:
   - **edit モード（無言で壊れる 3 箇所）**
     - `:307` — `handleSave`（定義 :288）。ヘッダー「保存」/ Cmd+S
     - `:376` — `persistTermsWithPublishState`（定義 :371）→ `handlePublish`（:413）/ `handleUnpublish`（:417）。「公開」「下書きに戻す」
     - `:459` — `handlePreview`（定義 :443）の edit 分岐。「プレビュー」
   - **create モード（2 箇所、こちらは壊れていない）**
     - `:292`（`handleSave`）/ `:445`（`handlePreview`）。新規作成では slug / title が空なので parse 失敗が正しい挙動で、いずれも失敗時に `setIsSettingsDialogOpen(true)` で設定ダイアログを開く導線がある。
       edit モードの 3 箇所はいずれも `toast.error("入力内容に誤りがあります")` の後に `if (!settingsData) return;` で終わり、ダイアログを開く導線も無い。**設定を一度も保存していない管理者は、規約の公開・非公開の切り替えすらできない。** 今回の 1 箇所（`validateSettings`）の修正で 3 箇所とも直る（UI 上は 保存 / Cmd+S / プレビュー / 公開 / 下書きに戻す の 5 操作）。

3. **「同じ死んだフォールバック」は同一コードではない（計画に影響）** — 監査は news / post を「同じ死んだフォールバック」と表現しているが、3 者の fallback 本体は別物:
   - terms (`use-terms-editor.ts:200-208`): 配列 → `String(v)` を append / boolean → `"on"` か `""` / それ以外 → `String`
   - news (`use-news-editor.ts:222-228`): 配列 → `JSON.stringify` / boolean → true のときだけ `"on"` / それ以外 → `String`
   - post (`use-post-editor.ts:261-265`): 配列 → `JSON.stringify` / boolean 分岐**なし** / それ以外 → `String`
     よって共通 helper を 1 本作って 3 箇所に差すことはできず、terms の修正で news / post が自動的に直ることもない。監査の「別タスクに回すか、同一関数の修正で自動的に直るならその根拠を書く」への回答は **自動では直らない**。

4. **監査が提案した直し方は一部採らない** — 「各 hook が既に持つ `toSettingsFormData(terms)`（DB 由来の初期値）を FormData に流し込む」案に対し、本計画は `slug` / `title` を `use-terms-editor.ts:173-182` の既存 const（`settingsSnapshot?.x ?? settingsFields.x.value`）から取る。理由は (a) conform の `state.value` は初期値が `defaultValue` のシリアライズ結果（`node_modules/@conform-to/dom/dist/form.js:26` の `value: initialValue`）なので未操作なら `toSettingsFormData(terms)` と同値になり監査の要件を満たす、(b) ヘッダーが表示している値（`TermsInlineEditor.tsx:172` の `title={editor.title}`）と保存される値が一致する、(c) `toSettingsFormData` を新モジュールへ移すと `TermsSettingsFormState`（`type: string` の唯一の宣言）も一緒に動き、`db-enum-columns-are-not-string.test.ts:79` の path 固定 entry が stale になって gate が赤くなる。

---

### Task 2: 返金ポリシー推奨額を税込基準＋累積控除に直す（H-2 / M-g）

**深刻度:** high / **見積り:** 約 +160 / -55 行・6 ファイル

**なぜ:** 管理画面の「ポリシー推奨額」は税抜 `totalPrice` を基準にし、既存の返金累計も引いていない。Stripe への実 charge 額は税込 `totalPriceWithTax`（`payment-commands.ts:303`）、サーバー側の返金上限も税込（`payment-commands.ts:743`）なので、推奨額は常に残額未満に収まり、client 検査（`RefundDialog.tsx:128`）にもサーバー検査にも掛からず**無警告で税額分だけ少ない返金が確定する**（同じ予約を顧客がキャンセルすると `reservations/cancellation/steps.ts:50` 経由で税込全額が返り、金額が食い違う）。さらに累積を引かないため、部分返金済みの予約で「推奨額を使用」を押すとポリシーの取り分を超えて返しすぎる（自動返金側は `run-auto-refund-on-cancel.ts:186-192` で正しく差し引いており、管理 UI だけがこの取り決めから外れている）。

**Files:**

- Modify: `src/shared/domain/refund/policy.ts:106-140`
- Modify: `src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:13-17,172-193`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx:21,63-75`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx:48-61`（JSDoc のみ。値の誤りの発生源なので同じ PR で消す）
- Add: `src/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount.ts`
- Test: `__tests__/unit/admin/reservations/suggested-refund-amount.test.ts`

**Interfaces:**

- Consumes:
  - 最終形の `_lib` が `@/shared/domain/refund/policy` から取るのは `calculatePolicyRefundBreakdown` と `type RefundPolicyResolution` の **2 つだけ**（`calculateRefundAmount` / `type RefundPolicy` は Step 1 の中間形でしか使わない）
  - `getRefundPolicySettings(): Promise<{ resolution: RefundPolicyResolution; commerceUpdatedAt: Date }>`（`src/shared/domain/settings/admin-queries.ts:585`）
  - `type ReservationWithRelations`（`src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts:23-97`。`totalPriceWithTax: number | null` が 42 行、`totalPrice: number | null` が 31 行、`startTime: string` が 27 行、`refunds?: { amount: number }[]` が 96 行の **optional**）
- Produces:
  - `calculatePolicyRefundBreakdown(policy: RefundPolicy, chargeBase: number, refundedSoFar: number, startTime: Date, now: Date): PolicyRefundBreakdown`（`@/shared/domain/refund/policy`）
  - `type PolicyRefundBreakdown = { readonly entitlement: number; readonly outstanding: number }`
  - `calculateSuggestedRefundAmount(resolution, reservation, now): number | null` / `calculateSuggestedRefundAmountNow(resolution, reservation): number | null` / `type SuggestedRefundReservation`（`reservations/_lib/suggested-refund-amount`）
  - 削除: `calculateRefundAmountNow`（`policy.ts:134-140`。呼出元は `page.tsx:67` の 1 箇所のみ）

**採らなかった案:** 推奨額の計算を `page.tsx` に残したまま値だけ直す案。`page.tsx` は Server Component で、単体テストから呼ぶには `next/navigation` / `next/server` / 認可付き query を全部 mock する必要があり、「税込を基準に選ぶ」という欠陥の形をテストに入れられない。純関数に切り出して**どの列を基準にするかを関数の中に閉じ込める**。

- [ ] **Step 1: 失敗するテストを書く**

まず**振る舞いを変えずに**現行ロジックを `_lib` へ切り出す。これは「モジュールが無くて落ちる」ではなく「値が違って落ちる」赤にするための下準備で、Step 3 でこのロジックを直す。

新規 `src/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount.ts`:

```ts
/**
 * 管理画面の返金ダイアログに出す「ポリシー推奨額」の導出（pure function）。
 *
 * `now` を引数で受ける pure 版と `new Date()` を閉じ込めた `...Now` 版に分けるのは
 * `coupons/_lib/coupon-status.ts` と同じ理由（Server Component の render 中に
 * `new Date()` を直呼びしない）。
 */

import {
  calculateRefundAmount,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";

/** `ReservationWithRelations` のうち推奨額算出に要る部分だけ。 */
export type SuggestedRefundReservation = {
  readonly totalPrice: number | null;
  readonly totalPriceWithTax: number | null;
  readonly startTime: string;
  readonly refunds?: readonly { readonly amount: number }[];
};

/** ポリシー推奨額（円）。policy 未設定 / 破損なら null（ダイアログに出さない）。 */
export function calculateSuggestedRefundAmount(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
  now: Date,
): number | null {
  if (resolution.status !== "configured") {
    return null;
  }
  return calculateRefundAmount(
    resolution.policy,
    reservation.totalPrice ?? 0,
    new Date(reservation.startTime),
    now,
  );
}

/** `calculateSuggestedRefundAmount` の `now` を呼出時刻で確定する薄いラッパー。 */
export function calculateSuggestedRefundAmountNow(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
): number | null {
  return calculateSuggestedRefundAmount(resolution, reservation, new Date());
}
```

`src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx` の import 行 21 を差し替える:

```ts
// 削除: import { calculateRefundAmountNow } from "@/shared/domain/refund/policy";
import { calculateSuggestedRefundAmountNow } from "../_lib/suggested-refund-amount";
```

同ファイル 63-75 行（`const refundPolicyData = await getRefundPolicySettings();` から `      : null;` まで）を差し替える。`refundResolution` はこの範囲の外では使われていないので、変数ごと消えてよい:

```ts
const refundPolicyData = await getRefundPolicySettings();
const suggestedRefundAmount = calculateSuggestedRefundAmountNow(
  refundPolicyData.resolution,
  reservation,
);
```

`src/shared/domain/refund/policy.ts:126-140`（`calculateRefundAmountNow` と その JSDoc）を削除する。呼出元は上で消した `page.tsx:67` だけ。

新規 `__tests__/unit/admin/reservations/suggested-refund-amount.test.ts`:

```ts
/**
 * `reservations/_lib/suggested-refund-amount.ts` のテスト（pure function）。
 *
 * 第6次監査 H-2 / M-g:
 * - 基準は Stripe への実 charge 額と同じ税込 `totalPriceWithTax`
 *   （税抜 `totalPrice` ではない）
 * - 既存返金の累計を引く（ポリシーが決めるのは総額に対する取り分であって
 *   「今回いくら返すか」ではない）
 */

import { describe, expect, test } from "bun:test";
import { calculateSuggestedRefundAmount } from "@/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount";
import type { RefundPolicyResolution } from "@/shared/domain/refund/policy";

const NOW = new Date("2026-08-15T00:00:00.000Z");

// tier / default とも 100% なので、`now` と `startTime` の関係に依存せず常に 100%。
const FULL_REFUND_POLICY: RefundPolicyResolution = {
  status: "configured",
  policy: {
    tiers: [{ hoursBefore: 0, refundRate: 100 }],
    defaultRefundRate: 100,
  },
};

// hourlyPrice 5000 × 2h、税率 10% → totalPrice 10000 / totalPriceWithTax 11000。
// 税抜の値をあえて残しておく。基準列を取り違えたら 7000 になって落ちる。
// object literal を直接渡すと余剰プロパティ検査に掛かるので const 経由で渡す。
const RESERVATION = {
  totalPrice: 10000,
  totalPriceWithTax: 11000,
  startTime: "2026-09-01T01:00:00.000Z",
  refunds: [{ amount: 1000 }, { amount: 2000 }],
};

describe("calculateSuggestedRefundAmount", () => {
  test("税込 totalPriceWithTax を基準に、既存返金の累計を引いた額を返す", () => {
    // 100% ポリシー・既返金 3000 → 11000 - 3000 = 8000。
    // この 1 つの期待値が「税抜基準なら 7000」「累計を引かなければ 11000」の
    // 両方を同時に棄却する。
    expect(
      calculateSuggestedRefundAmount(FULL_REFUND_POLICY, RESERVATION, NOW),
    ).toBe(8000);
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/admin/reservations/suggested-refund-amount.test.ts`

期待: FAIL。切り出した現行ロジックは税抜 10000 をそのまま返し、累積 3000 も引かないため:

```
error: expect(received).toBe(expected)

Expected: 8000
Received: 10000
```

- [ ] **Step 3: 実装を直す**

**(a) `src/shared/domain/refund/policy.ts`** — `calculateRefundAmount` の JSDoc（110 行）が税抜を指しているのを直し、その下（旧 `calculateRefundAmountNow` があった位置）に共通 SSoT を足す:

```ts
/**
 * Reservation の返金額を算出する。
 *
 * @param policy         RefundPolicy
 * @param chargedAmount  実 charge 額 (checkout で Stripe に送った額、税込
 *                       `Reservation.totalPriceWithTax` 相当)
 * @param startTime      対象予約の `startTime`
 * @param now            算出時点
 * @returns 返金額 (円、正整数)。`chargedAmount * rate / 100` を `Math.floor` で切り捨て
 *          (over-refund 防止、小数点円は日本円で扱わない)
 */
export function calculateRefundAmount(
  policy: RefundPolicy,
  chargedAmount: number,
  startTime: Date,
  now: Date,
): number {
  const rate = calculateRefundRate(policy, startTime, now);
  return Math.floor((chargedAmount * rate) / 100);
}

/** `calculatePolicyRefundBreakdown` の結果。 */
export type PolicyRefundBreakdown = {
  /** ポリシーが認める **charge 総額に対する取り分**（円）。 */
  readonly entitlement: number;
  /** `entitlement - refundedSoFar`（円）。0 未満は 0 に丸める。 */
  readonly outstanding: number;
};

/**
 * ポリシーの取り分と「今回返す額」を算出する。
 * 自動返金と管理画面の推奨額はこの 1 箇所を共有する。
 *
 * ポリシーが決めるのは **総額に対する取り分**であって「今回いくら返すか」では
 * ない（監査 F-43）。既存の部分返金を引かずに請求すると:
 *
 * - 100% ポリシー: 総額 10000 / 既返金 3000 に対して 10000 を請求
 *   → 残額 7000 を超えるので `resolveRefundAmount` が reject
 *   → **キャンセル分の返金が 1 円も走らない**（顧客は手動対応まで回復しない）
 * - 50% ポリシー: 5000 を請求して通り、累計 8000（80%）
 *   → ポリシーの 50% を超えて返しすぎる
 *
 * なお **chargeBase から引くのは誤り**。50% ポリシーで残額 7000 に 50% を
 * 当てると 3500 になり、累計 6500（65%）でどちらの数字とも合わない。
 *
 * @param chargeBase    実 charge 額（税込 `totalPriceWithTax` / `paidAmount`）
 * @param refundedSoFar 既に返金済みの累計額（円）
 */
export function calculatePolicyRefundBreakdown(
  policy: RefundPolicy,
  chargeBase: number,
  refundedSoFar: number,
  startTime: Date,
  now: Date,
): PolicyRefundBreakdown {
  const entitlement = calculateRefundAmount(policy, chargeBase, startTime, now);
  return {
    entitlement,
    outstanding: Math.max(0, entitlement - refundedSoFar),
  };
}
```

**(b) `src/shared/domain/cancellation/run-auto-refund-on-cancel.ts`** — 13-17 行の import を差し替える:

```ts
import {
  calculatePolicyRefundBreakdown,
  resolveRefundPolicy,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";
```

172-193 行を差し替える（説明は policy.ts の JSDoc へ移した）:

```ts
let refundAmount: number | undefined;
let policyEntitlement: number | undefined;
if (resolution.status === "configured" && chargeBase !== null) {
  // 取り分（entitlement）と今回返す額（outstanding）の算出は
  // `calculatePolicyRefundBreakdown` が SSoT。管理画面の推奨額も同じ関数を使う。
  const breakdown = calculatePolicyRefundBreakdown(
    resolution.policy,
    chargeBase,
    refundedSoFar,
    startTime,
    new Date(),
  );
  policyEntitlement = breakdown.entitlement;
  refundAmount = breakdown.outstanding;
}
// status === "unset" → refundAmount 未指定のまま残額全額自動返金
```

`outstanding` は 0 で下げ止まるが、直後の `if (refundAmount !== undefined && refundAmount <= 0)`（現 196 行）は負数でも 0 でも同じ枝に入り、skip 理由の判定も `policyEntitlement === 0`（現 200-202 行）を見ているだけなので、自動返金側の振る舞いは変わらない。

**(c) `src/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount.ts`** — Step 1 で置いた中身を全面的に置き換える:

```ts
/**
 * 管理画面の返金ダイアログに出す「ポリシー推奨額」の導出（pure function）。
 *
 * 2 つの基準を呼出側に選ばせない:
 *
 * 1. **基準は税込 `totalPriceWithTax`。** Stripe への実 charge 額がこれで、
 *    `refundReservationPaymentCommand` の返金上限も同じ列を使う。税抜
 *    `totalPrice` を基準にすると税額分だけ少ない額が推奨され、残額を超えないため
 *    client / server どちらの検査にも掛からず無警告で確定する。
 * 2. **既存の返金累計を引く。** ポリシーが決めるのは総額に対する取り分であって
 *    「今回いくら返すか」ではない。自動返金と同じ
 *    `calculatePolicyRefundBreakdown` を使う。
 *
 * `now` を引数で受ける pure 版と `new Date()` を閉じ込めた `...Now` 版に分けるのは
 * `coupons/_lib/coupon-status.ts` と同じ理由（Server Component の render 中に
 * `new Date()` を直呼びしない）。
 */

import {
  calculatePolicyRefundBreakdown,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";

/** `ReservationWithRelations` のうち推奨額算出に要る部分だけ。 */
export type SuggestedRefundReservation = {
  readonly totalPriceWithTax: number | null;
  readonly startTime: string;
  readonly refunds?: readonly { readonly amount: number }[];
};

/** ポリシー推奨額（円）。policy 未設定 / 破損なら null（ダイアログに出さない）。 */
export function calculateSuggestedRefundAmount(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
  now: Date,
): number | null {
  if (resolution.status !== "configured") {
    return null;
  }
  const refundedSoFar = (reservation.refunds ?? []).reduce(
    (sum, refund) => sum + refund.amount,
    0,
  );
  return calculatePolicyRefundBreakdown(
    resolution.policy,
    reservation.totalPriceWithTax ?? 0,
    refundedSoFar,
    new Date(reservation.startTime),
    now,
  ).outstanding;
}

/** `calculateSuggestedRefundAmount` の `now` を呼出時刻で確定する薄いラッパー。 */
export function calculateSuggestedRefundAmountNow(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
): number | null {
  return calculateSuggestedRefundAmount(resolution, reservation, new Date());
}
```

**(d)** `SuggestedRefundReservation` から `totalPrice` が消えるので、テストの `RESERVATION` は型注釈なしの const のままにしておく（余剰プロパティ検査は fresh な object literal にしか掛からないため、`totalPrice: 10000` を残したまま通る）。**この行は消さない** — 税抜の値が手元にあってもそれを選ばないことがこのテストの主張。

**(e) `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx`** — 48-61 行の `refundableTotal` の JSDoc を差し替える。**この誤ったコメントが H-2 の発生源**で、値だけ直して残すと次に触る人が同じ誤りを再生産する。現行は「サーバー側の権威ある返金上限（`refundReservationPaymentCommand`）は Stripe への実 charge 額である税抜 `totalPrice` を基準にしている」と書いているが、`payment-commands.ts:743` は `chargeTotal: reservation.totalPriceWithTax`、`:303` の Checkout `unit_amount` も `totalPriceWithTax` で、記述は事実に反する。

差し替え後（`readonly refundableTotal: number;` の行はそのまま残す）:

```ts
/**
 * 返金上限の基準額（実際に課金された額。金額 input の placeholder + 超過
 * client validation に使う）。
 *
 * 呼出元は常に **Stripe への実 charge 額** を渡す — reservation なら税込
 * `totalPriceWithTax`（`refundReservationPaymentCommand` が
 * `resolveRefundAmount` に渡す `chargeTotal` と同じ列）、events なら
 * 税込 / 税抜の区別を持たない `paidAmount`。プロパティ名が「税込」を
 * 含意しないのは events 側と共用するため。
 */
```

コメントのみの変更で、`RefundDialog` の props も実装も振る舞いも変えない。

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/admin/reservations/suggested-refund-amount.test.ts`
期待: PASS（1 pass, 0 fail）

- [ ] **Step 5: 周辺が壊れていないことを確認する**

```bash
bun run test -- __tests__/unit/shared/domain/refund/policy.test.ts
bun run test -- __tests__/unit/shared/domain/cancellation/run-auto-refund-on-cancel.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture
bun run test:db:migrate && bun run test -- __tests__/integration/domain/reservations/cancellation-with-refund-policy.test.ts
bun run validate
```

期待: すべて PASS。特に見るもの:

- `policy.test.ts` は 19 pass / 0 fail（変更前に実測済のベースライン）。`calculateRefundAmount` の振る舞いは変えていないので同数のまま通る
- `run-auto-refund-on-cancel.test.ts` は **10 pass / 0 fail / 23 expect()**（変更前に実測済）。`outstanding` 導入の影響を受ける位置は 102 行（`amount: 3000`）/ 124 行（`policyEntitlement: 2500` の skip）/ 186 行（`policyEntitlement: 0` の skip）/ 217 行（`amount: 5000`）の 4 本で、いずれも期待値は変わらない
- `module-reachability.test.ts`（新規 `_lib` が `[id]/page.tsx` から到達すること。allowlist は空なので、配線し忘れるとここで落ちる）
- `bun run validate` は type-check と lint のみでテストを含まない。`scripts/type-check.ts` は `tsconfig.test.json` も回すので、新規テストの型もここで見る

**`__tests__/unit/components/admin/reservation-detail.test.tsx` は走らせなくてよい。** この変更は `ReservationDetail.tsx` を一切触らず（`suggestedRefundAmount: number | null` の prop 型も不変）、当該テストの関連箇所は 234 行の `suggestedRefundAmount={null}` だけで、壊れる経路が無い。同様に `refund-dialog.test.tsx` も (e) が JSDoc のみの変更なので対象外（どちらも `bun scripts/run-tests.ts __tests__/unit` の全件では当然走る）。

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/refund/policy.ts \
        src/shared/domain/cancellation/run-auto-refund-on-cancel.ts \
        "src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx" \
        "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx" \
        "src/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount.ts" \
        __tests__/unit/admin/reservations/suggested-refund-amount.test.ts
git commit -m "fix(admin): base refund suggestion on tax-inclusive total minus refunded [ai-gen]"
```

---

## 起案者が確認したと主張している事実

**H-2（税抜基準）— 成立**

- `src/shared/domain/reservations/payment-commands.ts:303` — Stripe Checkout の `unit_amount` は `toStripeUnitAmount(authoritative.totalPriceWithTax, currency)`。実 charge 額は**税込**。
- `src/shared/domain/reservations/payment-commands.ts:743` — サーバー権威の返金上限は `chargeTotal: reservation.totalPriceWithTax`。**税込**。
- `src/shared/domain/payment/stripe-refund-orchestration.ts:67,81,94` — `remaining = chargeTotal - cumulativeSoFar`、`amount > remaining` で reject、`willBeFullyRefunded: newCumulative === chargeTotal`。税込 11000 に対し 10000 を返すと全額扱いにならず `PARTIALLY_REFUNDED` のまま残る（監査の記述どおり）。
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx:67-74` — 推奨額は `calculateRefundAmountNow(refundResolution.policy, Number(reservation.totalPrice ?? 0), new Date(reservation.startTime))`。**税抜**。
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx:692` — `refundableTotal={Number(reservation.totalPriceWithTax ?? 0)}`。**税込**。同じ画面で基準が食い違っている。
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/RefundDialog.tsx:85,128-131` — `remaining = Math.max(0, refundableTotal - cumulativeRefunded)`、`if (parsed > remaining)` のみ。10000 は 11000 未満なので素通り。
- `src/shared/domain/reservations/cancellation/steps.ts:50` — 顧客経由は `chargeBase: reservation.totalPriceWithTax ?? reservation.totalPrice ?? null`。**税込**。管理者経由と食い違うのは事実。
- `prisma/schema.prisma:867,891,892` — `totalPrice Int`（割引後・税抜）／`taxAmount Int`／`totalPriceWithTax Int`（税込合計）。税率 10%・totalPrice 10000 なら totalPriceWithTax 11000。

**M-g（累積を引かない）— 成立**

- `page.tsx:65-75` — `calculateRefundAmountNow` の戻り値をそのまま `suggestedRefundAmount` にしており、`reservation.refunds` を一切見ていない。
- `RefundDialog.tsx:174-193` — 「合計 / 累積返金額 / 残額」を出す `<p>` の直下に「ポリシー推奨額」を並べて描画、「推奨額を使用」は `setAmountStr(String(suggestedAmount))`。どちらの意味かの区別は画面上に無い。
- `src/shared/domain/cancellation/run-auto-refund-on-cancel.ts:174-192` — コメント「ポリシーが決めるのは**総額に対する取り分**であって『今回いくら返すか』ではない（監査 F-43）」があり、`policyEntitlement = calculateRefundAmount(...)` / `refundAmount = policyEntitlement - refundedSoFar`。行番号は監査の記述どおり。
- `ReservationDetail.tsx:695-698` — `cumulativeRefunded={(reservation.refunds ?? []).reduce((sum, r) => sum + r.amount, 0)}`。監査が示した「同じ reduce」は実在。

**既存の検査が無いことの確認**

- `__tests__/unit/components/admin/refund-dialog.test.tsx:237-238, 277-278, 310-311` — `suggestedAmount` を渡す 3 本はいずれも `cumulativeRefunded={0}`。監査の「3 本」は正確。
- `__tests__/unit/shared/domain/cancellation/run-auto-refund-on-cancel.test.ts:102-143` — F-43 の回帰テストは自動返金側にしか無い。
- `grep` の結果、`calculateRefundAmountNow` の呼出元は `page.tsx:67` の 1 箇所のみ（`src/` `__tests__/` `e2e/` `scripts/` 全走査）。

**SSoT 共有の可否（実物で確認）**

- `run-auto-refund-on-cancel.ts` の当該ロジックは巨大な async orchestration（prisma 読取・logError・通知・`executeRefund` コールバック）の内側にあり、そのままでは Server Component の render から呼べない（呼ぶと実際に返金が走る）。**共有できるのは算術部分だけ。**
- 算術を `policy.ts` に `calculatePolicyRefundBreakdown` として出し、`outstanding` を `Math.max(0, ...)` で 0 に丸めても自動返金の振る舞いは変わらない。直後の判定は `refundAmount <= 0`（`run-auto-refund-on-cancel.ts:196`）で、負数と 0 は同じ枝に入り、skip 理由は `policyEntitlement === 0`（同 200-202）で決まるため。
- **`run-auto-refund-on-cancel.test.ts` は 10 テスト**（実測: `10 pass / 0 fail / 23 expect() calls`。当初計画の「8 テスト」は誤り）。うち `outstanding` 導入の影響を受ける 4 本（`amount: 3000` / `policyEntitlement: 2500` / `policyEntitlement: 0` / `amount: 5000`）はすべてそのまま通る。
- `run-auto-refund-on-cancel.test.ts` は `@/shared/db/prisma` / `notifications/commands` / `errors/server` を `mock.module` するが `@/shared/domain/refund/policy` は mock していないので、import を 1 本足しても部分 mock は壊れない。

**型の確認（実装に直結）**

- `src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts:23-97` の `ReservationWithRelations`: `totalPrice: number | null`（31）、`totalPriceWithTax: number | null`（42）、`startTime: string`（27）、`refunds?: { amount: number }[]`（96、**optional**）。`getReservationById` は `Promise<ReservationWithRelations | null>`（129）。
- `tsconfig.json` は `exactOptionalPropertyTypes: true` / `verbatimModuleSyntax: true`。`refunds?: { amount: number }[]`（optional・可変配列）を `readonly refunds?: readonly { readonly amount: number }[]` に渡すのは、どちらも `| undefined` を含まない optional なので代入可。
- `__tests__` は `tsconfig.json` の `exclude` だが `tsconfig.test.json` で**型検査対象**（`scripts/type-check.ts:55`）。テストの fixture は余剰プロパティ検査を避けるため const 経由で渡す必要がある。
- `getRefundPolicySettings`（`src/shared/domain/settings/admin-queries.ts:585-592`）は `{ resolution: resolveRefundPolicy(...), commerceUpdatedAt }` を返す。

**先例と配置**

- `src/app/(admin)/admin/(dashboard)/coupons/_lib/coupon-status.ts` — pure 版 `getCouponStatus(coupon, now)` と `new Date()` を閉じた `deriveCouponStatusesNow` の 2 段構え。テストは `__tests__/unit/admin/coupons/coupon-status.test.ts` から `@/app/(admin)/admin/(dashboard)/coupons/_lib/coupon-status` を import。今回はこれを踏襲する。**実測で緑**（15 pass / 0 fail）なので、`@/app/(admin)/…` alias 形と `_lib` 配置はどちらも実績がある。
- `__tests__` から `[id]` を含むパスを import している例は 0 件。ブラケット入りパスの解決を賭けないため、新規 `_lib` は `reservations/[id]/_lib/` ではなく **`reservations/_lib/`** に置く（`page.tsx` からは `../_lib/suggested-refund-amount`）。
- `_lib` を名指しする architecture gate も ESLint ルールも 0 件。`page.tsx` からの相対 import は `__tests__/helpers/architecture-fs.ts` の `resolveToExistingFile`（`<base>` → `.ts` → `.tsx` → `/index.ts` → `/index.tsx`）で解決するので `module-reachability` のグラフに載る。
- 新規テストは `.ts` かつ `__tests__/unit/` 配下なので `scripts/test-runner-bunfig.ts` の DOM 抜き既定で動く（`DOM_REQUIRED_EXTENSIONS` は `.test.tsx` のみ、`DOM_REQUIRED_PREFIXES` は lexical ツリーのみ）。`policy.ts` 冒頭の `import "server-only";` は `policy.test.ts` が現に緑なので runner 上で問題にならない。
- ベースライン確認: `bun run test -- __tests__/unit/shared/domain/refund/policy.test.ts` → 19 pass / 0 fail（実行済み）。

---

## 起案者が報告した訂正

機序は監査の記述どおりで、棄却する点は無い。ただし記述の不正確さと、監査が触れていない重要な点が 4 つある。

1. **パス誤り。** 監査は「cancellation/steps.ts:50」と書いているが、`src/shared/domain/cancellation/` に `steps.ts` は無い（同ディレクトリにあるのは `run-auto-refund-on-cancel.ts` のみ）。実体は `src/shared/domain/reservations/cancellation/steps.ts:50`。内容（`chargeBase: reservation.totalPriceWithTax ?? reservation.totalPrice ?? null`）は一致。

2. **監査が触れていない誤りの発生源。** `page.tsx:68-70` に「Round-5 audit Finding #20 と同じ理由: 返金上限の基準は Stripe への実 charge 額 = 税抜 totalPrice」というコメントがあり、`RefundDialog.tsx:52-60` の JSDoc にも「サーバー側の権威ある返金上限（`refundReservationPaymentCommand`）は Stripe への実 charge 額である税抜 `totalPrice` を基準にしている」と書かれている。**この 2 つのコメントは現行コードと矛盾している** — `payment-commands.ts:303` の Checkout も `:743` の `chargeTotal` も `totalPriceWithTax`。H-2 はこの誤ったコメントが残っていることが原因なので、値を直すだけでなくコメントも消さないと再発する。**page.tsx 側は Step 1 の 63-75 行差し替えで巻き込まれて消えるが、RefundDialog.tsx 側は自動では消えない**ので、Step 3 (e) として明示的に手順化した（Files 一覧と Step 6 の `git add` にも追加済み）。

3. **同じ誤りが policy.ts の JSDoc にもある。** `src/shared/domain/refund/policy.ts:110` の `@param chargedAmount 実 charge 額 (checkout で Stripe に送った額、`Reservation.totalPrice` 相当)` も税抜を指している。1 行の doc 修正として同じ PR に含めた（同一の誤った前提なので分割しない）。

4. **行番号の細かいずれ。** 監査の「RefundDialog.tsx:128」はクライアント検査の `if (parsed > remaining)` そのものの行で正確だが、判定に使う `remaining` の定義は同ファイル 85 行。「run-auto-refund-on-cancel.ts:186-192 / 174-185」はいずれも現在のファイルと一致（ずれ無し）。「ReservationDetail.tsx:692 / 695-698」も一致。「page.tsx:67-72」は正確には 65-75 行（`const suggestedRefundAmount =` から閉じ括弧まで）。

---

### Task 3: 個人区分の顧客を保存すると会社名が null 上書きされる

**深刻度:** medium / **見積り:** 約 140 行（実装 +12 / -5 行 + テスト 126 行）・2 ファイル

**なぜ:** `CustomerEditForm.tsx:351` の `{customerType === CustomerType.CORPORATE && (...)}` により、PERSONAL の顧客を開くと `name="companyName"` を持つ要素が DOM に 1 つも存在しない。conform は DOM ベースで submit するため FormData にキーが載らず、`customerFormSchema` の `.optional().or(z.literal(""))` が `undefined` として通り、`commands.ts:69` の `companyName: data.companyName || null` が `null` を書く。エラーも警告も出ず「顧客情報を更新しました」トーストが出る。管理画面の予約作成で新規顧客を作ると `resolve-customer.ts:87-88` が `companyName` と `customerType: PERSONAL` を同時に書くため、この形の行は既定で生まれる。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx:141-148,350-370`
- Test: `__tests__/unit/components/admin/customer-edit-form-company-name-preserved.test.tsx`

**Interfaces:**

- Consumes: `CustomerEditForm`（named export / `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx:60`）、`fields.companyName.name`（conform `FieldMetadata`）、`customer.companyName: string | null`（`CustomerWithReservations` / `src/shared/domain/customers/types.ts:17,73`）、`CustomerType.CORPORATE`（`@/shared/lib/validations/enums/prisma-types`）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

新規ファイル `__tests__/unit/components/admin/customer-edit-form-company-name-preserved.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("next/navigation", () => ({
  // module graph 上の admin セッション検証が notFound を named import する。
  // mock に無いと `Export named 'notFound' not found` で module load ごと落ちる。
  notFound: mock(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: mock(),
  useRouter: () => ({ push: mock(), refresh: mock() }),
}));

mock.module("sonner", () => ({
  toast: { error: mock(), success: mock() },
}));

mock.module("@/admin/actions/customer", () => ({
  updateCustomer: mock(() => Promise.resolve({})),
}));

type UiProps = { children?: ReactNode; [key: string]: unknown };

mock.module("@/admin/components/ui", () => ({
  Button: ({ children, ...props }: UiProps) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: UiProps) => <div>{children}</div>,
  Input: (props: UiProps) => <input {...props} />,
  Label: ({ children, ...props }: UiProps) => (
    <label {...props}>{children}</label>
  ),
  Select: ({ children }: UiProps) => <div>{children}</div>,
  SelectContent: ({ children }: UiProps) => <div>{children}</div>,
  SelectItem: ({ children }: UiProps) => <div>{children}</div>,
  SelectTrigger: ({ children }: UiProps) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SubmitButton: ({ label }: { label?: string }) => (
    <button type="submit">{label}</button>
  ),
  Switch: ({ checked, id }: { checked?: boolean; id?: string }) => (
    <button type="button" id={id} data-checked={String(checked)} />
  ),
  Textarea: (props: UiProps) => <textarea {...props} />,
}));

const { CustomerEditForm } =
  await import("@/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm");

/**
 * 管理画面の予約作成で新規顧客を作ると customerType は PERSONAL 既定のまま
 * companyName だけが埋まる（resolve-customer.ts:87-88）。この形の行が編集画面を
 * 素通りしても会社名を失わないことを固定する。
 */
const PERSONAL_CUSTOMER_WITH_COMPANY = {
  id: "3f0b6c3e-6d4f-4a9d-8c0a-91d2f6f0a111",
  lastName: "山田",
  firstName: "太郎",
  lastNameKana: "ヤマダ",
  firstNameKana: "タロウ",
  companyName: "株式会社ミルラ",
  customerType: "PERSONAL",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  building: null,
  status: "NEW",
  notes: null,
  totalReservations: 0,
  totalSpent: null,
  lastReservationAt: null,
  firstReservationAt: null,
  isActive: true,
  marketingOptIn: false,
  phoneContactOptIn: true,
  userId: null,
  flaggedForReviewAt: null,
  flagReasons: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  reservations: [],
} as never;

describe("CustomerEditForm", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = window.document.createElement("div");
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test("PERSONAL の顧客を編集しても companyName が FormData に 1 件だけ載る", async () => {
    await act(async () => {
      root?.render(
        <CustomerEditForm customer={PERSONAL_CUSTOMER_WITH_COMPANY} />,
      );
    });

    const formElement = container?.querySelector("form");
    // Bun の global FormData は JSDOM の form 要素を読めず常に空になる。
    // JSDOM 側の FormData を使うこと（setup-dom.ts は window を globalThis に載せる）。
    const formData = new window.FormData(formElement as HTMLFormElement);

    expect(formData.getAll("companyName")).toEqual(["株式会社ミルラ"]);
  });
});
```

補足（触らないこと）:

- `as never` は `__tests__` が `tsconfig.json:57` の exclude 対象・型付き lint 対象外・`as` を数える gate の走査対象外（`type-safety-cast-and-cache-tag-drift.test.ts:20,51,59` が `src/` だけを見る）なので規約違反にならない。同ディレクトリの `merge-customer-dialog.test.tsx:91` に同じ先例がある。
- `notFound` を mock から抜くと本当に `SyntaxError: Export named 'notFound' not found in module '...node_modules\next\navigation.js'` で module load ごと落ちる（検証済み）。短くしないこと。
- `.test.tsx` は `scripts/test-runner-bunfig.ts:73` の `DOM_REQUIRED_EXTENSIONS` により自動で JSDOM 付きで起動するので、bunfig の設定は不要。

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/components/admin/customer-edit-form-company-name-preserved.test.tsx`

期待: FAIL。実測済みの出力:

```
error: expect(received).toEqual(expected)

- [
-   "株式会社ミルラ",
- ]
+ []
```

（`companyName` 以外の 15 キー — `customerType,lastName,firstName,lastNameKana,firstNameKana,email,phoneNumber,postalCode,prefecture,city,streetAddress,building,marketingOptIn,phoneContactOptIn,notes` — は載っており、`companyName` だけが欠落している。）

- [ ] **Step 3: 実装を直す**

`src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx:350-370` を、`&&` から三項に変えて else 側に hidden input を置く。**hidden input を条件ブロックの外に出してはいけない** — CORPORATE のとき可視 Input と二重に `name="companyName"` が載り、conform の `getSubmissionContext`（`node_modules/@conform-to/dom/dist/submission.mjs:31-41`）が配列に畳んで zod が `{ companyName: ["Invalid input"] }` で弾く（実測）。

変更前:

```tsx
{
  /* 会社名・団体名（法人時のみ表示） */
}
{
  customerType === CustomerType.CORPORATE && (
    <div className="space-y-2">
      <Label htmlFor={fields.companyName.id}>
        会社名・団体名 <span className="text-destructive">*</span>
      </Label>
      <Input
        {...getInputProps(fields.companyName, { type: "text" })}
        placeholder="株式会社〇〇"
        disabled={isPending}
      />
      {fields.companyName.errors && (
        <p id={fields.companyName.errorId} className="text-xs text-destructive">
          {fields.companyName.errors.join(", ")}
        </p>
      )}
    </div>
  );
}
```

変更後:

```tsx
{
  /* 会社名・団体名（法人時のみ表示） */
}
{
  customerType === CustomerType.CORPORATE ? (
    <div className="space-y-2">
      <Label htmlFor={fields.companyName.id}>
        会社名・団体名 <span className="text-destructive">*</span>
      </Label>
      <Input
        {...getInputProps(fields.companyName, { type: "text" })}
        placeholder="株式会社〇〇"
        disabled={isPending}
      />
      {fields.companyName.errors && (
        <p id={fields.companyName.errorId} className="text-xs text-destructive">
          {fields.companyName.errors.join(", ")}
        </p>
      )}
    </div>
  ) : (
    // 個人区分では入力欄を出さないが、name を DOM から完全に消すと
    // FormData にキーが載らず、schema の optional を素通りして
    // `data.companyName || null` が既存値を null で上書きする。
    // 可視 Input と同時に出すと FormData にキーが 2 つ載り conform が
    // 配列化して弾くため、必ず else 側にだけ置く。
    <input
      type="hidden"
      name={fields.companyName.name}
      value={customer.companyName ?? ""}
    />
  );
}
```

あわせて `CustomerEditForm.tsx:144-147` の空の `if` を消す。中身が無いのに「法人 → 個人切替時に会社名をクリア」と書いてあり、上の修正（切替後も会社名を保持する）と真逆の説明になっている。

変更前:

```tsx
function handleCustomerTypeChange(value: string) {
  if (!isValidCustomerType(value)) return;
  customerTypeControl.change(value);
  if (value === CustomerType.PERSONAL) {
    // 法人 → 個人切替時に会社名をクリア (conform は field の reset API がないため
    // hidden な form の re-render はしない、submit 時は schema で空文字許容)
  }
}
```

変更後:

```tsx
function handleCustomerTypeChange(value: string) {
  if (!isValidCustomerType(value)) return;
  customerTypeControl.change(value);
}
```

（削除後も `CustomerType` は `:351` の `CustomerType.CORPORATE` で使われ続けるので、import は残す。実測で lint / type-check とも green。）

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/components/admin/customer-edit-form-company-name-preserved.test.tsx`

期待: PASS（実測済み: `1 pass 0 fail`、FormData のキー列に `companyName` が入り値は `["株式会社ミルラ"]`）

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行:

```bash
bun run lint:files -- "src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx"
bun run test -- __tests__/unit/architecture/conform-form-pattern.test.ts
bun run test -- __tests__/unit/architecture/admin-field-error-association.test.ts
bun run validate
```

期待: すべて PASS（4 本とも実測済み — lint は exit 0 / 出力なし、`conform-form-pattern` が 6 pass、`admin-field-error-association` が 2 pass、`type-check` は 93.9s で完走）。

この 4 本を選ぶ理由:

- 上の 2 つの gate は静的に `.tsx` を再帰収集して `CustomerEditForm.tsx` を**実際に読む**、この変更の射程内にある唯一の検査。`conform-form-pattern.test.ts` は `src/app` 配下全 `.tsx` を走査し（`:44` の `APP_ROOT`、`:140` の `collectTsxFiles`）、`NON_TEXT_INPUT_TYPE`（`:126`）で `type="hidden"` を非テキスト扱いする判定を今回の追加要素が直接踏む。`admin-field-error-association.test.ts` は `src/app/(admin)/admin/(dashboard)` 配下全 `.tsx` を走査し（`:6-13`）、`fields.X.errors` ブロックと `errorId` / `aria-describedby` の対応を見るので、会社名の error 段落を条件式ごと動かす今回の変更が対象になる。
- `__tests__/unit/lib/validations/customer.test.ts` と `__tests__/unit/components/admin/merge-customer-dialog.test.tsx` は**走らせない**。前者は `customerFormSchema` のテストだがスキーマは 1 文字も変えない。後者が render するのは `customers/[id]/_components/MergeCustomerDialog.tsx` で `CustomerEditForm` を import していない（`grep -rl "CustomerEditForm" __tests__ e2e` は 0 hit）。どちらもこの変更では壊れようがない。

- [ ] **Step 6: commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx" "__tests__/unit/components/admin/customer-edit-form-company-name-preserved.test.tsx"
git commit -m "fix(admin): keep companyName when saving a PERSONAL customer [ai-gen]"
```

---

## 起案者が確認したと主張している事実（検証官が全件を現物で再確認済み）

- `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx:350-370` — 会社名ブロック全体が `{customerType === CustomerType.CORPORATE && (...)}` の中（コメントが `:350`、条件式が `:351`、閉じが `:370`）。`companyName` に紐づく DOM 要素はこの 1 つだけ（同ファイル内の `companyName` 出現箇所は 97, 353, 357, 361, 363, 366 行のみ）。
- 同ファイル `:213-217`（customerType）、`:489-493`（prefecture）、`:583-587`（marketingOptIn）、`:610-614`（phoneContactOptIn）に素の `<input type="hidden" name={fields.X.name} value={...} />` があり、いずれも `useInputControl` と併用。`companyName` には `useInputControl` も hidden input も無い（`:111-115` に control は 5 本、companyName は含まれない）。
- `node_modules/@conform-to/react/dist/integrations.mjs:244-254` — `useInputControl` は「その name の要素が form に無く、かつ value が undefined でない」ときだけ dummy select を作る（条件は `:252-254`）。`companyName` は `useInputControl` を呼んでいないので何も作られない。既存 4 本の hidden input は dummy 生成を抑止している側。
- `src/shared/lib/validations/customer.ts:35-40` — `companyName: z.string().trim().max(100).optional().or(z.literal(""))`。キー欠落は `undefined` として成功する。`customerFormSchema` には法人必須 refine は付いていない（`requireCompanyNameForCorporate` は `src/shared/lib/validations/customer-type.ts:20` で定義され、使用先は `customer-profile.ts:64` / `inquiry.ts:54` / `public-reservation.ts:84` の 3 箇所のみ）。
- `src/shared/domain/customers/commands.ts:63-83` `toCustomerData()`、うち **:69 `companyName: data.companyName || null`**。`createCustomer`（宣言 `:85`、`toCustomerData` 呼出 `:93`）と `updateCustomerCommand`（`:244-250` の `tx.customer.update({ data: { ...toCustomerData(data), ... } })`、spread は `:247`）の両方が通る。
- `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:139-224` `updateCustomer` は `executeConformMutation(formData, customerFormSchema, ...)` → `updateCustomerCommand(id, data)`（`:155`）。エラー分岐なし、成功で `CustomerEditForm.tsx:173-178` の `toast.success("顧客情報を更新しました")` に到達する。
- `src/shared/domain/reservations/resolve-customer.ts:87-88` — `companyName: data.companyName || null` と `customerType: data.customerType ?? CustomerType.PERSONAL` を同一 `create` で書く。監査の行番号どおり。
- `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:72-101` `newCustomerObjectSchema` に `customerType` フィールドは無い（`lastName` / `firstName` / `companyName` / `email` / `phoneNumber` の 5 本のみ）。→「PERSONAL かつ companyName 非 null」は管理画面の予約作成だけで生まれる。
- 既存の検査は 0 件: `grep -rl "CustomerEditForm" __tests__ e2e` が 0 hit。
- **実測（一時テストを作って実行し、確認後に削除）**: 現行コードで PERSONAL 顧客を render すると FormData のキーは `customerType,lastName,firstName,lastNameKana,firstNameKana,email,phoneNumber,postalCode,prefecture,city,streetAddress,building,marketingOptIn,phoneContactOptIn,notes` の 15 本で、`companyName` だけが欠落（`getAll("companyName")` が `[]`）。
- **実測**: Step 3 の修正（else 側にだけ hidden input）を当てると `companyName` が 16 番目のキーとして載り `["株式会社ミルラ"]` になり、CORPORATE で render しても `["株式会社ミルラ"]`（重複しない）。テストは PASS。
- **実測**: hidden input を条件の外に出す（監査の指示どおりの形）と CORPORATE で `["株式会社ミルラ","株式会社ミルラ"]` になる。
- **実測**: 重複したキーを `parseWithZod(fd, { schema: customerFormSchema })` に通すと `{"status":"error","error":{"companyName":["Invalid input"]}}`。機序は `node_modules/@conform-to/dom/dist/submission.mjs:31-41`（同名 2 件目以降を配列に畳む `setPathValue`）。
- テスト環境の注意（実測）: Bun の global `FormData` は JSDOM の `<form>` を読めず常に空になる。`__tests__/setup-dom.ts:46-50` が JSDOM の `window` を globalThis に載せる（`window` キーの出所は `src/shared/lib/lexical-headless-dom-environment.ts:82`）ので `new window.FormData(formElement)` を使う。`.test.tsx` は `scripts/test-runner-bunfig.ts:73` の `DOM_REQUIRED_EXTENSIONS` により自動で DOM 付きで起動する。
- テスト環境の注意（実測）: `mock.module("next/navigation", ...)` に `notFound` を含めないと `SyntaxError: Export named 'notFound' not found` で module load ごと落ちる（`__tests__/unit/components/admin/event-registration-table.test.tsx:14-21` と同じ）。検証官も `notFound` 抜きの probe で同じエラーを再現した。
- `@/admin/components/ui` の mock 12 件（Button / Card / Input / Label / Select / SelectContent / SelectItem / SelectTrigger / SelectValue / SubmitButton / Switch / Textarea）はすべて `src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts` に実在する named export。
- 検証後、`src/.../CustomerEditForm.tsx` は元に戻し一時テストは削除済み。`git diff --stat -- <同ファイル>` が空（実装は無変更）。

## 起案者が報告した訂正

監査の中核（機序・影響・無言で成功する点）は**すべて正しい**。ただし 3 点訂正がある。

1. **監査が提案した直し方は、そのまま実装すると CORPORATE の保存を全滅させる。** 監査は「条件ブロックの**外側**に `<input type="hidden" name={fields.companyName.name} value={companyNameValue} />` を置き、CORPORATE のときだけ可視 Input を出す」と書いているが、CORPORATE では hidden と可視の両方が `name="companyName"` を持つため FormData にキーが 2 件載る。`node_modules/@conform-to/dom/dist/submission.mjs:31-41` の `getSubmissionContext` が 2 件目以降を配列に畳むので、`customerFormSchema` の `z.string()` が拒否し `{"status":"error","error":{"companyName":["Invalid input"]}}` を返す（実測）。**hidden input は else 側にだけ置くこと。** 監査自身が「可視 Input と hidden input が同時に存在すると FormData にキーが 2 つ載る」と注意しているのに、提示した修正例がその形になっている。

2. **`reservation-form-schema.ts:71-99` は行番号が 1〜2 行ずれている。** `newCustomerObjectSchema` の実体は `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:72-101`。主張（`customerType` フィールドを持たない）は正しい。他の名指し（`CustomerEditForm.tsx:351`、`commands.ts:69`、`resolve-customer.ts:87-88`）は現行ファイルと一致。

3. **「conform は defaultValue に対して hidden input を自動生成しない」は結論として正しいが、理由づけが不正確。** conform の `useInputControl` は「その name の要素が form に見つからず、かつ value が undefined でない」場合に dummy select を自動生成する（`node_modules/@conform-to/react/dist/integrations.mjs:252-254`）。生成されないのは `companyName` が `useInputControl` を一切通していないから。既存 4 本の hidden input は「自動生成が無いから手で書いた」のではなく「手で書いてあるから dummy 生成が起きない」という関係にある。次のエンジニアが `useInputControl(fields.companyName)` を足す誘惑にかられうるので明記する（採らない案）。

追加で見つけたもの（監査に記載なし）: `CustomerEditForm.tsx:144-147` に空の `if (value === CustomerType.PERSONAL) { /* 法人 → 個人切替時に会社名をクリア */ }` がある。中身が無く何も起きない死んだブロックで、コメントは今回の修正（切替後も会社名を保持する）と真逆の説明をしている。Step 3 で削除する。

## 検証官の訂正

1. **Step 5 の 2 コマンドを差し替えた。** 元案の `__tests__/unit/lib/validations/customer.test.ts`（スキーマ無変更なので無影響）と `__tests__/unit/components/admin/merge-customer-dialog.test.tsx`（別コンポーネント `customers/[id]/_components/MergeCustomerDialog.tsx` を render しており `CustomerEditForm` を import していない）は、どちらもこの修正では壊れようがない。代わりに `CustomerEditForm.tsx` を実際に読む静的 gate 2 本（`conform-form-pattern.test.ts` / `admin-field-error-association.test.ts`）を指定した。理由は Step 5 内に併記済み。
2. **`commands.ts` の 2 つの行番号を「宣言」の位置に直した。** `createCustomer` は `:85`（`toCustomerData` 呼出が `:93`）、`updateCustomerCommand` の `tx.customer.update` は `:244-250`（spread が `:247`）。主張の内容は正しい。`requireCompanyNameForCorporate` の定義元（`customer-type.ts:20`）と `public-reservation.ts:84` の行番号も補った。
3. **見積りを実測値に直した。** テストは 126 行、実装は +12 / -5 行。

**振る舞いに関する注意（実装者向け・変更ではない）:** この修正後、CORPORATE の顧客を UI 上で PERSONAL に切り替えて保存しても、hidden input が `customer.companyName`（サーバーから来た元の値）を送るため会社名は**保持される**。削除する空の `if` のコメントが謳っていた「切替時にクリア」とは逆の挙動になるが、それが本タスクの意図（無言の null 上書きを止める）である。会社名を消したい運用が出てきたら別タスクで扱うこと。

---

### Task 4: CONFLICT 後に楽観ロック token だけが新しくなるのを止める

**深刻度:** medium / **見積り:** 約 160 行・2 ファイル

**なぜ:** `BusinessHoursSection` は編集値を mount 時の `useState` 初期化子で凍結する一方、送信時の `expectedUpdatedAt` だけを `settings` prop から読んでいる。CONFLICT で `router.refresh()` を呼ぶと RSC が取り直されて prop の `organizationUpdatedAt` だけが新しくなる（`useState` 初期化子は再実行されず、このファイルに `useEffect` も remount も無い）。その状態でもう一度保存すると「mount 時の入力 + 新しい token」で CAS が成立し、他の管理者の変更が無言で消える。楽観ロックが防ぐはずの消失が、そのロックの復旧経路によって必ず通る。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx:104-111`（token 凍結の `useState` を追加）
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx:340`（prop 直読みをやめる）
- Test: `__tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx`（新規。ディレクトリ `__tests__/unit/app/admin/settings/` も新規）

**Interfaces:**

- Consumes:
  - `useState`（`react`。既に 3 行目で import 済み）
  - `settings: Serialized<SettingsData>` の `organizationUpdatedAt`（`Serialized` により `Date` → `string`。SSoT は `src/shared/domain/settings/types.ts:55`）
  - `updateBusinessHoursSettings(data): Promise<MutationResult>`（`@/admin/actions/settings` 経由。実体は `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/business.ts:136`）
  - `isMutationError`（`src/shared/lib/mutation-result.ts`）
  - `DEFAULT_BUSINESS_HOURS_WEEK`（`@/shared/lib/business-hours`。月〜土 09:00–21:00 / 日曜休業で `validateSlots` を通る）
  - `installJSDOMForTests`（`__tests__/setup-dom.ts`）
- Produces: なし（追加するのはコンポーネント内部のローカル変数 `expectedUpdatedAt` のみ。export しない）

**採らなかった案:** 親から `key={String(settings.organizationUpdatedAt)}` を付けて remount する案（監査の候補 (b)）は採らない。`organizationUpdatedAt` は**自分の保存が成功したときにも変わる**ので、成功時にも subtree を丸ごと捨てることになり、「成功したときだけ状態が壊れる」別のバグを作る。

---

- [ ] **Step 1: 失敗するテストを書く**

新規ファイル `__tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx`:

```tsx
/**
 * @description CONFLICT 後の router.refresh() が CAS token だけを差し替える回帰テスト。
 *
 * 編集中の値は mount 時の useState 初期化子で凍結される。一方 submit 時に
 * `settings.organizationUpdatedAt` を prop から直接読んでいたため、CONFLICT で
 * `router.refresh()` を呼ぶと「mount 時の入力 + 新しい token」で再送でき、
 * 2 回目の保存で CAS が成立して他の管理者の変更を上書きしていた。
 *
 * ここで固定するのは「refresh で settings prop が新しくなっても、送る
 * expectedUpdatedAt は mount 時のまま」であること。
 *
 * `@/admin/actions/settings` は 40 近い export を持つが、ここでは
 * `updateBusinessHoursSettings` 1 つだけを返す部分 mock で足りる。
 * このテストの module graph でこの barrel を **値** import しているのは
 * BusinessHoursSection.tsx:27 の 1 本だけで、`business-hours-defaults.ts:1` と
 * `business-hours-validation.ts:1` は `import type`（`verbatimModuleSyntax: true`
 * で消える）だから。値 import が増えたらこの mock も増やすこと。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installJSDOMForTests } from "../../../../setup-dom";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import type { MutationResult } from "@/shared/lib/mutation-result";
import type { Serialized } from "@/shared/lib/serialize";
import type { SettingsData } from "@/shared/domain/settings/types";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

mock.module("sonner", () => ({
  toast: { success: mock(() => undefined), error: mock(() => undefined) },
  Toaster: () => null,
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock(() => undefined) }),
}));

type SavePayload = { expectedUpdatedAt: string };

const CONFLICT_RESULT: MutationResult = {
  error: "他のユーザーにより更新されています。ページを再読み込みしてください",
  code: "CONFLICT",
};

const mockUpdate = mock((_payload: SavePayload): Promise<MutationResult> =>
  Promise.resolve(CONFLICT_RESULT),
);

mock.module("@/admin/actions/settings", () => ({
  updateBusinessHoursSettings: mockUpdate,
}));

type StubChildren = { children?: ReactNode };

// Radix (Select / Switch) を jsdom で動かさないための最小スタブ。
// refund-dialog.test.tsx / faq-item-template-select.test.tsx と同型。
mock.module("@/admin/components/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: StubChildren & { onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: StubChildren) => <div>{children}</div>,
  CardContent: ({ children }: StubChildren) => <div>{children}</div>,
  CardDescription: ({ children }: StubChildren) => <p>{children}</p>,
  CardHeader: ({ children }: StubChildren) => <div>{children}</div>,
  CardTitle: ({ children }: StubChildren) => <h2>{children}</h2>,
  Input: ({
    value,
    onChange,
    disabled,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
  }) => (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
  Label: ({ children }: StubChildren) => <label>{children}</label>,
  Select: ({ children }: StubChildren) => <div>{children}</div>,
  SelectContent: ({ children }: StubChildren) => <div>{children}</div>,
  SelectItem: ({ children }: StubChildren) => <div>{children}</div>,
  SelectTrigger: ({ children }: StubChildren) => <div>{children}</div>,
  SelectValue: () => <span />,
  SubmitButton: ({
    isPending,
    label,
    onClick,
    disabled,
  }: {
    isPending: boolean;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={isPending || disabled}>
      {label}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
  Textarea: ({
    value,
    onChange,
    disabled,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    disabled?: boolean;
  }) => (
    <textarea
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    />
  ),
}));

const { BusinessHoursSection } =
  await import("@/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection");

const MOUNT_UPDATED_AT = "2026-08-15T08:00:00.000Z";
const REFRESHED_UPDATED_AT = "2026-08-15T09:00:00.000Z";

/**
 * BusinessHoursSection が読む settings の列は businessHours / holidayNotice /
 * organizationUpdatedAt の 3 つだけ。Serialized<SettingsData> の全列 (180 超) を
 * 書き起こしても本題が埋まるだけなので、必要な 3 列だけ持つオブジェクトを
 * prop 型に合わせる（このテスト専用の cast）。
 */
function buildSettings(
  organizationUpdatedAt: string,
): Serialized<SettingsData> {
  return {
    businessHours: DEFAULT_BUSINESS_HOURS_WEEK,
    holidayNotice: null,
    organizationUpdatedAt,
  } as unknown as Serialized<SettingsData>;
}

describe("BusinessHoursSection の楽観ロック token", () => {
  let container: HTMLDivElement;
  let root: Root;

  function findSaveButton(): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "営業時間設定を保存",
    );
  }

  beforeEach(() => {
    installJSDOMForTests();
    mockUpdate.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("CONFLICT 後に settings prop が新しくなっても、再送する expectedUpdatedAt は mount 時のまま", async () => {
    await act(async () => {
      root.render(
        <BusinessHoursSection
          settings={buildSettings(MOUNT_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    // CONFLICT を受けた router.refresh() で RSC が取り直され、新しい
    // organizationUpdatedAt が prop で届いた状態を再現する。
    // 同じ位置・同じ型なので client state (businessHours / holidayNotice) は保持される。
    await act(async () => {
      root.render(
        <BusinessHoursSection
          settings={buildSettings(REFRESHED_UPDATED_AT)}
          readOnly={false}
        />,
      );
    });

    await act(async () => {
      findSaveButton()?.click();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0].expectedUpdatedAt).toBe(
      MOUNT_UPDATED_AT,
    );
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx`

期待: FAIL。最後の assertion で

```
expect(received).toBe(expected)

Expected: "2026-08-15T08:00:00.000Z"
Received: "2026-08-15T09:00:00.000Z"
```

（`expect(mockUpdate).toHaveBeenCalledTimes(2)` は現行コードでも通る — サマリは `0 pass / 1 fail / 2 expect() calls` になり、落ちるのは 2 本目だけ。ここが `1` で落ちた場合は token の問題ではなくテスト側の配線ミス — 2 回目のクリックが `isPending` で無効化されている — なので区別できる。）

- [ ] **Step 3: 実装を直す**

`src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx:104-111` を次にする（`const isDisabled = ...` の直後に、コメント込み 6 行を挿入）:

```tsx
const router = useRouter();
const [isPending, startTransition] = useTransition();
const isDisabled = isSettingsFormDisabled(isPending, readOnly);

// 楽観ロックの CAS token。編集内容は下の useState 初期化子で mount 時に凍結
// されるので、token も同じ時点で凍結する。submit 時に prop を読むと、
// CONFLICT → router.refresh() で prop だけが新しくなったとき
// 「mount 時の入力 + 新しい token」で CAS が通り、他人の変更を上書きする。
const [expectedUpdatedAt] = useState(settings.organizationUpdatedAt);

const initialBusinessHours = settings.businessHours ?? DEFAULT_BUSINESS_HOURS;

const [businessHours, setBusinessHours] =
  useState<BusinessHours>(initialBusinessHours);
```

同ファイル 340 行目（`handleSave` 内）を次にする:

```tsx
    startTransition(async () => {
      const result = await updateBusinessHoursSettings({
        businessHours: {
          ...businessHours,
          monthlyClosures: monthlyClosures.length > 0 ? monthlyClosures : [],
        },
        holidayNotice: holidayNotice || null,
        expectedUpdatedAt,
      });
```

`router.refresh()` は CONFLICT 分岐（346 行目）にも成功分岐（350 行目）にも**残す**。token を凍結した後の refresh は無害で、かつ Radix Tabs が非アクティブタブの children を描画しない（`present && children`）ため、タブを切り替えて戻せば remount されて新しいデータ + 新しい token で再開できる復旧経路になる。

**この変更が持ち込むトレードオフ（意図的に受け入れる）:** `SettingsOrganization.updatedAt` は保存成功のたびに進むので、token を mount 時に凍結すると「保存 → そのまま続けてもう一度保存」の 2 回目が偽の CONFLICT になる（トーストが出て `router.refresh()` が走る）。これは新しい欠陥ではなく、conform を使う 4 セクション（ReservationSection / TaxSection / LayoutSection / BusinessInfoSection）が hidden input の `defaultValue` で既に取っている挙動に**揃う**方向の変更。復旧はタブ切替（= remount）で済む。連続保存を成功させたいなら、成功時に返ってきた新しい `updatedAt` で token を更新する設計が要るが、それは Server Action の戻り値を変える別タスク。

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx`

期待: PASS（`1 pass, 0 fail`）

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行（tool timeout は 300 秒以上を取る）:

```bash
bun run format -- "src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx" "__tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx"
bun run lint:files -- "src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx"
bun run validate
bun scripts/run-tests.ts __tests__/unit/architecture
bun run test -- __tests__/unit/domain/settings/commands.test.ts
```

期待: すべて PASS。

- `lint:files` — `react-hooks/*`（React Compiler ルール込み）が新しい `useState` を通すこと。成功時は出力なしで exit 0。**テストファイルは渡さない**（`__tests__/**` は ESLint 対象外なので無意味）。
- `bun run validate` — type-check（`tsconfig.test.json` が `__tests__/**` を含むので新規テストも型検査される）と lint。type-check だけで約 105 秒かかり、内部で `prisma generate` が走る。
- `__tests__/unit/architecture` — pre-push が同じディレクトリ指定で走らせる gate 群。191 ファイル・約 9 秒。
- `commands.test.ts` — `updateBusinessHoursSettings`（domain 側 CAS）の既存テスト 55 本。今回 domain は触らないので緑のままであることの確認。

- [ ] **Step 6: commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx" "__tests__/unit/app/admin/settings/business-hours-conflict-token.test.tsx"
git commit -m "fix(settings): freeze business hours optimistic-lock token at mount [ai-gen]"
```

---

**この PR でやらないこと（別タスク候補）:**

- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx:85-93 / 233 / 236-239` — 同型（state は mount 時凍結、`expectedUpdatedAt: settings.sidebarUpdatedAt` は submit 時に prop 直読み、CONFLICT で `router.refresh()`）。別コンポーネント・別 CAS 対象（`sidebarUpdatedAt`）なので 1 PR = 1 論理変更に従って分ける。`isDirty`（108-115 行の IIFE）は local state と**新しい** prop を比較するため、消失が起きる条件下では必ず true になり、ガードとして機能しない。
- `src/app/(admin)/admin/(dashboard)/settings/_components/BusinessInfoSection.tsx:78 / 82-98` — conform 経路。`defaultValue.expectedUpdatedAt`（78 行）に prop を渡し、`useEffect`（82-98 行）の中で成功時（85 行）と CONFLICT 時（95 行）の両方で `router.refresh()` を呼ぶ。conform の `defaultValue` は mount 時のみ採用される（`id` 固定）という理解では安全だが、**実測していない**。監査対象外だったので、必要なら別途この 1 点だけを確認するタスクにする。

---

### Task 5: 一斉配信で 1 通も送れていないときに成功を返さない

**深刻度:** medium / **見積り:** 約 70 行・3 ファイル

**なぜ:** `broadcastEventAction` は `sendEventBroadcast` の戻り値から `sent` / `skipped` だけを取り出し `ok` を捨てて `{ ok: true }` を返す。RESEND_API_KEY 未設定（`RESEND_API_KEY: z.string().optional()`、`requiredInProd` にも無いのでデプロイ直後の本番で正当に起きる）だと `lib-dispatch.ts:255` が `{ ok:false, sent:0 }` を返すが、action は成功として `submission.reply({resetForm:true})` を返し、`BroadcastForm.tsx:59-63` が「一斉配信メールを送信しました」の toast を出して件名・本文を捨てる。参加者には 1 通も届かず、再送の手掛かりも残らない。`ok` を見るだけでは足りない — `event-emails.ts:983` は fan-out 後に無条件で `ok: true` を返すため、キー設定済みで全通失敗のときも同じ嘘になる。

**採らなかった案:** `!sendResult.ok` を無条件に失敗とする案は採らない。宛先が 0 件のときまで「メール送信が無効です」だけを出すことになり、かつ RESEND_API_KEY の有無で同じ E2E の結果が変わる（CI は設定済み・ローカルは未設定）。判定は `sent` 件数に一本化し、`ok` は原因のメッセージ出し分けにだけ使う。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts:32-34`（JSDoc の実行順序 — 項目 5 と 6 の 3 行だけ）と `:73-86`（`execute` の中身。`sendEventBroadcast` 呼び出しの直後に検査を挿入）
- Modify: `e2e/authenticated/admin/events-broadcast.spec.ts:1-9, 83, 95-96`（コメントと test 名のみ。実装と食い違っている記述を正す）
- Test: `__tests__/unit/actions/event-broadcast.test.ts`（末尾の `describe("broadcastEventAction")` 内に 1 本追加）

**Interfaces:**

- Consumes: `sendEventBroadcast(payload, params): Promise<EventBroadcastResult>`（`EventBroadcastResult = { ok: boolean; sent: number; skipped: number }`、`src/shared/lib/email/event-emails.ts:877-883`）／ `getEventBroadcastPayload(eventId): Promise<EventBroadcastPayload | null>`（`recipients: ReadonlyArray<{id, email, customerId}>`、`src/shared/lib/email/types.ts:160-171`）／ `DomainError(message, code)`（`src/shared/domain/domain-error.ts:10-18`、`"VALIDATION"` は既存 code）／ `executeAdminMutationResult`（`src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts:156-162` が `DomainError` を `{error, code}` に変換）／ `executeConformMutation`（handler が `{ok:false, error}` を返すと `submission.reply({formErrors:[error]})`）
- Produces: なし（新しい export は無い）

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/actions/event-broadcast.test.ts` の 267 行目 `  });`（最後の test の閉じ）と 268 行目 `});`（describe の閉じ）の間に追加する。

```ts
test("宛先があるのに 1 通も送れなかったら成功にしない (Resend 未設定)", async () => {
  mockGetEventBroadcastPayload.mockResolvedValue({
    eventId: VALID_EVENT_ID,
    title: "Test Event",
    slug: "test-event",
    recipients: [
      { id: "reg-1", email: "sato@example.com", customerId: "cus-1" },
    ],
    skipped: 0,
    customerIdByEmail: new Map(),
  });
  // lib-dispatch は transport 無効 (RESEND_API_KEY 未設定) で ok:false / sent:0 を返す
  mockSendEventBroadcast.mockResolvedValue({
    ok: false,
    sent: 0,
    skipped: 0,
  });
  mockExecuteAdminMutationResult.mockImplementation(async (options) => {
    try {
      return await options.execute();
    } catch (error) {
      if (isDomainError(error)) {
        return { error: error.message, code: error.code };
      }
      throw error;
    }
  });

  const result = await broadcastEventAction(
    VALID_EVENT_ID,
    undefined,
    buildFormData("件名", "本文"),
  );

  // reply({resetForm:true}) の成功 shape ({initialValue: null}) ではなく、
  // formErrors 付きの error shape が返る
  expect(result).toMatchObject({
    status: "error",
    error: {
      "": [
        "メール送信が無効です。連携設定（/admin/settings/integrations?tab=resend）で Resend API キーを設定するか、環境変数 RESEND_API_KEY を設定してください。",
      ],
    },
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/actions/event-broadcast.test.ts`

期待: FAIL 1 本。`expect(received).toMatchObject(expected)` が
`- Expected: { status: "error", error: {"": [...]} }` に対し
`+ Received: { initialValue: null, ... }`（`submission.reply({resetForm:true})` の成功 shape。`status` を持たない）を返して落ちる。**他の 11 本は PASS**（このファイルは追加前の時点で 11 本 / 実測 `11 pass 0 fail`。`describe("event-broadcast Zod schema")` に 5 本、`describe("broadcastEventAction")` に 6 本）。

- [ ] **Step 3: 実装を直す**

`src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts`。まず JSDoc の実行順序を差し替える。

**置き換えるのは 32-34 行の 3 行だけ**（32 = 項目 5 の 1 行、33-34 = 項目 6 の 2 行）。29-31 行は項目 4 の本体（`checkActionRateLimit …` から `アカウントが共有バケットを焼ける` まで）、35 行は ` *` の空行なので、**どちらも消さない**。

```ts
 *   5. `sendEventBroadcast` を呼んで参加者全員に fan-out
 *   6. 送信結果を検査する。**宛先が 1 件以上あるのに `sent === 0` なら成功にしない**
 *      — `DomainError` を投げてフォーム上部にエラーを出し、件名 / 本文を残す
 *   7. 成功時は `submission.reply()` (resetForm) を返す — 呼出側は `initialValue`
 *      null で success を検出する
```

次に `execute` の中身（現 73-86 行。73 = `const broadcastNonce = randomUUID();`、83-86 = `return { sent: …, skipped: … };`）を次にする。`sendEventBroadcast(...)` の呼び出しと `return { sent, skipped }` の間に検査を挟むだけで、import の追加は不要（`DomainError` は 13 行目で既に import 済み）。インデントは 10 スペース（既存と同じ）。

```ts
const broadcastNonce = randomUUID();
const payload = await getEventBroadcastPayload(validId);
if (!payload) {
  throw new DomainError("対象イベントが見つかりません", "NOT_FOUND");
}
const sendResult = await sendEventBroadcast(payload, {
  subject: data.subject,
  body: data.body,
  broadcastNonce,
});
// 送るべき相手が居たのに 1 通も送れていないなら成功にしない。
// sendEventBroadcast (src/shared/lib/email/event-emails.ts) は fan-out 後に
// 無条件で ok:true を返すので、ok だけを見ると「全通失敗」も成功になる。
// 判定は sent 件数に一本化し、原因 (transport 無効 / 送信失敗) は
// メッセージで出し分ける。transport 無効の文面は sendTemplateTestAction の
// disabled 分岐と同じ契約に揃える。DomainError は
// executeAdminMutationResult が MutationError に変換し、
// executeConformMutation が formErrors に載せるので、resetForm を通らず
// 件名 / 本文が保持される。
if (payload.recipients.length > 0 && sendResult.sent === 0) {
  throw new DomainError(
    sendResult.ok
      ? "一斉配信メールを 1 通も送信できませんでした。時間をおいて再度お試しください。"
      : "メール送信が無効です。連携設定（/admin/settings/integrations?tab=resend）で Resend API キーを設定するか、環境変数 RESEND_API_KEY を設定してください。",
    "VALIDATION",
  );
}
return {
  sent: sendResult.sent,
  skipped: sendResult.skipped,
};
```

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/actions/event-broadcast.test.ts`

期待: PASS（**12 本すべて** — 追加前 11 本 + 新規 1 本）。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

E2E `e2e/authenticated/admin/events-broadcast.spec.ts:83-103` は**この修正では落ちない**。理由は現物で確認済み: seed は `marketingOptIn` を一度も設定せず（`grep -rn marketingOptIn prisma/` は `schema.prisma:1042` の宣言 1 行のみ、既定は `false`）、`getEventBroadcastPayload`（`src/shared/domain/events/email-queries.ts:204-221`）が `marketingOptIn: true` の Customer に紐づく申込しか recipients に入れないため、seed イベントの `recipients.length` は常に 0。よって新しい条件 `payload.recipients.length > 0` に掛からない。なお送信ボタンが押せるのは `BroadcastForm.tsx:67` の `disabled = eligibleCount === 0` が別クエリ（`registration-queries.ts:174-195`、seed の CONFIRMED 2 件）を見ているため。

ただし spec の冒頭コメント（1-9 行）・test 名（83 行）・95-96 行のコメントは「E2E 環境は API キーが無いので disabled」と書いていて事実と違う（`.github/workflows/ci.yml:598` が admin surface の E2E step に `RESEND_API_KEY` を渡している）。主張を正す。

1-9 行:

```ts
/**
 * Admin event broadcast composer (T12) smoke E2E
 *
 * 主に UI 表示 (件名 / 本文フィールド、対象人数、送信ボタン) の smoke と、
 * seed 由来 event の詳細から 一斉配信 リンクで遷移できることを確認する。
 * 実際のメール送信は Resend を叩かない。CI の E2E step は RESEND_API_KEY に
 * プレースホルダを入れるので transport 自体は有効だが、seed の Customer は
 * marketingOptIn が既定の false のままで getEventBroadcastPayload の recipients が
 * 0 件になり、sendEventBroadcast は fan-out する前に {ok:true, sent:0} を返す。
 * 宛先 0 件なので action の「宛先があるのに sent:0 なら失敗」判定には掛からず、
 * form reset が成立する。
 */
```

83 行の test 名（同じ誤りを主張しているので併せて正す。この文字列は repo 内でこの 1 箇所にしか無い）:

```ts
  test("件名と本文を入力して送信すると成功 toast が表示される (配信対象 0 名なので sent:0 でも成功扱い)", async ({
    page,
  }) => {
```

95-96 行:

```ts
// 成功 toast (sonner)。上記のとおり配信対象が 0 件で sent:0 のまま成功扱いに
// なる経路（宛先が 1 件以上あって sent:0 なら action はエラーを返す）。
await expect(page.getByText("一斉配信メールを送信しました")).toBeVisible({
  timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
});
```

実行:

```bash
bun run test -- __tests__/unit/actions/event-broadcast.test.ts
bun run test -- __tests__/unit/architecture/e2e-global-state-restore.test.ts
bun run lint:files -- "src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts"
bun run format -- "src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts" __tests__/unit/actions/event-broadcast.test.ts e2e/authenticated/admin/events-broadcast.spec.ts
bun run validate
```

期待: すべて PASS。

- `e2e-global-state-restore.test.ts` は 87-88 行で `events-broadcast.spec.ts` を直列化 allowlist（key はファイルパス）に持つので、spec を触ったら通す。
- `format` を入れるのは、`bun run validate`（type-check + lint）が **prettier を検査しない**ため。`eslint.config.mjs:584` の `eslint-config-prettier` は競合ルールを無効化するだけで整形はしない。追加した三項演算子の整形差分は CI の `lint-format` でしか出ず、そこで初めて赤になる。**引数なしの `bun run format` はリポジトリ全体を書き換えるので、必ず上記の 3 パスを渡す**（`scripts/prettier.ts:26-38` が引数を prettier の targets に流す）。

- [ ] **Step 6: commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts" __tests__/unit/actions/event-broadcast.test.ts e2e/authenticated/admin/events-broadcast.spec.ts
git commit -m "fix(admin): イベント一斉配信で1通も送れないとき成功を返さない [ai-gen]"
```

---

### Task 6: 顧客一括メール — Resend 未設定を「全員配信停止済み」と偽らず失敗として返す

**深刻度:** medium / **見積り:** 約 50 行・4 ファイル

**なぜ:** `resolveEmailSendContext()` が null（Resend API キー未設定）のとき `sendCustomerBroadcast` は `{ ok: false, sent: 0, excluded: customerIds.length }` を返すが、`bulk.ts` が `ok` を捨てて `{sent, excluded}` だけ返すため、UI は「N件除外(配信停止済み)」という**緑の成功 toast** を出す。1 通も送っていない事実が画面から消え、正当な「全員 opt-out」と区別できない。

**Files:**

- Modify: `src/shared/domain/email/dispatch.ts:51-64`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts:285-291`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx:135-136`
- Test: `__tests__/unit/actions/customer-bulk-email.test.ts`（既存ファイルに 1 本追加）

**Interfaces:**

- Consumes:
  - `resolveEmailSendContext(): Promise<EmailSendContext | null>` — `src/shared/domain/settings/queries/email-render-context.ts:68`（transport 無効時 null）
  - `findCustomersForBroadcast(customerIds: string[]): Promise<{id:string; email:string}[]>` — `src/shared/domain/customers/queries.ts:560`（`marketingOptIn: true` で絞る）
  - `sendCustomerBroadcast(recipients, excluded, params, sendContext): Promise<CustomerBroadcastResult>` — `src/shared/lib/email/customer-emails.ts:33`（lib 版。常に `ok: true`）
  - `DomainError(message: string, code?: DomainErrorCode)` — `src/shared/domain/domain-error.ts:10`。`code` は `"NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "VALIDATION" | "UNAUTHORIZED" | "FORBIDDEN" | "UNEXPECTED"`
  - `executeAdminMutationResult` — `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts:71`。`execute` 内の `DomainError` を `{error, code}` に自動変換する（同ファイル 156-162 行）
  - `isMutationError` — `src/shared/lib/mutation-result.ts:21`
- Produces: `CustomerBroadcastDispatchResult`（`src/shared/domain/email/dispatch.ts` 内の非 export 型。`{ok:false; reason:"disabled"} | {ok:true; sent:number; excluded:number}`）。後続タスクは依存しない。

**PR 分割の判断（Task 5 と 1 PR にまとめない）:**
現物を見た結果、Task 5 と Task 6 は helper を共有していない。

- Task 5 が触るのは `sendEventBroadcast` = `src/shared/domain/email/lib-dispatch.ts:250-257`
- Task 6 が触るのは `sendCustomerBroadcast` = `src/shared/domain/email/dispatch.ts:51-64`

**別ファイル**であり、互いに相手のシンボルを import していない（唯一の共通依存 `resolveEmailSendContext` はどちらも変更しない）。さらに `__tests__/unit/architecture/email-mock-hygiene.test.ts:14` が監視する定数は `"@/shared/domain/email/lib-dispatch"` だけで、Task 6 側の `@/shared/domain/email/dispatch` は対象外 — テスト側の制約も別。よって **別 PR**（1 PR = 1 論理変更）。

**着手前のベースライン（検証時に実測。この状態から始まる）:**

| コマンド                                                                     | 結果                              |
| ---------------------------------------------------------------------------- | --------------------------------- |
| `bun run test -- __tests__/unit/actions/customer-bulk-email.test.ts`         | 5 pass / 0 fail                   |
| `bun run test -- __tests__/unit/shared/lib/email/customer-broadcast.test.ts` | 4 pass / 0 fail                   |
| `bun run test -- __tests__/unit/architecture/email-mock-hygiene.test.ts`     | 3 pass / 0 fail                   |
| `bun run test -- __tests__/integration/actions/admin/customer-bulk.test.ts`  | 20 pass / 0 fail                  |
| `bun run validate`                                                           | 緑（type-check 112s / 全体 167s） |

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/actions/customer-bulk-email.test.ts` の最後のテスト（163 行目の `});`）の直後、`describe` を閉じる 164 行目の `});` の直前に、次の 1 本だけを挿入する。

`isMutationError` は同ファイル 61 行目で、`CUSTOMER_ID_1` / `CUSTOMER_ID_2` は 65-66 行目で、`mockSendCustomerBroadcast` は 10 行目で既に用意されている。追加の import・mock は不要。

```ts
test("メール配信が無効なら成功扱いにせず MutationError を返す", async () => {
  mockSendCustomerBroadcast.mockResolvedValue({
    ok: false,
    reason: "disabled",
  });

  const result = await broadcastCustomersAction(
    [CUSTOMER_ID_1, CUSTOMER_ID_2],
    "お知らせ",
    "本文です",
  );

  expect(isMutationError(result)).toBe(true);
  if (isMutationError(result)) {
    expect(result.error).toContain("メール送信が無効です");
  }
});
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/actions/customer-bulk-email.test.ts`

期待: FAIL。実測済みの出力は次のとおり（`expect(isMutationError(result)).toBe(true)` の行で落ちる）。

```
error: expect(received).toBe(expected)

Expected: true
Received: false

(fail) broadcastCustomersAction > メール配信が無効なら成功扱いにせず MutationError を返す
 5 pass
 1 fail
```

修正前は `bulk.ts:291` が `{ sent: undefined, excluded: undefined }` を返すだけで `error` プロパティを持たないため、`isMutationError` が `false` になる。

- [ ] **Step 3: 実装を直す**

**(a) `src/shared/domain/email/dispatch.ts` — 51-64 行を丸ごと次に置き換える**

```ts
/**
 * `sendCustomerBroadcast`（domain 版）の戻り値。
 *
 * transport 無効（Resend API キー未設定 = `resolveEmailSendContext()` が null）で
 * **1 通も送っていない**状態と、opt-out 除外の結果 0 通だった状態を、呼び出し側が
 * `ok` で判別できるようにする。旧実装は前者でも
 * `{ ok: false, sent: 0, excluded: customerIds.length }` を返しており、
 * 呼び出し側が `ok` を捨てるため全件が「配信停止済みで除外」として
 * 緑の成功 toast に出ていた。
 */
type CustomerBroadcastDispatchResult =
  | { readonly ok: false; readonly reason: "disabled" }
  | { readonly ok: true; readonly sent: number; readonly excluded: number };

export async function sendCustomerBroadcast(
  customerIds: string[],
  params: { subject: string; body: string; broadcastNonce: string },
): Promise<CustomerBroadcastDispatchResult> {
  const [recipients, sendContext] = await Promise.all([
    findCustomersForBroadcast(customerIds),
    resolveEmailSendContext(),
  ]);
  if (!sendContext) {
    return { ok: false, reason: "disabled" };
  }
  const excluded = customerIds.length - recipients.length;
  const result = await sendCustomerBroadcastLib(
    recipients,
    excluded,
    params,
    sendContext,
  );
  return { ok: true, sent: result.sent, excluded: result.excluded };
}
```

（lib 版 `sendCustomerBroadcast` の `CustomerBroadcastResult.ok` は型としては `boolean` だが、実際の return は `customer-emails.ts` の 44 行・93 行の 2 箇所とも `ok: true`。よってここで `ok: true` に固定して振る舞いは変わらない。`ok: false` を作れるのは上の disabled 分岐だけになる。）

**(b) `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts` — 285-291 行を次に置き換える**

置換対象は次の 7 行（285 行目の `const broadcastNonce` から 291 行目の `return` まで）:

```ts
const broadcastNonce = randomUUID();
const result = await sendCustomerBroadcast(parsed.data.customerIds, {
  subject: parsed.data.subject,
  body: parsed.data.body,
  broadcastNonce,
});
return { sent: result.sent, excluded: result.excluded };
```

置換後:

```ts
const broadcastNonce = randomUUID();
const result = await sendCustomerBroadcast(parsed.data.customerIds, {
  subject: parsed.data.subject,
  body: parsed.data.body,
  broadcastNonce,
});
// transport 無効は「全員が配信停止」ではない。ここで握りつぶすと 0 件送信が
// 成功 toast になるため DomainError に落とす（文言と code は
// settings/template-test-send.ts の disabled 分岐と揃える）。
if (!result.ok) {
  throw new DomainError(
    "メール送信が無効です。連携設定（/admin/settings/integrations?tab=resend）で Resend API キーを設定するか、環境変数 RESEND_API_KEY を設定してください。",
    "VALIDATION",
  );
}
return { sent: result.sent, excluded: result.excluded };
```

`DomainError` は同ファイル 17 行目で既に import 済み。追加 import は不要。同じ `execute` 内の 283 行目に `throw new DomainError(rateLimit.error);` という同型の前例がある。

**(c) `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx` — 135-136 行**

```tsx
if (result.excluded > 0) parts.push(`${result.excluded}件除外(配信同意なし)`);
```

（`excluded` は `findCustomersForBroadcast` の `marketingOptIn: true` フィルタで落ちた件数、つまり「同意していない顧客 + 存在しない ID」。「配信停止済み」は元から不正確なので、この 1 行だけ実態に合わせる。他の行は変更しない。この文字列はリポジトリ内でここ 1 箇所だけで、assert しているテストも E2E も無い。）

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/actions/customer-bulk-email.test.ts`
期待: PASS（6 pass / 0 fail）

- [ ] **Step 5: 周辺が壊れていないことを確認する**

```bash
bun run validate
bun run test -- __tests__/unit/shared/lib/email/customer-broadcast.test.ts
bun run test -- __tests__/unit/architecture/email-mock-hygiene.test.ts
bun run test -- __tests__/integration/actions/admin/customer-bulk.test.ts
```

期待: すべて PASS（ベースライン表と同じ件数）。

- `bun run validate`（type-check + lint）が `dispatch.ts` の戻り値型変更の唯一の網。テストは含まない。domain `sendCustomerBroadcast` の呼び出し元は `bulk.ts:286` の 1 箇所だけなので、波及はここで閉じる。
- `customer-broadcast.test.ts` は lib 層（`src/shared/lib/email/customer-emails.ts`）のテスト。今回 lib は触らないので緑のままであること＝domain 側だけを変えた証拠。
- `email-mock-hygiene.test.ts` は `__tests__/unit/actions` 配下を走査するので、テストファイルを編集した以上は踏む。なお、このファイルが監視するのは `@/shared/lib/email/send` と `@/shared/domain/email/lib-dispatch` の部分 mock だけで、`customer-bulk-email.test.ts:49` の `@/shared/domain/email/dispatch` 直 mock は対象外（既存どおり通る）。
- `customer-bulk.test.ts` は `__tests__/integration/` にあるが**実 DB は使わない** — `bulk-commands` / `bulk-status-commands` / `admin-action` / `next/cache` / `async-utils` / `cloudflare` を全て `mock.module` で差し替えており、prisma への問い合わせも `DATABASE_URL` の上書きも無い（runner の serial DB 検出も `serial=0` と判定する）。docker の test-db を立ち上げる必要は無い。ここで見るのは `customer/bulk.ts` の module load 経路（`dispatch.ts` 経由の import グラフ）が壊れていないこと。

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/email/dispatch.ts "src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts" "src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx" __tests__/unit/actions/customer-bulk-email.test.ts
git commit -m "fix(admin): surface disabled email transport in customer bulk broadcast [ai-gen]"
```

---

### Task 7: 予約詳細のキャンセル日時が UTC 生 ISO のまま表示される

**深刻度:** medium / **見積り:** 16 行・2 ファイル

**なぜ:** `ReservationDetail.tsx:644` だけが `formatDateTimeFull()` を通さず `reservation.cancelledAt`（`toPlainObject` 経由の ISO 文字列 `2026-08-15T20:00:00.000Z`）を `<dd>` に直接出す。同カードの開始/終了/作成/更新/支払い日時（433/437/441/445/473 行）は全て JST 整形済みなので、管理者はこの欄も JST と読み、無料キャンセル期限の判定が 9 時間ずれて返金額を誤る。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx:644`
- Test: `__tests__/unit/components/admin/reservation-detail.test.tsx`（既存ファイルにテスト 1 本を追加）

**Interfaces:**

- Consumes: `formatDateTimeFull(date: Date | string | null | undefined): string`（`src/shared/lib/date-format.ts:51-65`、`ReservationDetail.tsx:53` で import 済み）／ `ReservationWithRelations`（定義は `src/app/(admin)/admin/(dashboard)/_shared/queries/reservation.ts:23-97`、`cancelledAt: string | null` は 53 行。テストファイルは 4 行目で `@/admin/actions/reservation` から import 済み — `@/admin/*` は `src/app/(admin)/admin/(dashboard)/_shared/*` に解決され、`_shared/actions/reservation/index.ts` が queries から re-export している。import の変更は不要）／ `ReservationStatus`（テストファイル 5-8 行で import 済み）
- Produces: なし

**採らなかった案:** 641 行の `{reservation.cancelledAt && (` ガードを外して常に `DetailField` を描く案（`formatDateTimeFull(null)` は `"-"` を返すので動く）。null のとき「キャンセル日時 —」という無意味な行が増えるだけなので採らない。ガードは残したまま値の整形だけ直す。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/components/admin/reservation-detail.test.tsx` の `describe("ReservationDetail payment actions")` **の中**、最後のテスト `test("UNPAID + stripeCheckoutSessionId あり: 手動入金非表示", ...)`（295-305 行）の直後・`describe` を閉じる `});`（306 行 = ファイル末尾）の直前に以下を挿入する。`makeReservation` / `renderDetail` / `container` はこの `describe` スコープにあるため、外に出すと参照できない。新しい import は不要（`ReservationStatus` は 5-8 行、`ReservationWithRelations` は 4 行目で import 済み）。

```tsx
test("CANCELLED: キャンセル日時を JST 整形で表示する（UTC 生 ISO を出さない）", async () => {
  // UTC 2026-08-15 20:00 → JST 2026-08-16 05:00（日跨ぎするので UTC 表示なら 08/15 のまま）
  await renderDetail(
    makeReservation({
      status: ReservationStatus.CANCELLED,
      cancelledAt: "2026-08-15T20:00:00.000Z",
    }),
    false,
  );

  const text = container?.textContent ?? "";
  expect(text).toContain("2026/08/16");
  expect(text).not.toContain("2026-08-15T20:00:00.000Z");
});
```

- [ ] **Step 2: 落ちることを確認する**

実行: `bun run test -- __tests__/unit/components/admin/reservation-detail.test.tsx`

期待: FAIL（`5 pass / 1 fail`）。失敗メッセージは

```
error: expect(received).toContain(expected)

Expected to contain: "2026/08/16"
Received: "ステータスCANCELLED保留中に変更確認済みに変更キャンセルに変更予約情報スペースStudio A開始日時2026/08/01(土) 10:00終了日時2026/08/01(土) 12:00作成日時2026/07/01(水) 09:00更新日時2026/07/01(水) 09:00料金明細合計金額10000円決済情報決済ステータス未払い顧客情報氏名山田 太郎memberメールアドレスtaro@example.com電話番号-キャンセル情報キャンセル者不明キャンセル日時2026-08-15T20:00:00.000Zメモメモを保存"
```

（`キャンセル日時` の直後だけ生 ISO が出ているのが欠陥そのもの。同じ出力の `開始日時2026/08/01(土) 10:00` 以下は整形済みで、この 1 欄だけ揃っていないことが一目で分かる）

- [ ] **Step 3: 実装を直す**

`src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx` の 634-647 行。641 行の `&&` ガードと 643 行の label はそのまま、644 行の value だけを変える。

```tsx
      {/* キャンセル情報 */}
      {reservation.status === ReservationStatus.CANCELLED && (
        <DetailSection title="キャンセル情報">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="キャンセル者"
              value={getCancelledByLabel(reservation.cancelledByType)}
            />
            {reservation.cancelledAt && (
              <DetailField
                label="キャンセル日時"
                value={formatDateTimeFull(reservation.cancelledAt)}
              />
            )}
          </div>
```

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/unit/components/admin/reservation-detail.test.tsx`

期待: PASS（`6 pass / 0 fail`）。`formatDateTimeFull("2026-08-15T20:00:00.000Z")` は `"2026/08/16(日) 05:00"` を返す。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行:

```bash
bun run lint:files -- "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx"
bun run validate
```

期待: どちらも PASS（`lint:files` は違反ゼロなら出力なし）。`__tests__/**` は ESLint 対象外なのでテストファイルは `lint:files` に渡さない。`ReservationWithRelations` を描画する他コンポーネント（`ReservationTable.tsx` / `ReservationEditForm.tsx`）はこの変更に触れていないので追加のテスト実行は不要。顧客側の `src/app/(public)/mypage/reservations/[id]/_components/reservation-detail.tsx:257` は既に `formatSerializedDate(cancelledAt)` で整形済みのため対象外。

- [ ] **Step 6: commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/reservations/[id]/_components/ReservationDetail.tsx" "__tests__/unit/components/admin/reservation-detail.test.tsx"
git commit -m "fix(admin): 予約詳細のキャンセル日時を JST 整形で表示する [ai-gen]"
```

---

### Task 8: イベント詳細の「参加者一覧（N名）」を申込行数から参加人数（Σquantity）に直す

**深刻度:** medium / **見積り:** 約 50 行・2 ファイル

**なぜ:** `getEventRegistrations` が返す `confirmedCount` は `prisma.eventRegistration.count()` の**行数**なのに、管理画面イベント詳細はそれを「参加者一覧（N名）」と人数として描いている。`EventRegistration.quantity` は 1 申込あたりの参加人数（公開申込 `publicEventRegistrationSchema` は 1〜10、管理画面の代理登録 `adminEventRegistrationSchema` は下限 1 のみで上限なし、当日受付は最大 100、DB CHECK も `quantity >= 1` のみ）なので、4名+3名+2名の 3 件は実際 9 名なのに「参加者一覧（3名）」と出る。同画面の 228 行は同じ枠の定員を「定員 10人」と人数で描いているため、管理者は「9/10 埋まっている枠」を「3/10」と読む。表示専用の欠陥で、定員超過の実防御（DB trigger / slot-commands）は別経路で正しく Σquantity を見ている。

**Files:**

- Modify: `src/shared/domain/events/registration-queries.ts:25-30`（JSDoc）、`:64`、`:107-109`、`:112`
- Test: `__tests__/integration/domain/events/registration-search-filter.test.ts`（既存ファイルに 1 本追加）

**方針（1 つに決定）:** 見出しの「名」に合わせて **`confirmedCount` を Σquantity にする**。「件」に直す案は採らない — このリポジトリの `confirmedCount` という名前は既に一貫して人数側（`src/shared/domain/events/slot-queries.ts:102-117` の `_sum.quantity` / `registration-queries.ts:380-398` の `aggregate({_sum:{quantity:true}})`）で、`src/shared/lib/pricing/event-ticket-charge.ts:18-21` の JSDoc が「**定員は人数で数える。ここは変えない。**」と明記し、DB の `assert_event_capacity_not_exceeded`（`prisma/baseline/invariants.sql:195-215`。本体の `SELECT COALESCE(SUM(quantity), 0)` は 213 行）も `SUM(quantity)` で数える。ここだけ「件」に倒すと、同じ名前が 1 箇所だけ別単位になる。

**Interfaces:**

- Consumes: `prisma.eventRegistration.aggregate`（`@/shared/db/prisma`）、`RegistrationStatus.CONFIRMED`（`@/shared/lib/validations/enums/prisma-types`、`registration-queries.ts:4-7` で import 済み）、`paginate`（`@/shared/lib/pagination`）
- Produces: `getEventRegistrations()` の戻り値 `confirmedCount: number` の意味変更（行数 → CONFIRMED の `quantity` 合計）。名前と型は変えない。唯一の読み手は `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx:117`（→ 287 行の見出し）で、そちらは無改修。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/integration/domain/events/registration-search-filter.test.ts` の先頭 JSDoc（1-3 行）を差し替える:

```ts
/**
 * getEventRegistrations の search/status フィルタと集計値を実DBで検証する。
 */
```

同ファイルの最後のテスト（`"search/status を指定しない場合は既存の全件取得と同じ結果になる"`、216-234 行）の直後、`describeMaybe` ブロックを閉じる `});`（235 行）の前に次を追加する:

```ts
test("confirmedCount は CONFIRMED 申込の quantity 合計（申込行数ではない）", async () => {
  const fixture = await createFixtureEvent();
  // 4名 + 3名 + 2名 の 3 件 = 9名。行数(3)と人数(9)が必ずずれる形にする。
  // fixture の slot capacity は 10 なので容量 trigger には触れない。
  for (const quantity of [4, 3, 2]) {
    await prisma.eventRegistration.create({
      data: {
        eventId: fixture.eventId,
        slotId: fixture.slotId,
        ticketId: fixture.ticketId,
        name: `Group ${String(quantity)}`,
        quantity,
        status: RegistrationStatus.CONFIRMED,
      },
    });
  }
  // CANCELLED の 5 名は見出しの人数に入らない（status 絞りが外れると 14 になる）。
  await prisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "Cancelled Group",
      quantity: 5,
      status: RegistrationStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });

  try {
    const result = await getEventRegistrations(fixture.eventId, {});
    expect(result.total).toBe(4);
    expect(result.confirmedCount).toBe(9);
  } finally {
    await cleanupFixture(fixture.eventId);
  }
});
```

（`createFixtureEvent` / `cleanupFixture` / `prisma` / `getEventRegistrations` / `RegistrationStatus` はすべて同ファイル内に既存。新規 import は不要。）

- [ ] **Step 2: 落ちることを確認する**

実行:

```bash
bun run test:db:migrate
bun run test -- __tests__/integration/domain/events/registration-search-filter.test.ts
```

期待: FAIL。`expect(received).toBe(expected)` / `Expected: 9` / `Received: 3`（`confirmedCount` が CONFIRMED **行数** 3 を返すため）。`result.total` の 4 は通る。

注意: このファイルは先頭 13-18 行で `TEST_DATABASE_URL` を読んで `describeMaybe` を決める。runner（`scripts/run-tests.ts:114-126` → `scripts/test-db-runner-env.ts:35-45`）が未設定なら docker-compose の test-db 既定値（5433）を入れるので skip にはならない。出力に上のテスト名が現れることを目で確認する（`0 pass 0 fail` なら DB が起動していない）。

- [ ] **Step 3: 実装を直す**

`src/shared/domain/events/registration-queries.ts`

(a) 25-30 行の JSDoc を差し替える:

```ts
/**
 * 管理画面イベント詳細の参加者一覧をページネーション付きで取得する。
 *
 * 申込が多いイベントでも全件をメモリに読み込まないよう `skip` / `take` で絞り、
 * 一覧総数（`total`）と確定参加人数（`confirmedCount`）を併せて返す。
 *
 * `confirmedCount` は **CONFIRMED 申込の `quantity` 合計**であって行数ではない。
 * `quantity` は 1 申込あたりの参加人数なので、行数を「N名」として出すと
 * 4+3+2 名の 3 件が「3名」になる。定員の消費も DB の
 * `assert_event_capacity_not_exceeded` も `SUM(quantity)` で数えており、
 * このリポジトリの `confirmedCount` は一貫して人数側
 * （`slot-queries.ts` / `getEventRegistrationDetailsForEmail`）。
 */
```

(b) 64 行の分割代入の 3 番目の名前を変える（`confirmedCount` は集計オブジェクトではなく数値のまま返したいため）:

```ts
  const [registrations, total, confirmedQuantity] = await Promise.all([
```

(c) 107-109 行の 2 本目の `count` を `aggregate` に差し替える（106 行の 1 本目の `count` と 110 行の `]);` は据え置き。下は位置合わせのために前後を含めた形）:

```ts
    prisma.eventRegistration.count({ where }),
    // 見出しは「参加者一覧（N名）」＝人数。行数ではなく quantity 合計で数える。
    prisma.eventRegistration.aggregate({
      where: { ...where, status: RegistrationStatus.CONFIRMED },
      _sum: { quantity: true },
    }),
  ]);
```

(d) 112 行の return を差し替える:

```ts
return {
  registrations,
  total,
  confirmedCount: confirmedQuantity._sum.quantity ?? 0,
  page,
  perPage,
};
```

`page.tsx` は無改修（117 行の `registrationPage.confirmedCount` と 287 行の見出しはそのまま正しくなる）。

- [ ] **Step 4: 通ることを確認する**

実行: `bun run test -- __tests__/integration/domain/events/registration-search-filter.test.ts`
期待: PASS（5 テストすべて）。

- [ ] **Step 5: 周辺が壊れていないことを確認する**

実行:

```bash
bun run test -- __tests__/unit/domain/events/registration-queries.test.ts
bun run validate
```

期待: どちらも PASS。`registration-queries.test.ts` は**同じモジュールを import する唯一の unit テスト**で、別関数（`getEventRegistrationDetailsForEmail` ほか）を mock prisma で検証している。その mock（同ファイル 80-89 行）は `findFirst` / `aggregate` / `findMany` のみ公開しており `count` は無い — `getEventRegistrations` はそこでは呼ばれないので今回の差し替えの前後どちらでも影響しないが、モジュールが読めることの確認として走らせる。`validate` は type-check + lint のみでテストを含まない（`page.tsx` 側の型はここで見る）。

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/events/registration-queries.ts __tests__/integration/domain/events/registration-search-filter.test.ts
git commit -m "fix(admin): count event participants by quantity sum [ai-gen]"
```

---

## 付録: 監査の記述と現物のずれ

起案・検証の過程で見つかった、**監査報告書の記述が現行コードと食い違っていた点**。
第 7 次以降で同じ仮説を再検討するときの材料として残す。

#### Task 1 — 規約エディタの本文保存が「設定を一度も開いていない管理者」に対して機能しない

監査の結論は正しい。ずれ・補足が 4 点。

1. **行番号の精度（軽微）** — 監査は「use-terms-editor.ts:197」を箇所として挙げているが、197 行は `if (!(settingsContainer instanceof HTMLElement)) {` のガード行で、死んだ `Object.entries(settingsFields)` は **198 行**。ブロックは 197-210、`validateSettings` 全体は 188-231。

2. **影響範囲が監査の記述より広い（重要）** — 監査は「本文の編集は DB に一切送られない」までしか書いていないが、edit モードで壊れるのは保存だけではない。`getSettingsDataForSubmit()` を通る経路は 5 つあり、全部同じ理由で失敗する:
   - `handleSave` (use-terms-editor.ts:307) — ヘッダー「保存」/ Cmd+S
   - `handlePreview` (:459) — 「プレビュー」
   - `persistTermsWithPublishState` (:376) → `handlePublish` (:413) / `handleUnpublish` (:417) — 「公開」「下書きに戻す」
     いずれも `toast.error("入力内容に誤りがあります")` の後に `if (!settingsData) return;` で終わる。**設定を一度も保存していない管理者は、規約の公開・非公開の切り替えすらできない。** 今回の 1 箇所の修正で 5 経路とも直る。

3. **「同じ死んだフォールバック」は同一コードではない（計画に影響）** — 監査は news / post を「同じ死んだフォールバック」と表現しているが、3 者の fallback 本体は別物:
   - terms (`use-terms-editor.ts:200-208`): 配列 → `String(v)` を append / boolean → `"on"` か `""` / それ以外 → `String`
   - news (`use-news-editor.ts:222-228`): 配列 → `JSON.stringify` / boolean → true のときだけ `"on"` / それ以外 → `String`
   - post (`use-post-editor.ts:261-265`): 配列 → `JSON.stringify` / boolean 分岐**なし** / それ以外 → `String`
     よって共通 helper を 1 本作って 3 箇所に差すことはできず、terms の修正で news / post が自動的に直ることもない。監査の「別タスクに回すか、同一関数の修正で自動的に直るならその根拠を書く」への回答は **自動では直らない**。

4. **監査が提案した直し方は一部採らない** — 「各 hook が既に持つ `toSettingsFormData(terms)`（DB 由来の初期値）を FormData に流し込む」案に対し、本計画は `slug` / `title` を `use-terms-editor.ts:173-182` の既存 const（`settingsSnapshot?.x ?? settingsFields.x.value`）から取る。理由は (a) conform の `state.value` は初期値が `defaultValue` のシリアライズ結果（`node_modules/@conform-to/dom/dist/form.js:26` の `value: initialValue`）なので未操作なら `toSettingsFormData(terms)` と同値になり監査の要件を満たす、(b) ヘッダーが表示している値（`TermsInlineEditor.tsx:172` の `title={editor.title}`）と保存される値が一致する、(c) `toSettingsFormData` を新モジュールへ移すと `TermsSettingsFormState`（`type: string` の唯一の宣言）も一緒に動き、`db-enum-columns-are-not-string.test.ts:79` の path 固定 entry が stale になって gate が赤くなる。

#### Task 2 — 返金ポリシー推奨額が税抜基準かつ既存返金を引かない（H-2 と M-g を 1 つに）

機序は監査の記述どおりで、棄却する点は無い。ただし記述の不正確さと、監査が触れていない重要な点が 4 つある。

1. **パス誤り。** 監査は「cancellation/steps.ts:50」と書いているが、`src/shared/domain/cancellation/` に `steps.ts` は無い（同ディレクトリにあるのは `run-auto-refund-on-cancel.ts` のみ）。実体は `src/shared/domain/reservations/cancellation/steps.ts:50`。内容（`chargeBase: reservation.totalPriceWithTax ?? reservation.totalPrice ?? null`）は一致。

2. **監査が触れていない誤りの発生源。** `page.tsx:68-70` に「Round-5 audit Finding #20 と同じ理由: 返金上限の基準は Stripe への実 charge 額 = 税抜 totalPrice」というコメントがあり、`RefundDialog.tsx:52-60` の JSDoc にも「サーバー側の権威ある返金上限（`refundReservationPaymentCommand`）は Stripe への実 charge 額である税抜 `totalPrice` を基準にしている」と書かれている。**この 2 つのコメントは現行コードと矛盾している** — `payment-commands.ts:303` の Checkout も `:743` の `chargeTotal` も `totalPriceWithTax`。H-2 はこの誤ったコメントが残っていることが原因なので、値を直すだけでなくコメントも消さないと再発する。修正計画にはこれを含めた。

3. **同じ誤りが policy.ts の JSDoc にもある。** `src/shared/domain/refund/policy.ts:110` の `@param chargedAmount 実 charge 額 (checkout で Stripe に送った額、`Reservation.totalPrice` 相当)` も税抜を指している。1 行の doc 修正として同じ PR に含めた（同一の誤った前提なので分割しない）。

4. **行番号の細かいずれ。** 監査の「RefundDialog.tsx:128」はクライアント検査の `if (parsed > remaining)` そのものの行で正確だが、判定に使う `remaining` の定義は同ファイル 85 行。「run-auto-refund-on-cancel.ts:186-192 / 174-185」はいずれも現在のファイルと一致（ずれ無し）。「ReservationDetail.tsx:692 / 695-698」も一致。「page.tsx:67-72」は正確には 65-75 行（`const suggestedRefundAmount =` から閉じ括弧まで）。

#### Task 3 — 個人区分の顧客を保存すると会社名が無言で null 上書きされる

監査の中核（機序・影響・無言で成功する点）は**すべて正しい**。ただし 3 点訂正がある。

1. **監査が提案した直し方は、そのまま実装すると CORPORATE の保存を全滅させる。** 監査は「条件ブロックの**外側**に `<input type="hidden" name={fields.companyName.name} value={companyNameValue} />` を置き、CORPORATE のときだけ可視 Input を出す」と書いているが、CORPORATE では hidden と可視の両方が `name="companyName"` を持つため FormData にキーが 2 件載る。`node_modules/@conform-to/dom/dist/submission.mjs:31-41` の `getSubmissionContext` が 2 件目以降を配列に畳むので、`customerFormSchema` の `z.string()` が拒否し `{"status":"error","error":{"companyName":["Invalid input"]}}` を返す（実測）。**hidden input は else 側にだけ置くこと。** 監査自身が「可視 Input と hidden input が同時に存在すると FormData にキーが 2 つ載る」と注意しているのに、提示した修正例がその形になっている。

2. **`reservation-form-schema.ts:71-99` は行番号が 1〜2 行ずれている。** `newCustomerObjectSchema` の実体は `src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema.ts:72-101`。主張（`customerType` フィールドを持たない）は正しい。他の名指し（`CustomerEditForm.tsx:351`、`commands.ts:69`、`resolve-customer.ts:87-88`）は現行ファイルと一致。

3. **「conform は defaultValue に対して hidden input を自動生成しない」は結論として正しいが、理由づけが不正確。** conform の `useInputControl` は「その name の要素が form に見つからず、かつ value が undefined でない」場合に dummy select を自動生成する（`node_modules/@conform-to/react/dist/integrations.mjs:252-254`）。生成されないのは `companyName` が `useInputControl` を一切通していないから。既存 4 本の hidden input は「自動生成が無いから手で書いた」のではなく「手で書いてあるから dummy 生成が起きない」という関係にある。次のエンジニアが `useInputControl(fields.companyName)` を足す誘惑にかられうるので明記する（採らない案 → 下記 risks）。

追加で見つけたもの（監査に記載なし）: `CustomerEditForm.tsx:144-147` に空の `if (value === CustomerType.PERSONAL) { /* 法人 → 個人切替時に会社名をクリア */ }` がある。中身が無く何も起きない死んだブロックで、コメントは今回の修正（切替後も会社名を保持する）と真逆の説明をしている。Step 3 で削除する。

#### Task 4 — CONFLICT 後の router.refresh() が「古い入力 + 新しいトークン」を作り他人の変更を上書きする

監査の機序・行番号は**おおむね正しい**。修正点は 3 つ。

1. **ファイルパスの誤り（軽微）**: 監査は `SidebarSection.tsx` を BusinessHoursSection と同じ `_components/` 直下のように書いているが、実体は `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx`。行番号は 85-93（state）/ 233（token 直読み）は一致、CONFLICT 分岐は「237-239」ではなく **236-239**（`router.refresh()` は 238 行目）。

2. **監査の推奨 (a) をそのまま当てると、成功後の連続保存が壊れる**: `SettingsOrganization.updatedAt` は保存成功のたびに進むので、token を mount 時に凍結すると「保存 → 続けて保存」の 2 回目が偽の CONFLICT になる。ただしこれは新しい欠陥ではなく、conform を使う 4 セクション（ReservationSection / TaxSection / LayoutSection / BusinessInfoSection）が hidden input の `defaultValue` で既に取っている挙動に**揃う**方向の変更。監査は「conform 側は refresh しても古いまま」と書いており、その帰結（＝連続保存は CONFLICT になる）に触れていない。計画では risks に明示した。なお conform 側のこの挙動は**コードを読んだ推論であり実測していない**。

3. **「CONFLICT 時に router.refresh() を消す」だけでは不十分**（採らなかった案として記録）: 一見 3 行削除で済むが、同じ admin シェルに常時 mount される `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx:38` が「すべて既読」で `router.refresh()` を呼ぶため、prop が別経路で入れ替わる余地が残る。token 自体を凍結する (a) はどの refresh 源からも独立するので、そちらを採る。

指摘そのものは成立する。このタスクは必要。

#### Task 5 — イベント一斉配信: Resend 未設定だと 1 通も送らずに「送信しました」と出て本文が消える

機序は成立する（棄却しない）。ただし監査の記述に 2 点、事実誤りがある。

1. **「E2E は Resend 未設定」は誤り。この修正で E2E は落ちない。** 監査（および spec 冒頭コメント）は E2E 環境に API キーが無い前提だが、`.github/workflows/ci.yml:598`（admin surface の E2E step）と `:629` が `RESEND_API_KEY: "re_test_placeholder_for_ci_e2e_only"` を渡しており、CI では transport は**有効**。E2E が緑な本当の理由は別で、`prisma/seed.ts` は `marketingOptIn` を一度も設定せず（seed 全文に marketing の語が 0 件、`prisma/schema.prisma:1042` の既定は `false`）、`src/shared/domain/events/email-queries.ts:204-221` が `marketingOptIn: true` の Customer に紐づく申込しか recipients に入れないため、seed イベントの `recipients.length` が常に 0 で `event-emails.ts:913-915` の早期 return（`ok:true, sent:0`）に落ちるから。したがって本タスクの条件 `payload.recipients.length > 0 && sent === 0` には掛からず、`e2e/authenticated/admin/events-broadcast.spec.ts:83-103` の assertion は変更不要（コメントだけ正す）。

2. **BroadcastForm のパスが違う。** 監査は `BroadcastForm.tsx` としか書いていないが、実在するのは `src/app/(admin)/admin/(dashboard)/events/[id]/broadcast/_components/BroadcastForm.tsx` の 1 ファイルのみ。`_shared/components/` には無い。行番号 59-63 は正しい。

3. 行番号の微修正: 監査は「event-broadcast.ts:78」を ok 破棄の箇所としているが、78-82 は `sendEventBroadcast` の呼び出しで、ok を捨てているのは 83-86 の `return { sent, skipped }`（と 98 の `return { ok: true }`）。

**範囲外の別件（この PR では直さない）:** 画面の「配信対象: N 名」は `src/shared/domain/events/registration-queries.ts:174-195` の `getEventBroadcastRecipientCounts`（`status=CONFIRMED AND email IS NOT NULL` のみ）で数えるのに対し、実送信の母集合 `getEventBroadcastPayload` はさらに Customer 解決 + `marketingOptIn: true` で絞る。seed 状態では前者 2 名・後者 0 名になり、画面の件数と実配信数が構造的に一致しない。同じ「送っていないのに送ったように見える」系だが原因が別（母集合の述語不一致）なので別タスクにすべき。あわせて `__tests__/unit/architecture/e2e-global-state-restore.test.ts:88` の allowlist 理由文にも「E2E は Resend 未設定で silent no-op」という同じ誤記があるが、gate の主張自体（global state を戻す必要が無い）には影響しないので触らない。

#### Task 6 — 顧客一括メール: Resend 未設定だと全員が「配信停止済み」として除外表示され成功 toast が出る

監査の記述は**機序としては正しい**。ただし 3 点の訂正・補足がある。

1. **Task 5 と `dispatch.ts` を共有していない（タスク指示の前提の訂正）。**
   指示は「dispatch.ts を共有しているなら 1 PR が自然」としているが、Task 5 の `sendEventBroadcast` は `src/shared/domain/email/lib-dispatch.ts:250-257` にあり、Task 6 の `sendCustomerBroadcast` は `src/shared/domain/email/dispatch.ts:51-64` にある。**別ファイル**で、`src/app/(admin)/admin/(dashboard)/_shared/actions/event-broadcast.ts:11` は `@/shared/domain/email/lib-dispatch` を、`.../actions/customer/bulk.ts:18` は `@/shared/domain/email/dispatch` を import している。共有しているのは `resolveEmailSendContext`（どちらも変更しない）だけ。よって**別 PR**とする。

2. **`excluded` は「opt-out 件数」ではない。**
   監査は「真の opt-out 件数」と書いているが、`findCustomersForBroadcast`（`src/shared/domain/customers/queries.ts:561-567`）の where は `marketingOptIn: true` なので、`excluded` は「マーケティング配信に**同意していない**顧客 + 存在しない customerId」の合計。`marketingOptIn` を一度も true にしていない顧客も含まれるため、UI の「配信停止済み」というラベルは transport バグとは独立に元から不正確。Step 3(c) の 1 行はこれに対する修正。

3. **行番号の微修正。**
   - 監査ヘッダの `bulk.ts:286` は `sendCustomerBroadcast` の**呼び出し行**。`ok` を捨てているのは本文にあるとおり `:291`。
   - 監査の `CustomerBulkActions.tsx:136` は `parts.push` の行で、条件 `if (result.excluded > 0)` は `:135`。`toast.success` は `:137-139`。
   - `dispatch.ts:59-61`、`customer-bulk-email.test.ts:141-163` は完全一致。

棄却すべき指摘は無し。「Resend 未設定で緑の成功 toast が出る」は現行コードで再現する（probe テストで実測: 現行実装は `{sent: undefined, excluded: undefined}` を返し `isMutationError` が false になる = 成功扱い）。

#### Task 7 — 予約詳細の「キャンセル日時」だけ整形されず UTC の生 ISO 文字列が表示される

監査の機序・行番号は全て正しく、棄却すべき点は無い。補足の訂正が 2 点。

1. **「型が Date か string か不明」という懸念は解消済み — string で確定**。`_shared/queries/reservation.ts:53` が `cancelledAt: string | null` と宣言し、`getReservationById`（同 127-132 行）が `getReservationByIdQuery` の `Serialized<...>` 戻り値をこの型として返している。宣言と実行時の値（ISO 文字列）は一致しており、ずれていない。したがって修正は監査の提案どおり `formatDateTimeFull(reservation.cancelledAt)` で型的にも正しい（`formatDateTimeFull` は `Date | string | null | undefined` を受ける、date-format.ts:52）。
2. **「null なら "-" を返すのでガード不要」は事実だが、ガードを外すことは提案しない**。641 行の `{reservation.cancelledAt && (` を残したまま value だけ直すのが最小差分で、外すと `cancelledAt` が null の CANCELLED 予約に「キャンセル日時 —」という空行が増える（`DetailField` は value が `"-"` のとき `—` ではなく `-` をそのまま出すので、他の欄と表記も揃わない）。本計画はガードを残す。

#### Task 8 — イベント詳細の「参加者一覧（N名）」が申込行数を表示していて実人数と一致しない

1. **欠陥の所在が違う。** 監査は `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx:287` を箇所として挙げたが、287 行は `confirmedCount` を描画しているだけで、行数を数えているのは `src/shared/domain/events/registration-queries.ts:107-109`。修正は query 側 1 ファイルで完結し、page.tsx は無改修でよい（指摘そのものは成立。所在の訂正のみ）。

2. **SSoT のパスが違う。** 監査は `event-ticket-charge.ts:18-21` の親ディレクトリを `src/lib/payment/` と書いているが、実在パスは `src/shared/lib/pricing/event-ticket-charge.ts`。`src/lib/` はこのリポジトリに存在しない。行番号 18-21 と引用文（「定員は人数で数える。ここは変えない。」）は正確。

3. **「検索ボックスで見出しの数字が変わる」は半分だけ正しい。** `where` を spread しているので `search` は確かに `confirmedCount` に効く。しかし `status` は効かない — spread の後に `status: RegistrationStatus.CONFIRMED` を置いているため（`registration-queries.ts:107-109`）、ユーザーが status フィルタを選んでも上書きされて常に CONFIRMED になる。
   さらにこれは**欠陥として扱わない**方針を取る。同じ `where` から出る `total`（`:106`）も検索で絞られ、その `total` が下のテーブルのページネーション母数（`page.tsx:303`）になっている。見出しの数字だけ検索非依存にすると、見出しとテーブルの母集団がずれる。1 PR = 1 論理変更の原則もあり、このタスクは単位（行数→人数）だけを直す。

4. 監査の「4+3+5 名の 3 件なら実際 12 名」という例は、fixture の slot capacity 10 では容量 trigger（`invariants.sql:656`）に触れて INSERT が失敗する。テストでは 4+3+2=9 名に置き換えた（行数 3 と人数 9 がずれることを示すのに十分）。

## 付録: この修正で壊れうるもの

#### Task 1 — 規約エディタの本文保存が「設定を一度も開いていない管理者」に対して機能しない

1. **未保存の設定編集が保存されるようになる（新しい挙動）** — 設定ダイアログを開いて title / slug を打ち替え、「キャンセル」か Esc で閉じた場合、conform のフォーム状態はリセットされない（`TermsInlineEditor.tsx:225` が `onCancel` に `editor.closeSettingsDialog` を渡しており、`use-terms-editor.ts:485-487` は `setIsSettingsDialogOpen(false)` だけ。`SettingsDialog.tsx:153` の型コメントは「フォーム reset を呼ぶ」と書いてあるが実際には呼んでいない）。修正後はその破棄したはずの値がヘッダー保存で DB に入る。修正前は保存自体が失敗していたので回帰ではないが、挙動は変わる。

2. **create モードは何も変わらない（意図どおり）** — `terms` が undefined のとき `slug` は `""`（`toSettingsFormData` の分岐 `use-terms-editor.ts:46-56`）なので `.min(1)` で落ち、`handleSave` (`:292-296`) は従来どおり toast を出して設定ダイアログを開く。ここを「直った」と誤認しないこと。

3. **`db-enum-columns-are-not-string.test.ts` の path 固定** — :79 の `use-terms-editor.ts::type` は `type: string` の宣言件数を数える stale 検査付き entry。`TermsSettingsFormState`（`use-terms-editor.ts:32-40`）を新モジュールへ移すと空振りして gate が赤くなり、さらに新モジュール側が新規違反になる。**型を移さない**という制約が実装者に伝わっていないとここで詰まる。

4. **`module-reachability.test.ts` の allowlist は空** — 新モジュールは `use-terms-editor.ts` の import だけで生かされている。import を消した瞬間に orphan として落ちる。

5. **`collectFormDataFromContainer` の import 消し忘れ** — `use-terms-editor.ts:23` を残すと未使用 import で `bun run validate` の lint が落ちる（`src/` は ESLint 対象）。

6. **ダイアログを開いた状態の経路は無検査のまま** — 今回のテストは `container === null` の分岐しか踏まない。マウント時の経路（`collectFormDataFromContainer` + 上書き）は従来どおり E2E `content-preview.spec.ts` 頼み。ここは変更していないので回帰リスクは低いが、無検査であることは記録しておく。

7. **news / post は壊れたまま** — edit モードの「プレビュー」が引き続き失敗する。この PR の「やらないこと」に明記してある。

#### Task 2 — 返金ポリシー推奨額が税抜基準かつ既存返金を引かない（H-2 と M-g を 1 つに）

1. **自動返金の skip 理由の取り違え（低）。** `outstanding` に `Math.max(0, ...)` を入れると、これまで負数だった値が 0 になる。`run-auto-refund-on-cancel.ts:196` は `refundAmount <= 0` なので枝は変わらず、理由の分岐（同 200-202）は `policyEntitlement === 0` を見ているので `POLICY_REFUND_RATE_ZERO` と `POLICY_ALREADY_SATISFIED` の区別も維持される。既存 8 テストで担保される。もし `Math.max` を入れずに済ませたいなら `outstanding` を丸めず、`_lib` 側で丸めてもよい（振る舞いは同じ）。

2. **`calculateRefundAmountNow` の削除（低）。** grep 上の呼出元は `page.tsx:67` の 1 箇所のみ。削除漏れがあれば `bun run validate` の type-check が落ちる。ESLint / knip 相当の未使用 export 検査はこのリポジトリに無いので、残しても gate は落ちないが dead code になる。

3. **新規モジュールの到達性（低）。** `__tests__/unit/architecture/module-reachability.test.ts` は allowlist 空で、「テストからしか到達しないモジュール」を orphan として落とす。`reservations/_lib/suggested-refund-amount.ts` は `[id]/page.tsx` が import するので到達するが、Step 1 で page.tsx の差し替えを忘れると pre-push で落ちる。

4. **推奨額が 0 になるケースの UI（低・振る舞い変化）。** 既に取り分以上を返金済みの予約では推奨額が 0 になり、「ポリシー推奨額: ¥0」＋「推奨額を使用」が表示される。押すと `amountStr = "0"` になり `RefundDialog.tsx:124` の `parsed <= 0` で「金額は 1 以上の整数で入力してください。」が出る。誤返金は起きないがメッセージは不親切。**この PR では直さない**（推奨額の値を正すのが本題で、0 のときにボタンを隠すかどうかは別の要件判断）。範囲外として PR 本文に報告する。

5. **`totalPriceWithTax` が null の予約（低）。** 型は `number | null`（schema 上は NOT NULL だが `ReservationWithRelations` は null 許容）。`?? 0` で 0 になり推奨額 0。これは現行の `totalPrice ?? 0` と同じ扱いで、振る舞いの後退は無い。

6. **なし:** RefundDialog / ReservationDetail / events 側（`EventRegistrationTable.tsx:439-448` は `suggestedAmount` を渡していない）には一切触れないので、`refund-dialog.test.tsx` と `event-registration-table.test.tsx` は影響を受けない。

#### Task 3 — 個人区分の顧客を保存すると会社名が無言で null 上書きされる

- **CORPORATE → PERSONAL に切り替えてから保存したとき**、切替直前に入力欄へ打ち込んでいた文字列ではなく DB の既存値（`customer.companyName`）が保存される。hidden の value を `customer.companyName ?? ""` に固定しているため。PERSONAL では会社名の入力欄が存在しない以上、直前の打鍵を採用する根拠が無いのでこの形にした。採らなかった案: `useInputControl(fields.companyName)` を足して control.value を hidden に流す形。打鍵を引き継げるが、PERSONAL では編集不能な値のために 6 本目の control を増やすことになり、`useInputControl` は identity が不安定で effect 依存に入れると無限ループを起こす既知の罠があるため見送った。
- **conform の重複キー畳み込み**（上記 corrections 1）。実装時に hidden input をうっかり条件の外へ出すと、PERSONAL のテストは緑のまま CORPORATE 保存だけが「会社名: Invalid input」で落ちる。今回のテスト 1 本ではこの回帰を捕まえられない（1 振る舞い 1 テストの規約に従い CORPORATE 側のテストは書かない）。Step 3 のコメントで構造的に防いでいる。
- **`customerFormSchema` に法人必須 refine が無い**（`requireCompanyNameForCorporate` は `customer-profile.ts` / `inquiry.ts` / `public-reservation.ts` だけで使われる）。CORPORATE で会社名を空にしたまま保存できる状態は今回変わらない。範囲外なので触らない。
- 既存テストへの影響は無い見込み。`CustomerEditForm` を参照するテストは `__tests__` にも `e2e` にも 0 件で、`__tests__/integration/actions/admin/customer.action-shape.test.ts` は `updateCustomerStatus` / `updateCustomerNotes` / `toggleCustomerActive` / `anonymizeCustomer` / `mergeCustomers` のみを対象にしており form 経路の `updateCustomer` は含まない。
- テストが実 DB や外部 I/O を触らない純粋な JSDOM render のため、serial DB バケット判定の marker は不要。

#### Task 4 — CONFLICT 後の router.refresh() が「古い入力 + 新しいトークン」を作り他人の変更を上書きする

- **保存成功の直後、同じ mount のまま 2 回目を保存すると CONFLICT になる**（token が mount 時のまま、DB 側の `updatedAt` は進んでいるため）。トーストは「ページを再読み込みしてください」。復旧はページ再読み込み、またはタブを切り替えて戻す（Radix Tabs が非アクティブタブを unmount するので remount で新しい prop から再初期化される）。conform を使う 4 セクションは既にこの挙動なので、設定ページ全体としては一貫する方向。**これが受け入れられないなら、Server Action に新しい `organizationUpdatedAt` を返させて成功時だけ token を進める設計になり、domain (`organization.ts`) と `__tests__/unit/domain/settings/commands.test.ts` まで波及する別 PR になる。**
- CONFLICT 後の `router.refresh()` を残すので、CONFLICT 直後にタブを切り替えて戻ると「新しいデータ・新しい token」で再開できる。これは意図した挙動だが、ユーザーには案内していない（トーストは再読み込みを促す）。挙動を変える意図はないので新しい UI 文言は足さない。
- テストが `@/admin/components/ui` を丸ごとスタブするため、実 UI 側（Radix Select / Switch の props 名）が変わってもこのテストは気づかない。ここで固定したいのは token の受け渡しだけなので許容する。
- `Serialized<SettingsData>` への 1 箇所の `as unknown as` cast（テストファイル内のみ）。`__tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts` は `as unknown as FieldMetadata` のみ・`src/` のみを走査するので抵触しない。
- 既存の gate・domain テスト・server action は一切触らないので、壊れうる既存の振る舞いは上記の「連続保存」だけ。

#### Task 5 — イベント一斉配信: Resend 未設定だと 1 通も送らずに「送信しました」と出て本文が消える

- **監査ログが残らなくなる。** `executeAdminMutationResult` は成功時にしか `logAction` を撃たない（`admin-action.ts:136`）ので、throw すると「配信を試みた」記録が AuditLog に残らない。0 通しか送っていないのに `event/update` の監査行が残るほうが誤りなので意図的な変更だが、「失敗した配信操作の痕跡が消える」点は運用上の非対称として認識しておく。
- **rate limit は消費済みのまま失敗する。** `eventBroadcastRateLimiter.check` は送信より前（`event-broadcast.ts:67-72`）なので、Resend 未設定のまま再送を繰り返すと制限に当たる。従来と同じ挙動だが、エラーが見えるようになったぶん再送されやすくなる。
- **部分失敗は今まで通り成功扱い。** 宛先 5 件のうち 1 件だけ送れた場合 `sent > 0` なので成功 toast が出る。監査の要求範囲外なので変更しない。
- **宛先 0 件は今まで通り成功扱い。** 画面が「配信対象 N 名」と出しているのに recipients が 0 のケース（corrections の別件）では、依然として 0 通で成功 toast が出る。この PR では埋めない。
- 既存 unit test への影響なし。`__tests__/unit/actions/event-broadcast.test.ts:197` / `:221` の 2 本は `ok:true, sent:0` を mock しているが、既定 payload の `recipients` が `[]`（`:130`）なので新しい条件に掛からない。特に `:197` の test は `mockExecuteAdminMutationResult` が try/catch を持たないため、もし throw する設計にしていたら DomainError がテスト本体まで伝播して落ちていた — `recipients.length > 0` を条件に入れたことでこれを回避している。

#### Task 6 — 顧客一括メール: Resend 未設定だと全員が「配信停止済み」として除外表示され成功 toast が出る

- **operator から見た振る舞いが変わる。** Resend 未設定の環境で一括メール送信を押すと、これまでの緑 toast（「N件除外(配信停止済み)」）が赤の error toast（「メール送信が無効です。連携設定…」）になる。これが本タスクの目的だが、「今まで成功していたのに失敗するようになった」と誤解される可能性はある。PR 本文に「元から 1 通も送っていない」と明記すること。
- **エラー時にダイアログが閉じない。** `CustomerBulkActions.tsx:128-131` の error 分岐は `setEmailDialogOpen(false)` を通らずに return するため、`CustomerBulkEmailDialog` は開いたままになる。これはレート制限・RBAC 拒否など既存の全 error 経路と同じ挙動なので新たな不整合は生まない（変更しない）。
- **`sendCustomerBroadcast` の disabled 戻り値から `sent` / `excluded` が消える。** grep 済みで呼び出し元は `bulk.ts:286` の 1 箇所のみ。`__tests__/support/email-dispatch-mock.ts:14` の stub は `ok: true` を返すので新しい union に適合し、その利用者 2 本（`__tests__/integration/actions/public/inquiry.test.ts:86` / `__tests__/integration/domain/customers/ghost-inquiry-linking.test.ts:46`）は broadcast 経路を実行しない。
- **UI 文言 `配信停止済み` → `配信同意なし`。** この文字列を assert しているテスト・E2E は grep で 0 件（唯一の出現箇所が `CustomerBulkActions.tsx:136` 自身）。壊れるものは無いが、スクリーンショットを含む Visual テストが将来足された場合は差分になる。
- **カバーしていない範囲。** 追加するテストは action 層のみで、`dispatch.ts` が実際に `{ok:false, reason:"disabled"}` を返すことは型（明示戻り値注釈）と `bun run validate` の type-check でしか担保しない。domain 層の実 DB テストは追加しない（1 振る舞い 1 テストの規約に従う）。

#### Task 7 — 予約詳細の「キャンセル日時」だけ整形されず UTC の生 ISO 文字列が表示される

なし。

- 描画されるのは `status === CANCELLED` かつ `cancelledAt` が truthy のときだけで、この条件を満たすケースを render している既存テスト・E2E は 0 件（`キャンセル日時` の grep が `__tests__/` `e2e/` で 0 件、fixture も `cancelledAt: null` 固定）。表示文言に依存している検査が無いので回帰しようがない。
- `formatDateTimeFull` は `timeZone: "Asia/Tokyo"` 固定（date-format.ts:57）なので、client component で描いてもサーバ (UTC) とブラウザ (JST) で文字列が変わらず、hydration 不整合 (React #418) は起きない。同じ理由で 433-445 行が既にこの関数を使っている。
- `cancelledAt` が空文字列のときの挙動は 641 行のガードを残すため変わらない（従来どおり非描画）。
- ESLint / type-check への影響なし（実測: lint 違反ゼロ、`string | null` は `formatDateTimeFull` の引数型に代入可能）。

#### Task 8 — イベント詳細の「参加者一覧（N名）」が申込行数を表示していて実人数と一致しない

- **`confirmedCount` の意味が変わる（行数 → 人数）。** ただし読み手は `page.tsx:117` の 1 箇所のみで、そこは「名」表示なので意味変更こそが修正。他に読んでいるコードは無い（全文 grep 済み）。API レスポンスや CSV には出ていない。
- **クエリが `count` → `aggregate` に変わる。** 同一 where・同一テーブルの集約なので実行計画・コストはほぼ同じ。`Promise.all` の 3 本並列も変わらない。
- **`_sum.quantity` は `number | null`。** 0 件のとき null になるので `?? 0` が必須。落とすと見出しが「参加者一覧（null名）」になる。同じパターンが `registration-queries.ts:398` に既存。
- **integration テストの共有 test-db。** 追加テストは `createFixtureEvent()` で毎回一意な event / slot / ticket を作り、`finally` で `cleanupFixture` するため他ファイルと衝突しない。CONFIRMED 合計 9 ≦ slot capacity 10 なので DEFERRABLE 容量 trigger には触れない。ファイル先頭で `DATABASE_URL` を上書きしている marker があるので serial バケットに入る（`scripts/run-tests.ts:16-20`）。
- 監査には無いが実装時に踏みうる罠: `bun run test:unit -- <file>` では絞れない（引数が追記されるだけ）。単一ファイルは `bun run test -- <path>`。素の `bun test` は hook が deny する。
