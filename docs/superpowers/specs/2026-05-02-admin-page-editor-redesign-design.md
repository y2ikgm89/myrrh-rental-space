# Admin Page Editor Redesign — Design Spec (Clean Break)

> 対象: `/admin/pages/[slug]/edit` の clean-break refactor
> 作成: 2026-05-02
> 改訂: 2026-05-02（clean-break 方針に変更、Phase 1+2+4 統合）
> ステータス: Draft（ユーザー承認待ち）

## 背景・動機

現在の編集画面の課題:

**【主】編集しづらい (UI/UX 構造)**

- セクションカードが縦に積まれ、どのセクションを編集中か把握しづらい
- 1 カード内で「テキスト/画像/ボタン/色/レイアウト」が雑多に並ぶ
- `PageHero` だけ別フォームで、できることが他セクションと違う（**SSoT 二重化**）

**【副】編集できない (機能 gap)**

- セクションの並び替え・追加・削除・複製・有効/無効切替の Server Action 未実装（DB に `order` / `isActive` あるが UI 化されていない）
- `post-list.categoryId` 等、field-registry 外で定義されたフィールドが自動生成に乗らない

## 方針: Clean Break（後方互換なし）

**ユーザー指示**: 破壊的変更可・公式ベストプラクティス準拠・後方互換性なし・推奨実装でクリーンに。

これに従い、以下を **同一 PR で一括実施**:

1. **PageHero を Section レジストリに統合**（destructive migration、`Page.pageHero` 列 DROP）
2. **master-detail UI** への全面刷新
3. **意味別 subGroup** によるフィールド分類
4. **Section CRUD + 並び替え** Server Action 群追加
5. **registry 外フィールドの正規化**（post-list.categoryId 等）
6. **旧コード一式削除**（shim・互換 helper・deprecated alias 置かず）

## ゴール

「**ページの構成を素早く把握し、各セクションのテキスト・画像・ボタンを直感的に編集でき、構成も柔軟に組み替えられる**」管理体験。

---

## 設計詳細

### 1. データモデル変更（destructive）

#### 1.1 `Page.pageHero Json?` 列 DROP

```prisma
// 変更前
model Page {
  // ...
  pageHero Json?
}

// 変更後
model Page {
  // ...
  // pageHero 列削除
}
```

#### 1.2 `Section` に `type = "page-hero"` を許可

`Section` モデル自体に変更なし（`type String @db.VarChar(64)` のまま）。registry に `page-hero` type を追加することで対応。

#### 1.3 Migration

`prisma/migrations/<timestamp>_drop_page_hero_to_section/migration.sql`:

```sql
-- 1) ホームページの pageHero JSON を Section に挿入
INSERT INTO sections (id, "pageId", "type", "config", "order", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p.id,
  'page-hero',
  COALESCE(p."pageHero", '{}'::jsonb),
  -1,                             -- 先頭固定（他セクション order >= 0）
  TRUE,
  now(),
  now()
FROM pages p
WHERE p."pageHero" IS NOT NULL;

-- 2) Page.pageHero 列削除
ALTER TABLE pages DROP COLUMN "pageHero";
```

`prisma migrate dev` がローカル dev DB の drift で失敗する場合は、`prisma migrate diff --script` + `db execute` + `migrate resolve --applied` の手順（`git-migration.md` 参照）を使う。

**データ損失リスク**: ホームページの pageHero JSON がそのまま `Section.config` に入る。`PageHero` schema と `Section.config` schema を同形にすることで損失なし。

### 2. PageHero を registry に登録

#### 2.1 新規 type 定義

`src/shared/lib/sections/definitions/page-hero/`:

```
definitions/page-hero/
  schema.ts        # discriminated union (editorial-split | compact | minimal)
  defaults.ts      # default for each variant
  index.ts         # SectionDefinition export
```

`schema.ts`:

