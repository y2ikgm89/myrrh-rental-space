# Space Description Lexical 移行 実装計画

> **For agentic workers:** `superpowers:executing-plans` で順次実行。`- [ ]` はタスク進捗。

**Goal:** `Space.description`（plain text）を Lexical エディタ管理（JSON + HTML + プレーン派生）にクリーンに置き換える。後方互換性なし、破壊的変更 OK。

**Architecture:**

- DB: `description String` を廃止し、News/Post と同じ `descriptionJson Json` + `descriptionHtml String @db.Text` に加え、SEO/カード表示用 `descriptionPlainText String @db.Text` の 3 カラム構成にする。
- Server Action: フォームから `descriptionJson` を受け取り、`renderEditorStateToHtmlLazy` で HTML を、HTML から `stripHtmlToText` でプレーンを生成して 3 カラム同時保存。既存の `renderDescriptionHtml`/`buildSpaceCommandInput` 互換シムは削除。
- Admin UI: `SpaceEditBasicTabPanel` の Textarea を `LazyLexicalEditor`（RHF `useController`）に置換。
- Public: 詳細ページは `SanitizedHtml` + `descriptionHtml`、一覧・カード・OG/JSON-LD は `descriptionPlainText`。
- Seed: デフォルトの段落 1 ノードを組み立てるヘルパーで 3 カラム分の値を生成。
- Migration: `prisma migrate reset` + re-seed（dev 前提。production は別ファイルで対応予定）。

**Tech Stack:** Next.js 16 / Prisma 7 / Lexical 0.43 / React 19.2 / Zod 4

---

## ファイル構成（Create / Modify）

**Create:**

- `src/shared/lib/lexical/description-defaults.ts` — 空ドキュメント定数・プレーンテキストからの Lexical JSON 生成ヘルパー（seed / migration 用）
- `src/shared/lib/lexical/html-to-plain-text.ts` — 純粋関数版 HTML → プレーンテキスト変換（タグ剥ぎ + 改行正規化 + 前後トリム）
- `prisma/migrations/<timestamp>_space_description_lexical/migration.sql` — `prisma migrate dev` 自動生成

**Modify:**

- `prisma/schema.prisma` — `Space.description` 削除、3 カラム追加
- `prisma/seed.ts` — スペース description を新ヘルパー経由に差し替え
- `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts` — Zod スキーマ & 型 & デフォルト値
- `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts` — 旧 `renderDescriptionHtml`/`buildSpaceCommandInput` を削除、3 カラム生成ロジックに差し替え
- `src/shared/domain/spaces/commands.ts` — `SpaceCommandInput`、`buildSpaceData`
- `src/shared/domain/spaces/queries.ts` — admin 用 `select`
- `src/shared/domain/spaces/public-queries.ts` — 公開用 `select`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts` — フォーム type（`descriptionJson`）
- `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/basic-tab-panel.tsx` — Lexical 化
- `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditForm.tsx` — 編集時の初期値
- `src/admin/lib/space-form-data-codec.ts` — FormData codec（descriptionJson）
- `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx` — `descriptionPlainText` 表示
- `src/app/(admin)/admin/(dashboard)/spaces/_components/space-table-desktop.tsx` — `descriptionPlainText`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx` — `descriptionPlainText`
- `src/app/(public)/spaces/[slug]/_components/space-info.tsx` — `SanitizedHtml` + `descriptionHtml`
- `src/app/(public)/spaces/[slug]/page.tsx` — metadata / JSON-LD に `descriptionPlainText`
- `src/app/(public)/spaces/_components/space-grid.tsx` — `descriptionPlainText`
- `src/app/(public)/_components/SpaceListSection.tsx` — `descriptionPlainText`
- `src/app/(public)/_components/SpaceShowcaseSection.tsx` — `descriptionPlainText`
- `src/app/(public)/reservation/_components/space-detail-dialog.tsx` — `descriptionPlainText`
- `src/app/(public)/spaces/[slug]/_components/related-spaces.tsx` — 必要に応じ `descriptionPlainText`
- `__tests__/unit/lib/validations/space.test.ts`（存在すれば）& seed / commands テスト — 3 カラム化に追従

---

## Task 1: Lexical ドキュメントヘルパー

**Files:**

