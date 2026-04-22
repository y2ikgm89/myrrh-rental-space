# 0018. Zod 4 `.meta()` + `z.registry<FieldMeta>()` でフィールドメタデータを管理し group を 3 段階固定にする

- **Status**: Accepted
- **Date**: 2026-04-23
- **Deciders**: y2ikgm89
- **Related**:
  - [Admin Pages Beginner-Friendly Editor Spec](../../superpowers/specs/2026-04-23-admin-pages-beginner-ux.md)
  - [Implementation Plan Phase 1](../../superpowers/plans/2026-04-23-admin-pages-beginner-ux.md)

## Context

現状の `/admin/pages/[slug]/edit` は各セクションの Zod スキーマを flat に全フィールド展開してフォーム化する設計で、以下の問題がある:

1. **コンテンツとデザインが同列** — 見出しを変えたいだけの場合も overlay opacity や variant の select が視界に入る。
2. **Field metadata が `.describe(JSON.stringify(meta))` 独自方式** — Zod 4 公式の `.meta()` + `z.registry<T>()` API から乖離しており、JSON parse fallback で型安全性が弱い。
3. **field の group 情報がない** — UI 側でフィールドをグループに振り分けることが不可能。

Payload CMS / Sanity Studio / WordPress Block Editor の共通パターン「presentational fields と data fields の分離」「collapsible グループ化」を採用して解決する。

## Decision

### D1: `.describe()` を廃止し Zod 4 公式 `.meta()` + `z.registry<FieldMeta>()` を採用する

`field-helpers.ts` の `withMeta(schema.describe(JSON.stringify(meta)))` パターンを廃止し、
Zod 4 公式の `schema.register(fieldRegistry, meta)` に全面移行する。

```ts
// Before (廃止)
export function withMeta<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  return schema.describe(JSON.stringify(meta)) as T;
}

// After (採択)
export const fieldRegistry = z.registry<FieldMeta>();
const schema = z.string().default("").register(fieldRegistry, {
  fieldType: "text",
  label: "見出し",
  group: "content",
});
```

**理由**: `.describe()` は string のみ・型安全性ゼロ。typed registry の方が future-proof（JSON Schema 変換・API docs 生成）。Zod 4 公式推奨パターン。

### D2: `FieldMeta.group` を `"content" | "design" | "advanced"` の 3 段階に固定する

| group        | フィールド例                                            | 管理画面表示                     |
| ------------ | ------------------------------------------------------- | -------------------------------- |
| `"content"`  | タイトル・サブタイトル・本文・画像・ボタン・リンク・URL | 常時展開（Accordion 外）         |
| `"design"`   | バリエーション・高さ・オーバーレイ・列数・カラー・配置  | Accordion 折りたたみ（既定閉じ） |
| `"advanced"` | 表示件数・sort・filter・categoryId・カスタム CSS class  | Accordion 折りたたみ（既定閉じ） |

Payload CMS / Sanity では collapsible / fieldset を任意個数作れるが、本プロジェクトは 3 段階に制限する。

**理由**: 22 セクションで UX 一貫性を保つため。自由度を開くと命名・階層がバラけて「どこを見ればテキストが変えられる？」が迷子になる。

### D3: Content を Accordion 外に常時展開する

Sanity field groups / Payload tabs は全グループをタブで切り替えるが、本プロジェクトは content を Accordion 外に置き常時展開する。

**理由**: 初心者の 9 割のタスクは「テキスト・画像を変える」であり、タブ操作を不要化することで認知負荷を最小化する。

### D4: Accordion `type="multiple"` で複数同時展開を許容する

Design と Advanced は排他でなく両方触りたい運用者ニーズがある。`type="single"` 択一を強制しない。

## Consequences

### Positive

- **型安全**: `fieldRegistry.get(schema)` が `FieldMeta | undefined` を型安全に返す（`as` キャスト不要）
- **UX 改善**: Content フィールドが常時展開され、初心者が「どこを見ればいいか」迷わない
- **一貫性**: 22 セクション全て同一の 3 段階 group 体系

### Negative / Trade-off

- **後方互換なし**: `field-helpers.ts` 完全削除・22 セクション全書き換えが必要（Phase 1 で一括対応）
- **group 柔軟性の喪失**: セクション固有のカスタムグループは作れない（これは意図的制約）
- **Zod 4 依存**: `z.registry<T>()` は Zod 4 の機能。Zod 3 へのダウングレードで破壊的影響

## Alternatives Considered

### `.describe(JSON.stringify(meta))` 継続

型安全性がなく、JSON parse の fallback 処理が必要で技術的負債が増えるため却下。

### Payload CMS 式の任意グループ名

22 セクションで命名統一を維持するコストが高く、「どのグループを見ればいいか」の認知負荷が増えるため却下。

### `type="single"` Accordion（1グループのみ展開）

Design と Advanced を同時に操作できないのは不便なため却下。