```typescript
import { z } from "zod";
import { field } from "@/shared/lib/sections/field-registry";

const editorialSplitSchema = z.object({
  variant: z.literal("editorial-split"),
  label: field.text("ラベル", { subGroup: "text" }),
  title: field.text("タイトル", { subGroup: "text" }),
  description: field.textarea("説明", { subGroup: "text" }),
  images: field.array("ヒーロー画像", {
    subGroup: "image",
    fields: {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト"),
    },
  }),
  transition: field.select("トランジション", {
    subGroup: "image",
    options: [
      { value: "crossfade", label: "クロスフェード" },
      { value: "ken-burns", label: "ケン・バーンズ" },
      { value: "clip-reveal", label: "クリップリビール" },
      { value: "scale-fade", label: "スケールフェード" },
    ],
    default: "crossfade",
  }),
  buttonText: field.text("ボタン文言", { subGroup: "button" }),
  buttonUrl: field.url("ボタン URL", { subGroup: "button" }),
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  image: z.object({
    url: field.image("画像 URL"),
    alt: field.text("代替テキスト"),
  }),
  label: field.text("ラベル", { subGroup: "text" }),
  title: field.text("タイトル", { subGroup: "text" }),
  description: field.textarea("説明", { subGroup: "text" }),
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("アイブロー", { subGroup: "text" }).optional(),
  title: field.text("タイトル", { subGroup: "text" }),
  description: field.textarea("説明", { subGroup: "text" }),
});

export const pageHeroConfigSchema = z.discriminatedUnion("variant", [
  editorialSplitSchema,
  compactSchema,
  minimalSchema,
]);
```

#### 2.2 削除対象（旧 PageHero コード）

- `src/shared/lib/sections/page-hero/schema.ts` → 削除
- `src/shared/lib/sections/page-hero/defaults.ts` → 削除
- `src/shared/lib/sections/page-hero/index.ts` → 削除（ディレクトリごと）
- `parsePageHero` / `pageHeroSchema` の参照を全部 `validateSectionConfig("page-hero", ...)` に置換
- `PageHeroEditor.tsx` → 削除
- `updatePageHero` Server Action → 削除（`updatePageSection` で代替）

#### 2.3 公開側 renderer

`HomepageSections` / `PageHero` Server Component:

```typescript
// 変更前
<HomepageSections pageHero={page.pageHero} sections={...} />

// 変更後
const pageHeroSection = sections.find((s) => s.type === "page-hero");
const otherSections = sections.filter((s) => s.type !== "page-hero");
<HomepageSections pageHeroSection={pageHeroSection} sections={otherSections} />
```

`PageHero` コンポーネントは props に `Section` の `config` を受け取る形に変更。

### 3. field-registry に subGroup を追加

```typescript
// src/shared/lib/sections/field-registry.ts
type FieldSubGroup = "text" | "image" | "button" | "other";

interface FieldMeta {
  label: string;
  group: "content" | "design" | "advanced";
  subGroup?: FieldSubGroup; // content グループのみ意味あり
  // ... 既存
}
```

各 `field.*` ヘルパー opts に `subGroup?: FieldSubGroup` を追加。

22 (+ page-hero = 23) section schema を一括 grep で対応:

- `field.text`/`textarea` → 主に `subGroup: "text"`
- `field.image` → `subGroup: "image"`
- `field.url` （ボタン URL） → `subGroup: "button"`
- ボタン用 array → `subGroup: "button"`
- それ以外 → 未指定（→ "other" にフォールバック）

### 4. Section CRUD + 並び替え Server Actions

新規実装（`src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts` に追加）:

| Action                    | Signature                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `createPageSection`       | `(pageId: string, type: SectionType, order?: number) => MutationResult<{ id: string }>` |
| `deletePageSection`       | `(id: string) => MutationResult<{ id: string }>`                                        |
| `duplicatePageSection`    | `(id: string) => MutationResult<{ id: string }>`                                        |
| `togglePageSectionActive` | `(id: string) => MutationResult<{ isActive: boolean }>`                                 |
| `reorderPageSections`     | `(pageId: string, orderedIds: string[]) => MutationResult<{ count: number }>`           |

すべて `executeAdminMutationResult` パターン（`auth-patterns.md` 準拠）、`afterSuccess` で:

```typescript
updateTag(CACHE_TAGS.SECTIONS);
updateTag(CACHE_TAGS.PAGE_SECTIONS);
updateTag(CACHE_TAGS.PAGES);
updateTag(getCacheTag.pages.detail(pageId));
```

`reorderPageSections` は `prisma.$transaction` で `order` 列を一括更新。

`createPageSection` は registry の defaults から `config` を生成。`page-hero` type は **1 ページに 1 つ** 制約（既存があれば error）。

### 5. master-detail UI