- Create: `src/shared/lib/lexical/description-defaults.ts`
- Create: `src/shared/lib/lexical/html-to-plain-text.ts`

- [ ] **Step 1: プレーンテキスト抽出ヘルパーを作成**

`src/shared/lib/lexical/html-to-plain-text.ts`:

```typescript
/**
 * HTML から表示用プレーンテキストを抽出する（SEO description / カード要約用）。
 * - タグを剥がす
 * - `<br>` / ブロック要素境界を空白に
 * - 連続空白を 1 つに
 * - 前後トリム
 * - 最大文字数で丸める（任意）
 */
export function stripHtmlToText(html: string, maxLength?: number): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<(br|\/(p|div|h[1-6]|li|ul|ol|blockquote|pre))\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
  const normalized = decoded.replace(/\s+/g, " ").trim();
  if (maxLength !== undefined && normalized.length > maxLength) {
    return `${normalized.slice(0, maxLength - 1)}…`;
  }
  return normalized;
}
```

- [ ] **Step 2: Lexical 空ドキュメント & プレーン → JSON ヘルパーを作成**

`src/shared/lib/lexical/description-defaults.ts`:

```typescript
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

export { EMPTY_LEXICAL_EDITOR_STATE_JSON };

/**
 * 単一段落の Lexical EditorState JSON を生成する（seed / 初期値用）。
 * 空文字の場合は EMPTY_LEXICAL_EDITOR_STATE_JSON を返す。
 */
export function buildParagraphEditorStateJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  return JSON.stringify({
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              text: trimmed,
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              version: 1,
            },
          ],
        },
      ],
    },
  });
}

/**
 * 単一段落を HTML に整形（seed / migration 用）。
 */
export function buildParagraphHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<p>${escaped}</p>`;
}
```

※ `EMPTY_LEXICAL_EDITOR_STATE_JSON` は既存 `src/shared/lib/validations/lexical.ts` で定義済み（Lexical editor が空本文で使う定数）。未定義であれば同ファイルに追加する。

- [ ] **Step 3: `bun run type-check` で構文確認**

```
bun run type-check
```

期待: 既存型は変えていないため変更なし。新ファイルはまだ import されていないので warning なし。

- [ ] **Step 4: コミット**

```bash
git add src/shared/lib/lexical/description-defaults.ts src/shared/lib/lexical/html-to-plain-text.ts
git commit -m "feat(lexical): add description document helpers"
```

---

## Task 2: Prisma スキーマの破壊的変更

**Files:**

- Modify: `prisma/schema.prisma:423` 周辺

- [ ] **Step 1: `Space.description` を削除し 3 カラムを追加**

`prisma/schema.prisma` の Space モデルで `description String @db.Text` 行を次に置き換える:

```prisma
  /// Lexical EditorState JSON（正本）
  descriptionJson      Json
  /// Lexical → 公開表示用 HTML キャッシュ（SanitizedHtml で出力）
  descriptionHtml      String   @db.Text
  /// SEO description / カード要約 / メタデータ用プレーンテキスト派生
  descriptionPlainText String   @db.Text
```

- [ ] **Step 2: DB リセット（破壊的）とマイグレーション生成**

ユーザーに確認メッセージを出した上で:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="space description lexical migration" bunx --bun prisma migrate reset --force --skip-seed
bunx --bun prisma migrate dev --name space_description_lexical
```

期待: `prisma/migrations/<ts>_space_description_lexical/migration.sql` が生成される。

- [ ] **Step 3: Prisma Client 再生成を確認**

```bash
bun run db:generate
```

期待: `generated/prisma/client` が更新される。

- [ ] **Step 4: コミット（seed が壊れる前にスキーマだけ先にコミットしない）**

このタスクは Task 3（seed 更新）と同一コミット予定。ここではコミットしない。

---

## Task 3: Seed 更新

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seed でスペースを作成している箇所の description を新カラム 3 つに置き換え**

対象例:

```typescript
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "../src/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "../src/shared/lib/lexical/html-to-plain-text";

const description =
  "渋谷駅徒歩5分の便利な立地にある、10名まで収容可能な会議室です。...";
const descriptionHtml = buildParagraphHtml(description);

await prisma.space.create({
  data: {
    // ...
    descriptionJson: JSON.parse(buildParagraphEditorStateJson(description)),
    descriptionHtml,
    descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
    // ...
  },
});
```

