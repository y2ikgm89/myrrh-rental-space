> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Admin Pages Beginner-Friendly Editor — Design Spec

**日付**: 2026-04-23
**対象プラン**: `docs/superpowers/plans/2026-04-23-admin-pages-beginner-ux.md`
**関連**: `/admin/pages/[slug]/edit`・`src/shared/lib/sections/**`

---

## 1. 問題設定

現状の `/admin/pages/[slug]/edit` は「各セクションの Zod スキーマを flat に全フィールド展開してフォーム化」する設計のため、初心者には以下のノイズが多い:

1. **コンテンツ（テキスト・画像）とデザイン（余白・配置・背景）が同列に並ぶ** — 「見出しを変えたいだけ」のときも overlay opacity やバリエーションの select が視界に入る。
2. **フィールドラベルが schema 由来の英語的表現（"Heading" / "CTA Primary Label"）** — 日本語運用者には不親切。
3. **Field metadata が `.describe(JSON.stringify(meta))` 独自方式** — Zod 4 公式の `.meta()` + `z.registry<T>()` タイプセーフ API から乖離しており、JSON parse fallback で型安全性が弱い。
4. **画像フィールドのサムネイルが 64×64 と小さく、Drag & Drop 非対応** — 現代の CMS UX に劣後（Sanity / Contentful は 120×120 以上 + D&D 標準）。