#### 5.1 レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ AdminDetailLayout: ← / 「ホームページ を編集」 / [Badge][Pub][Preview] │
├─────────────────────────────────────────────────────────────────┤
│ Tabs: [コンテンツ] [SEO・OGP]                                     │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┬────────────────────────────────────────┐  │
│ │ セクション一覧     │ 選択中セクションの編集パネル          │  │
│ │ (lg:280px sticky) │                                         │  │
│ │                   │ ─ 種別 [page-hero ▼] (variant 切替)    │  │
│ │ [+ セクション追加] │                                         │  │
│ │                   │ ▼ テキスト                             │  │
│ │ ⠿ ヒーロー [✓]   │   ラベル / タイトル / 説明              │  │
│ │ ⠿ お知らせ [✓]   │ ▼ 画像                                  │  │
│ │ ⠿ スペース紹介[✓]│   ヒーロー画像 (array)                  │  │
│ │ ⠿ コンセプト [✓] │ ▼ ボタン・リンク                        │  │
│ │ ⠿ 利用の流れ [✓] │   ボタン文言 / URL                      │  │
│ │ ⠿ お問合せ [✓]   │ ▷ デザイン (折)                         │  │
│ │                   │ ▷ 詳細設定 (折)                         │  │
│ │ ⠿ = drag handle   │                                         │  │
│ │ [✓] = isActive    │                              [保存]     │  │
│ │ kebab: 複製/削除   │                                         │  │
│ └──────────────────┴────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

`lg:` 以上で 2 カラム、それ以下で縦積み。

#### 5.2 新規コンポーネント

| ファイル                                               | 役割                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `pages/[slug]/edit/_components/SectionListSidebar.tsx` | 左サイド：セクション一覧 (dnd-kit Sortable)、+ ボタン                    |
| `pages/[slug]/edit/_components/SectionListItem.tsx`    | 1 行：drag handle / icon / label / kebab メニュー / active toggle        |
| `pages/[slug]/edit/_components/SectionEditPanel.tsx`   | 右パネル：選択中 section の編集（discriminated union variant 対応）      |
| `pages/[slug]/edit/_components/AddSectionDialog.tsx`   | + ボタン → type picker dialog（filter: page-hero は 1 ページ 1 つ）      |
| `pages/[slug]/edit/_components/section-edit-state.ts`  | nuqs query state SSoT for `?section=<id>`                                |
| `pages/[slug]/edit/_components/SectionTypePicker.tsx`  | type 選択 UI（icon + label + description）。homepage-\* は homepage のみ |

#### 5.3 削除対象

- `pages/[slug]/edit/_components/SectionEditor.tsx` → SectionEditPanel に吸収、削除
- `pages/[slug]/edit/_components/PageHeroEditor.tsx` → 削除（SectionEditPanel が page-hero も扱う）

#### 5.4 変更対象

- `pages/[slug]/edit/_components/PageEditor.tsx` → master-detail へ書き換え
- `pages/[slug]/_sections/_components/auto-section-form.tsx` → content グループ内を subGroup でセクション分割描画

### 6. URL state

```typescript
// section-edit-state.ts
import { parseAsString } from "nuqs";

export const sectionEditQueryParser = parseAsString
  .withDefault("")
  .withOptions({ history: "push", shallow: true });

// PageEditor で
const [activeSectionId, setActiveSectionId] = useQueryState(
  "section",
  sectionEditQueryParser,
);

// 空文字 → sections[0]?.id にフォールバック (render 中 derive)
const resolvedActiveId = activeSectionId || (sections[0]?.id ?? "");
```

`shallow: true` のため SC 再フェッチなし、Client 内で section 切替のみ。

### 7. AutoSectionForm の subGroup 対応

```tsx
// content フィールドを subGroup で分類
const textFields = contentFields.filter((f) => f.meta.subGroup === "text");
const imageFields = contentFields.filter((f) => f.meta.subGroup === "image");
const buttonFields = contentFields.filter((f) => f.meta.subGroup === "button");
const otherFields = contentFields.filter(
  (f) => !f.meta.subGroup || f.meta.subGroup === "other",
);

return (
  <form>
    {textFields.length > 0 && (
      <FieldGroupSection title="テキスト" icon={IconTypography}>
        {textFields.map(renderField)}
      </FieldGroupSection>
    )}
    {imageFields.length > 0 && (
      <FieldGroupSection title="画像" icon={IconPhoto}>
        {imageFields.map(renderField)}
      </FieldGroupSection>
    )}
    {buttonFields.length > 0 && (
      <FieldGroupSection title="ボタン・リンク" icon={IconLink}>
        {buttonFields.map(renderField)}
      </FieldGroupSection>
    )}
    {otherFields.length > 0 && (
      <div className="space-y-4">{otherFields.map(renderField)}</div>
    )}
    {/* design / advanced は既存 Accordion */}
  </form>
);
```