※ seed は `@/shared/db/prisma` を import しないルール（server-only）のため、相対 import にする。`buildParagraphEditorStateJson` は string なので Prisma `Json` 列にはパース後のオブジェクトを渡す。

- [ ] **Step 2: `bun prisma/seed.ts` 実行**

```bash
bun prisma/seed.ts
```

期待: スペース全件が新カラムで投入される。

- [ ] **Step 3: Task 2 + Task 3 をコミット**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts
git commit -m "feat(space): migrate description to Lexical (json+html+plain)"
```

---

## Task 4: ドメインコマンド更新

**Files:**

- Modify: `src/shared/domain/spaces/commands.ts`
- Modify: `src/shared/domain/spaces/queries.ts`
- Modify: `src/shared/domain/spaces/public-queries.ts`

- [ ] **Step 1: `SpaceCommandInput` を 3 カラム対応に変更**

`commands.ts`:

```typescript
import type { Prisma } from "@generated/prisma/client";

type SpaceCommandInput = {
  // description を削除
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  // ...他はそのまま
};

function buildSpaceData(input: SpaceCommandInput, publishedAt: Date | null) {
  return {
    // description: input.description, を削除
    descriptionJson: input.descriptionJson,
    descriptionHtml: input.descriptionHtml,
    descriptionPlainText: input.descriptionPlainText,
    // ...他はそのまま
  };
}
```

- [ ] **Step 2: `queries.ts` / `public-queries.ts` の `select` を置換**

旧 `description: true` を次に置き換える:

```typescript
descriptionJson: true,
descriptionHtml: true,
descriptionPlainText: true,
```

※ `SpaceWithStats` など戻り値型も Task 5 で合わせて更新する。

- [ ] **Step 3: `bun run type-check`（この時点で Task 5 未完了のためエラーあり。Task 7 まで通しで進める）**

---

## Task 5: Zod スキーマ & 型更新

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`

- [ ] **Step 1: `spaceFormSchema.description` を `descriptionJson` に変更**

```typescript
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";

// spaceFormSchema の .object({...}) 内:
descriptionJson: lexicalJsonSchema,
// 旧 description 行を削除
```

- [ ] **Step 2: `defaultSpaceFormValues` / `SpaceWithStats` を更新**

```typescript
export const defaultSpaceFormValues: SpaceFormInput = {
  // ...
  descriptionJson: EMPTY_LEXICAL_EDITOR_STATE_JSON,
  // description: "" を削除
  // ...
};

export type SpaceWithStats = {
  // description: string; を削除
  descriptionJson: unknown; // Client 境界では Symbol 付きなので toPlainObject 済み想定
  descriptionHtml: string;
  descriptionPlainText: string;
  // ...
};
```

※ `descriptionJson` の Client 側型は `unknown` で十分（表示では使わず、編集時のみ文字列化して Lexical に戻す）。

---

## Task 6: Server Action 書き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`

- [ ] **Step 1: `renderDescriptionHtml` / `buildSpaceCommandInput` を削除し、直接 3 カラムを生成**

```typescript
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";

async function buildSpaceCommandInput(data: SpaceFormData) {
  const descriptionHtml = await renderEditorStateToHtmlLazy(
    data.descriptionJson,
  );
  const descriptionPlainText = stripHtmlToText(descriptionHtml, 200);
  return omitUndefined({
    ...data,
    descriptionJson: JSON.parse(data.descriptionJson) as Prisma.InputJsonValue,
    descriptionHtml,
    descriptionPlainText,
  });
}
```

※ `createSpace` / `updateSpace` 側の呼び出しはそのまま。旧 `renderDescriptionHtml`・プレーンテキスト / Lexical 判定分岐・`lexicalJsonSchema.safeParse` 互換シムを完全削除。`import` も不要分を削除。

---

## Task 7: FormData codec 更新

**Files:**

- Modify: `src/admin/lib/space-form-data-codec.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/schema.ts`

- [ ] **Step 1: codec の description → descriptionJson rename**

`codec` 側で `FormData` key を `description` → `descriptionJson` に置換。シリアライズ時もそのまま string として `append`。

- [ ] **Step 2: `schema.ts` の `SpaceEditFormData` 型確認**