エンタープライズ headless CMS（[Payload](https://payloadcms.com/docs/fields/collapsible)・[Sanity](https://www.sanity.io/docs/studio/field-groups)・[Gutenberg](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)）の共通パターン「presentational fields と data fields の分離」「collapsible で Content / Design / Advanced を階層化」「WAI-ARIA Accordion 準拠」を採用して解決する。

---

## 2. スコープ

### In-scope

- `src/shared/lib/sections/field-registry.ts` — Zod 4 公式 `z.registry<FieldMeta>()` ベースの field metadata 基盤（新設）
- `FieldMeta.group` 必須追加（`"content" | "design" | "advanced"`）
- `field-helpers.ts` 削除（`withMeta` / `extractFieldMeta` / `field` すべて `field-registry` に移行）
- 22 セクション定義（`src/shared/lib/sections/definitions/**/schema.ts`）を registry API に書き換え
- `zod-introspection.ts` を `fieldRegistry.get()` 直接参照に書き換え
- `AutoSectionForm` を Radix Accordion（type="multiple"）で Content / Design / Advanced の 3 層化
- `AutoImageField` をサムネイル 160×120 + Drag & Drop + hover overlay に強化
- 22 セクション定義のフィールドラベルを日本語 UX フレンドリーに揃える

### Out-of-scope

- ライブビジュアルエディタ（contentEditable 経由のインラインテキスト編集）— IME 互換性リスクと工数により別案件
- `SectionVariation` プリセット機構 — 効果測定後に別プランで検討
- ページテンプレート機能（新規ページ作成時の雛形）— 同上
- 公開ページのレイアウト・デザイン変更 — 本 spec は admin UI のみ対象
- DB スキーマ変更 — `Section.config` JSON 構造は変更なし

---

## 3. 設計

### 3.1 Field Registry（Phase 1）

**Zod 4 公式パターン準拠**。`z.registry<T>()` で型安全に metadata を添付する。

```ts
// src/shared/lib/sections/field-registry.ts
import { z } from "zod";

export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly suffix?: string;
  readonly group: "content" | "design" | "advanced";
}

export const fieldRegistry = z.registry<FieldMeta>();

export const field = {
  text(
    label: string,
    opts?: {
      placeholder?: string;
      helpText?: string;
      default?: string;
      group?: FieldMeta["group"];
    },
  ) {
    return z
      .string()
      .default(opts?.default ?? "")
      .register(fieldRegistry, {
        fieldType: "text",
        label,
        group: opts?.group ?? "content",
        ...(opts?.placeholder !== undefined && {
          placeholder: opts.placeholder,
        }),
        ...(opts?.helpText !== undefined && { helpText: opts.helpText }),
      });
  },
  // text / textarea / number / boolean / select / color / image / url / icon / array / group 各ヘルパー同型
};
```

**削除**:

- `src/shared/lib/sections/field-helpers.ts`（`withMeta` / `extractFieldMeta` / `field` object 全て）

**書き換え**:

- `zod-introspection.ts` — `extractSchemaFields` 内の `extractFieldMeta(schema)` 呼び出しを `fieldRegistry.get(schema)` に差し替え
- 22 セクション `schema.ts` — `import { field } from "../../field-helpers"` → `import { field } from "../../field-registry"`
- すべての `field.xxx(label)` 呼び出しの第 2 引数に `group` を追加（省略時 `"content"` デフォルト）

### 3.2 Field Group 設計

| group        | 例                                                                     | 既定表示                         |
| ------------ | ---------------------------------------------------------------------- | -------------------------------- |
| `"content"`  | タイトル・サブタイトル・本文・画像・ボタンテキスト・リンク先・動画 URL | 常時展開（Accordion 外）         |
| `"design"`   | バリエーション・高さ・オーバーレイ・配置・列数・カラー                 | Accordion 折りたたみ（既定閉じ） |
| `"advanced"` | 表示件数 / sort / filter / カスタム CSS class / 公開フラグ             | Accordion 折りたたみ（既定閉じ） |

**振り分けルール**（ADR 扱い）:

- **content**: 運用者が最も頻繁に変える。テキスト・画像・リンク先・ボタン文言
- **design**: 見た目の調整。variant / overlay / layout / color / height
- **advanced**: 表示制御・件数・sort・filter・カスタム class

### 3.3 AutoSectionForm リデザイン（Phase 2）

[WAI-ARIA Accordion Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) 準拠、Radix Accordion `type="multiple"` で複数同時展開を許容（Sanity fieldsets と同等）。

```tsx
<form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
  {/* Content セクション — 常時展開（Accordion 外） */}
  <div className="space-y-4">
    {contentFields.map((f) => (
      <AutoField key={f.key} {...f} />
    ))}
  </div>

  {/* Design + Advanced — Radix Accordion（既定閉じ） */}
  {(designFields.length > 0 || advancedFields.length > 0) && (
    <Accordion type="multiple" className="border-t pt-4">
      {designFields.length > 0 && (
        <AccordionItem value="design">
          <AccordionTrigger>デザイン</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            {designFields.map((f) => (
              <AutoField key={f.key} {...f} />
            ))}
          </AccordionContent>
        </AccordionItem>
      )}
      {advancedFields.length > 0 && (
        <AccordionItem value="advanced">
          <AccordionTrigger>詳細設定</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            {advancedFields.map((f) => (
              <AutoField key={f.key} {...f} />
            ))}
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  )}
  <FormActions
    isDirty={isDirty}
    isPending={isPending}
    onDirtyChange={onDirtyChange}
  />
</form>
```

**分離ロジック**:

```ts
const contentFields = fields.filter((f) => f.meta.group === "content");
const designFields = fields.filter((f) => f.meta.group === "design");
const advancedFields = fields.filter((f) => f.meta.group === "advanced");
```

**A11y 要件**:

- `aria-expanded` / `aria-controls` は Radix が自動付与
- キーボード操作（Tab / Shift+Tab / Enter / Space）も Radix が自動処理
- 見出しは `<h3>`（セクション編集カード内の `<h2>` 直下）

### 3.4 AutoImageField 強化（Phase 3）

現状:

- サムネイル 64×64
- 「選択」ボタンで MediaPicker 起動
- Drag & Drop 非対応

改善後:

- サムネイル 160×120（4:3 比率、`aspect-[4/3]`）
- Drag & Drop 領域（ファイルを直接投下してアップロード）
- 画像表示中は hover で「変更 / 削除」オーバーレイ
- URL 文字列は `text-xs text-muted-foreground truncate`（従来同様）

```tsx
<div
  className="group relative aspect-[4/3] w-40 overflow-hidden rounded-lg border border-dashed bg-muted transition-colors hover:border-primary"
  onDragOver={handleDragOver}
  onDrop={handleDrop}
>
  {value ? (
    <>
      <Image src={value} alt={label} fill className="object-cover" />
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-overlay opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={openPicker}
        >
          変更
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onSelect("")}
        >
          削除
        </Button>
      </div>
    </>
  ) : (
    <button
      type="button"
      onClick={openPicker}
      className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
    >
      <IconPhotoPlus className="h-8 w-8" />
      <span className="text-xs">画像を選択 / ドロップ</span>
    </button>
  )}
</div>
```

**Drag & Drop 実装**:

- `onDragOver` で `preventDefault` + hover 見た目
- `onDrop` で `event.dataTransfer.files[0]` を既存 `uploadMedia` Server Action 経由でアップロード
- アップロード完了後に `onSelect(url)` で URL を確定

### 3.5 ラベル日本語 UX 改善（Phase 4）

振り分け + リライトの canonical list（代表例）:

| 現状                     | 新ラベル                                | group    |
| ------------------------ | --------------------------------------- | -------- |
| `"タイトル"`             | `"見出し"`                              | content  |
| `"サブタイトル"`         | `"サブ見出し"`                          | content  |
| `"背景画像"`             | `"背景画像"`                            | content  |
| `"ボタン"`               | `"ボタン"`                              | content  |
| `"バリエーション"`       | `"レイアウトの種類"`                    | design   |
| `"高さ"`                 | `"高さ"`                                | design   |
| `"カスタム高さ (svh)"`   | `"カスタム高さ"`（suffix `svh` は維持） | design   |
| `"オーバーレイ"`         | `"画像の上に黒いオーバーレイを重ねる"`  | design   |
| `"オーバーレイ不透明度"` | `"オーバーレイの濃さ"`                  | design   |
| `"動画URL"`              | `"動画 URL"`                            | content  |
| `"表示件数"`             | `"表示件数"`                            | advanced |
| `"列数"`                 | `"1 行あたりの列数"`                    | design   |
| `"カテゴリーで絞り込む"` | 同左                                    | advanced |
| `"最新順 / 人気順"`      | `"並び順"`                              | advanced |

**リライト方針**:

- 運用者に伝わる言葉を優先（英語 Jargon 排除）
- `helpText` で補足が必要なら **平易な説明を 1 文で付与**（例: `"0% は透明、100% は完全に黒"`）
- 単位は `suffix` フィールドで表示（label に `(svh)` 等を含めない）

---

## 4. バリデーション・検証

### 4.1 自動検証

- `bun run validate` — type-check + lint
- `bun run build` — Turbopack 完全ビルド
- `bun test __tests__/unit/shared/lib/sections/field-registry.test.ts`（新規）
  - `fieldRegistry.get(schema)` が `FieldMeta` を返す
  - `group` 省略時は `"content"` デフォルト
  - 各 field ヘルパー（text / number / boolean / select / color / image / url / array / group）の metadata 形
- `bun test __tests__/unit/shared/lib/sections/zod-introspection.test.ts`（更新）
  - registry 経由で field 抽出できる
  - group 別にフィールドを分離できる

### 4.2 手動検証

- `/admin/pages/home/edit` の全セクションで Accordion が正しく分かれているか
- モバイル幅（375px）で Accordion が使えるか
- キーボード操作（Tab → Enter / Space で展開）
- スクリーンリーダー（NVDA / VoiceOver）での aria-expanded 読み上げ
- Drag & Drop で画像が即座にアップロード → プレビュー反映されるか

### 4.3 後方互換性

**なし**。既存の `.describe(JSON.stringify(meta))` 方式は完全に廃止。`field-helpers.ts` は削除。22 セクション全書き換え。

DB への影響なし（`Section.config` JSON は型変更なし）。

---

## 5. ADR 扱いの独自厳格化

以下は公式ベストプラクティスより厳しい・異なる決定。ADR 0018 として記録する。

### 5.1 FieldGroup を 3 段階固定

- Payload CMS / Sanity では collapsible / fieldset を任意個数作れる
- 本プロジェクトは `"content" | "design" | "advanced"` の 3 段階に制限
- **理由**: 22 セクションで UX 一貫性を保つため。自由度を開くと各セクションで命名・階層がバラけて「このセクションはどこを見ればテキストが変えられる？」が迷子になる

### 5.2 Content を Accordion 外に常時展開

- Sanity field groups / Payload tabs は全グループをタブで切り替える
- 本プロジェクトは content を Accordion 外に置き**常時展開**
- **理由**: 初心者の 9 割のタスクは「テキスト・画像を変える」であり、タブ操作を不要化することで認知負荷を最小化

### 5.3 Accordion type="multiple"

- Radix Accordion は `type="single"` と `type="multiple"` 両対応
- 本プロジェクトは `type="multiple"` 採用
- **理由**: design と advanced は排他でなく両方触りたい運用者ニーズがある

### 5.4 `.describe()` は廃止、`.meta()` + registry のみ

- Zod 4 は両方公式サポート
- 本プロジェクトは `.meta()` + `z.registry<T>()` のみ採用
- **理由**: `.describe()` は string のみ・型安全性ゼロ。typed registry の方が将来拡張（JSON Schema 変換・API docs 生成）にも有利

---

## 6. 進行計画（Phase 別）

| Phase   | 範囲                                              | 工数目安 | 1 commit | リスク                         |
| ------- | ------------------------------------------------- | -------- | -------- | ------------------------------ |
| Phase 1 | Zod 4 Field Registry 移行 + 22 セクション書き換え | 2〜3 日  | ✅       | 高（型変更・全セクション影響） |
| Phase 2 | AutoSectionForm Accordion 3 層化                  | 1 日     | ✅       | 中（UI 再構成）                |
| Phase 3 | AutoImageField 強化                               | 1 日     | ✅       | 低（単一コンポーネント）       |
| Phase 4 | ラベル日本語 UX 改善                              | 1 日     | ✅       | 低（文字列リライト）           |

**Phase 間依存**: Phase 1 → Phase 2（`FieldMeta.group` が Phase 1 で導入されないと Phase 2 の分離ロジックが書けない）。Phase 3 / 4 は Phase 1 と独立だが、Phase 4 の group 振り分けは Phase 1 と同時が自然。

---

## 7. 実装後の効果測定（将来）

- 管理者に「このセクションのテキスト変更まで何クリック？」を計測
- 現状: セクション選択 → フォーム中のテキストフィールドまで scroll/目視 → 編集 → 保存
- 改善後: セクション選択 → Content fields が即座に見える → 編集 → 保存（Accordion 展開操作ゼロ）
- 初心者ユーザビリティテスト（可能なら）で「見出しを変えてください」タスクの完了時間を比較

---

## 8. 参照

### 一次資料

- [Zod 4 Metadata & Registries](https://github.com/colinhacks/zod/blob/main/packages/docs/content/metadata.mdx)
- [WAI-ARIA APG — Accordion Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)
- [WAI-ARIA APG — Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [Radix UI Accordion](https://www.radix-ui.com/primitives/docs/components/accordion)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
- [Next.js 16 Forms Guide](https://nextjs.org/docs/app/guides/forms)

### 業界標準比較

- [Payload CMS Fields](https://payloadcms.com/docs/fields/overview) / [Collapsible](https://payloadcms.com/docs/fields/collapsible) / [Tabs](https://payloadcms.com/docs/fields/tabs)
- [Sanity Field Groups](https://www.sanity.io/docs/studio/field-groups)
- [WordPress Block Metadata](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)

### 本プロジェクト関連

- `.claude/rules/server-actions.md` — cache 戦略
- `.claude/rules/react/forms-ssr.md` — RHF + Zod パターン
- `.claude/rules/frontend/admin-ui/forms.md` — 設定セクション UX
- `.claude/rules/type-safety.md` — `as` キャスト禁止
- `.claude/rules/gotchas.md` — RHF `useFieldArray` / `useWatch`