`FieldGroupSection` は border-top + 見出しアイコン + ラベル のシンプルなラッパー（折りたたみなし）。

### 8. seed.ts 更新

```typescript
// 変更前: page.pageHero に直接書き込み
await prisma.page.upsert({
  where: { slug: "home" },
  create: { ..., pageHero: defaultPageHeroHome as Prisma.InputJsonValue },
  update: { pageHero: ... },
});

// 変更後: page-hero section を upsert
const homePage = await prisma.page.upsert({
  where: { slug: "home" },
  create: { ..., slug: "home", title: "ホーム" },
  update: {},
});

await prisma.section.upsert({
  where: { /* unique constraint or findFirst + create/update */ },
  create: {
    pageId: homePage.id,
    type: "page-hero",
    config: defaultPageHeroHome,
    order: -1,
    isActive: true,
  },
  update: { /* idempotent */ },
});
```

`Section` に `pageId + type` の partial unique index を追加するか、`findFirst({ pageId, type: "page-hero" })` ベースで upsert するかは plan で決定。

### 9. registry 外フィールドの正規化

#### 9.1 `post-list.categoryId`

```typescript
// 変更前 (definitions/post-list/schema.ts)
categoryId: z.string().uuid().optional(),

// 変更後
categoryId: field
  .select("カテゴリで絞り込み", {
    subGroup: "other",
    options: [], // 動的に PostCategory list を fetch して注入する仕組みが必要
    default: "",
  })
  .optional(),
```

注入 mechanics: `SectionEditPanel` で section type を見て、`post-list` なら `getPostCategories()` を SC で fetch して props で渡す（または Client で `useQuery`）。実装は plan で決定。

**簡易対応の代替案**: `categoryId` は registry に乗せず、`post-list` 専用カスタムフィールドとして `SectionEditPanel` 内で別 UI レンダリング（`AutoSectionForm` の後に追加）。スコープを抑えるならこちら。

→ **plan で簡易対応（カスタム UI）を採用予定**。registry の動的 options 対応は Phase 3 へ。

### 10. テスト方針

#### 10.1 Migration テスト

- `__tests__/integration/page-hero-migration.test.ts`
  - migration 適用前に Page.pageHero に JSON 配置 → migration 適用後 → Section テーブルに type=page-hero が存在 + 同じ JSON が config にある + Page テーブルから pageHero 列削除済
  - `getRealDatabaseUrl()` helper で `.env.local` 経由（migration 系 integration test 標準パターン）

#### 10.2 Server Action テスト

- `createPageSection` / `deletePageSection` / `duplicatePageSection` / `togglePageSectionActive` / `reorderPageSections` 各 mock-based unit test
- page-hero 重複エラー
- `executeAdminMutationResult` 経由の権限・監査ログ動作確認

#### 10.3 field-registry テスト

- `subGroup` メタ取得テスト
- 全 23 section schema で subGroup propagation 確認

#### 10.4 Manual smoke test

- `/admin/pages/home/edit` で master-detail が描画
- セクション選択 → URL 更新 → 編集パネル切替
- - 追加 → type picker → 新規セクション
- kebab 複製 → 新規 section が一覧に追加
- kebab 削除 → 確認ダイアログ → 削除
- DnD で並び替え → DB の order 更新確認
- isActive toggle → プレビューで非表示確認
- public `/` (home) でも page-hero section が正しく表示
- 全 23 section type が新 UI で描画可能

### 11. 公式準拠事項