`z.infer<typeof spaceFormSchema>` を使っているなら自動追従。ローカル宣言があれば `description` → `descriptionJson: string` に変更。

---

## Task 8: 管理フォーム UI を Lexical 化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/basic-tab-panel.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/SpaceEditForm.tsx`

- [ ] **Step 1: Textarea を `LazyLexicalEditor` + `useController` に置換**

`basic-tab-panel.tsx`:

```typescript
import { useController } from "react-hook-form";
import { LazyLexicalEditor } from "@/admin/components/editor/lexical/LazyLexicalEditor";

// existing props に加え:
const { field: descriptionField, fieldState: descriptionFieldState } =
  useController({ control, name: "descriptionJson" });
```

JSX 置換:

```tsx
<div className="space-y-2">
  <Label htmlFor="descriptionJson">説明 *</Label>
  <div className="min-h-[360px] overflow-hidden rounded-lg border border-border">
    <LazyLexicalEditor
      contentJson={descriptionField.value}
      onChange={(json) =>
        descriptionField.onChange(json, { shouldDirty: true })
      }
      height="360px"
      placeholder="スペースの説明を入力..."
      showInspector={false}
    />
  </div>
  {descriptionFieldState.error && (
    <p className="text-sm text-destructive">
      {descriptionFieldState.error.message}
    </p>
  )}
</div>
```

※ 旧 `register("description")` / `errors.description` / `Textarea` import を削除。`useController` の `onChange` は RHF の `field.onChange` を使う（第 2 引数はサポート対象外のため `setValue` ラッパーに変更する場合は別途調整）。

実装上の簡略化: `onChange={descriptionField.onChange}` でも RHF が `isDirty` を自動管理するため OK。

- [ ] **Step 2: `SpaceEditForm.tsx` の編集時初期値を `space.descriptionJson` から取得**

```typescript
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/lexical/description-defaults";

descriptionJson:
  typeof space.descriptionJson === "string"
    ? space.descriptionJson
    : JSON.stringify(space.descriptionJson ?? EMPTY_LEXICAL_EDITOR_STATE_JSON),
```

DB から取得した `descriptionJson` は `unknown`（JSON object）。フォームには string で渡す必要があるため `JSON.stringify` する。

---

## Task 9: 管理画面の表示側（Detail / Table）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-table-desktop.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx`

- [ ] **Step 1: 詳細ページで `descriptionHtml` を `SanitizedHtml` で表示**

```tsx
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
// ...
<SanitizedHtml
  html={space.descriptionHtml}
  className="prose prose-sm max-w-none"
/>;
```

- [ ] **Step 2: テーブルカラムを `descriptionPlainText` に置換**

`truncate` と `line-clamp-2` で既存表示を維持。

---

## Task 10: 公開ページの表示側

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/_components/space-info.tsx`
- Modify: `src/app/(public)/spaces/[slug]/page.tsx`
- Modify: `src/app/(public)/spaces/_components/space-grid.tsx`
- Modify: `src/app/(public)/_components/SpaceListSection.tsx`
- Modify: `src/app/(public)/_components/SpaceShowcaseSection.tsx`
- Modify: `src/app/(public)/reservation/_components/space-detail-dialog.tsx`

- [ ] **Step 1: 詳細ページの `SpaceInfo` を `SanitizedHtml` + `descriptionHtml` に変更**

```tsx
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";

{
  space.descriptionHtml ? (
    <div>
      <Heading level={2} className="mb-4">
        スペースについて
      </Heading>
      <Prose>
        <SanitizedHtml html={space.descriptionHtml} />
      </Prose>
    </div>
  ) : null;
}
```

props 型の `description: string | null` を `descriptionHtml: string` に変更。`<p>{space.description}</p>` を削除。

- [ ] **Step 2: `page.tsx` の metadata / JSON-LD で `descriptionPlainText` を使用**

```typescript
description:
  space.ogpDescription ??
  space.metaDescription ??
  space.descriptionPlainText ??
  undefined,
// ...
<ProductJsonLd
  // ...
  description={space.descriptionPlainText || space.name}
  // ...