| 項目                         | 公式準拠先                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Prisma destructive migration | [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate) — `migrate dev --create-only` でレビュー後 apply |
| Server Action 認証           | `auth-patterns.md` §executeAdminMutationResult                                                                   |
| Zod 4 discriminated union    | [Zod 4 docs](https://zod.dev/?id=discriminated-unions)                                                           |
| nuqs URL state               | [nuqs docs](https://nuqs.dev) — `parseAsString.withDefault().withOptions({ shallow: true })`                     |
| dnd-kit Sortable             | [dnd-kit Sortable](https://docs.dndkit.com/presets/sortable) — RHF + useFieldArray と同パターン                  |
| 監査ログ                     | `executeAdminMutationResult` 経由（fire-and-forget）                                                             |
| Cache invalidation           | `updateTag` + `getCacheTag.pages.detail(pageId)`                                                                 |

### 12. リスク・mitigation

| リスク                                                       | 影響                     | 対策                                                                                                                 |
| ------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| destructive migration が production の pageHero データを失う | データ損失               | migration の INSERT INTO sections SELECT ... を data migration として明示。`COALESCE` で null も拾う                 |
| dev DB drift で `prisma migrate dev` が reset 要求           | 開発停止                 | `prisma migrate diff --script` + `db execute` + `migrate resolve --applied` の手動パターン適用（`git-migration.md`） |
| Section.config の page-hero schema mismatch                  | Zod parse 失敗で UI 空白 | migration 前に既存 Page.pageHero JSON を `pageHeroConfigSchema.safeParse()` で検証（migration script 内）            |
| 公開側 renderer 切替漏れ                                     | 本番でホームページ崩壊   | grep で `page.pageHero` 全参照を列挙、修正、検証で確実に除去                                                         |
| seed の page-hero 二重作成                                   | seed 二度実行で エラー   | `findFirst` + `create or update` で idempotent 化                                                                    |
| 23 section schema 全部に subGroup 注入の手間                 | implementer 工数         | grep で field.\* 呼び出しを列挙、systematic 注入                                                                     |
| Phase 1 commit 数が多すぎて context 枯渇                     | implementation 中断      | subagent 分割 + 必要なら session handoff（`handoff memory`）                                                         |

### 13. 計画される commit 分割（writing-plans で詳細化）

#### A. データ層 destructive migration（先頭）

1. `feat(prisma): migrate Page.pageHero to Section type=page-hero, drop column`

#### B. Section レジストリへの page-hero 登録 + 旧 PageHero 削除

2. `feat(sections): register page-hero type with discriminated union variants`
3. `chore(sections): drop deprecated page-hero/{schema,defaults,index}.ts`
4. `refactor(public): HomepageSections reads page-hero section instead of page.pageHero`
5. `chore(seed): convert seedPages to insert page-hero section`
6. `refactor(actions): drop updatePageHero, fold into updatePageSection`

#### C. field-registry subGroup

7. `feat(field-registry): add optional subGroup to FieldMeta`
8. `feat(sections): annotate 23 section schemas with subGroup`

#### D. Section CRUD + 並び替え Server Actions

9. `feat(actions): createPageSection / deletePageSection / duplicatePageSection`
10. `feat(actions): togglePageSectionActive / reorderPageSections`

#### E. master-detail UI

11. `feat(page-edit): SectionListSidebar + SectionListItem (no DnD yet)`
12. `feat(page-edit): SectionEditPanel + variant Select for page-hero`
13. `feat(page-edit): AddSectionDialog + SectionTypePicker`
14. `feat(page-edit): URL state for active section (nuqs)`
15. `feat(page-edit): wire master-detail layout in PageEditor, drop SectionEditor`
16. `feat(page-edit): drag-and-drop reorder with dnd-kit`
17. `feat(auto-section-form): render content fields by subGroup with section headings`
18. `chore(page-edit): drop PageHeroEditor`

#### F. テスト

19. `test(integration): page-hero migration data preservation`
20. `test(actions): section CRUD + reorder unit tests`

合計 20 commits（plan で粒度再調整可、最大 22 程度に収める）。

### 14. ロールバック戦略

destructive migration のため rollback には以下が必要:

1. Section テーブルから `type = "page-hero"` の行を `Page.pageHero` に書き戻す逆 migration
2. `Page.pageHero` 列を再追加

production で migration 後 24h 以内なら逆 migration を準備（plan に script 草案）。それ以降は `Section` を SSoT として運用継続。

---

## Out of Scope（次回 spec へ）

- ❌ Live preview iframe 連動（現状の別タブで OK と確認済み）
- ❌ autosave / unsaved warning / スケジュール公開 / 履歴管理
- ❌ ボタンの色・variant 等装飾系フィールドの追加（実利用後にデータドリブンで）
- ❌ 画像キャプション・alt の構造化
- ❌ post-list 動的 categoryId options（registry の動的 options 対応）
- ❌ EDITOR ロール用のセクション単位アクセス制御変更

## ロードマップ（参考）

- **Phase 2 (next spec)**: フィールド追加・装飾系拡張・post-list categoryId 動的 options
- **Phase 3 (next spec)**: autosave・スケジュール公開・履歴管理
- **Phase 4 (next spec)**: live preview / split view / WYSIWYG