/>
```

- [ ] **Step 3: 一覧・カード・ダイアログで `descriptionPlainText` を表示**

`space-grid.tsx` / `SpaceListSection.tsx` / `SpaceShowcaseSection.tsx` / `space-detail-dialog.tsx` の `space.description` を `space.descriptionPlainText` に置換。型定義も同様に更新。

---

## Task 11: テスト更新 & 検証

**Files:**

- Modify: 既存の関連テスト（`__tests__/integration/actions/admin/*.test.ts`、`__tests__/unit/domain/spaces/*.test.ts` など）

- [ ] **Step 1: 既存テストで `description: "..."` を使っている箇所を 3 カラム + ヘルパーに置換**

```typescript
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";

const descriptionHtml = buildParagraphHtml("テスト説明テキスト");
const fixture = {
  // ...
  descriptionJson: buildParagraphEditorStateJson("テスト説明テキスト"),
  descriptionHtml,
  descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
};
```

- [ ] **Step 2: `stripHtmlToText` のユニットテスト追加**

`__tests__/unit/lib/lexical/html-to-plain-text.test.ts`（新規）:

```typescript
import { describe, expect, test } from "bun:test";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";

describe("stripHtmlToText", () => {
  test("タグを剥がす", () => {
    expect(stripHtmlToText("<p>hello <strong>world</strong></p>")).toBe(
      "hello world",
    );
  });
  test("改行を空白に", () => {
    expect(stripHtmlToText("<p>a</p><p>b</p>")).toBe("a b");
  });
  test("連続空白を 1 つに", () => {
    expect(stripHtmlToText("<p>a   b</p>")).toBe("a b");
  });
  test("エンティティをデコード", () => {
    expect(stripHtmlToText("<p>a &amp; b</p>")).toBe("a & b");
  });
  test("maxLength で丸める", () => {
    expect(stripHtmlToText("<p>abcdef</p>", 4)).toBe("abc…");
  });
  test("空文字で空を返す", () => {
    expect(stripHtmlToText("")).toBe("");
  });
});
```

`__tests__/unit/lib/lexical/description-defaults.test.ts`（新規）:

```typescript
import { describe, expect, test } from "bun:test";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";

describe("description-defaults", () => {
  test("空文字は EMPTY_LEXICAL_EDITOR_STATE_JSON", () => {
    expect(buildParagraphEditorStateJson("")).toBe(
      EMPTY_LEXICAL_EDITOR_STATE_JSON,
    );
  });
  test("段落 1 つを含む JSON を返す", () => {
    const json = JSON.parse(buildParagraphEditorStateJson("hello"));
    expect(json.root.children[0].type).toBe("paragraph");
    expect(json.root.children[0].children[0].text).toBe("hello");
  });
  test("HTML エスケープを行う", () => {
    expect(buildParagraphHtml("<script>")).toBe("<p>&lt;script&gt;</p>");
  });
});
```

`package.json` の `test` スクリプトに `bun test __tests__/unit/lib/lexical` バッチを追加（既存 `__tests__/unit/lib/lexical/...` バッチがあれば不要）。

- [ ] **Step 3: `bun run validate`**

```bash
bun run validate
```

期待: 型チェック・lint ともにパス。

- [ ] **Step 4: `bun run test:unit`**

```bash
bun run test:unit
```

期待: 全テストパス。

- [ ] **Step 5: `bun run build`**

```bash
bun run build
```

期待: 完全ビルドパス（`SKIP_ENV_VALIDATION` 不要なら検証込み）。

- [ ] **Step 6: 最終コミット**

```bash
git add -A
git commit -m "feat(space): rewrite description editing as Lexical rich-text"
```

---

## Self-Review チェックリスト

- [ ] Spec 「破壊的変更 OK」「後方互換性なし」「クリーン実装」— 旧 `description` カラム・`renderDescriptionHtml`/`buildSpaceCommandInput` シムを完全削除した
- [ ] `Space.description` への参照がソース全体でゼロ（`grep "\.description\b"` で残存なし）
- [ ] `descriptionJson` は Lexical `lexicalJsonSchema` でバリデーション
- [ ] `descriptionHtml` は `renderEditorStateToHtmlLazy` で生成、公開側は `SanitizedHtml` で出力
- [ ] `descriptionPlainText` は HTML から派生、SEO / OG / JSON-LD / カードで使用
- [ ] seed / テスト / FormData codec / 管理 UI / 公開 UI / メタデータ すべて追従
- [ ] `bun run validate && bun run build` で検証済み
