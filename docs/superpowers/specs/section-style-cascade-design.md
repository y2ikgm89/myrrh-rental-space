# Section Style Cascade — Design Spec

**日付**: 2026-04-22
**対象プラン**: 完了済削除（Phase B 実装 commit `25ce3ff7`〜`a03a739c`）
**ADR**: `docs/architecture/decisions/0017-section-style-cascade.md`
**前提**: Phase A（PageHero first-class / fluid spacing tokens / SectionWrapper 必須化）完了

---

## 1. 問題設定

Phase A で全 section が `SectionWrapper` 経由となり、管理画面の design 制御は完全に生きる状態になった。しかし design payload は `Section.design`（JSON, per-instance）に限定されており以下の問題が残る:

1. **再利用不可** — 同じ「Editorial Hero」スタイルを 10 page で使う場合、10 レコードに同一 JSON をコピペする必要がある。
2. **一括変更不可** — 「全 section の paddingTop を `xl` に」のような global 調整には全 Section レコードの個別 update が必要。
3. **A/B 比較困難** — "内容は同じで見た目だけ別" の対比が Section 複製でしか作れない。
4. **マルチサイト非対応** — テナントごとに preset を切り替える機構なし。

Sanity / Webflow / WordPress Gutenberg / Material Design の preset + cascade モデルに寄せて、design を独立 entity に切り出し、4 段 cascade で解決する。

---

## 2. スコープ

### In-scope

- `SectionStyle` 独立テーブル（name / scope / spacing / background / container / typography / animation / customClass / applicableTypes / version / parentId / audit / softDelete）
- Section / Page / Settings に cascade FK（`Section.styleId` / `Section.styleOverride` / `Page.pageStyleId` / `Settings.globalSectionStyleId`）
- Domain 層 `resolveSectionStyle(section, page, settings)` — 4 段 cascade resolver
- Migration script: 既存 `Section.design` JSON → `SectionStyle` + `Section.styleId` への自動移行（同値統合）
- Public rendering: 全セクションが `resolvedStyle` 経由で描画
- Admin Style Library (`/admin/styles`): CRUD + usage 一覧 + derive + detach
- Section 編集 UI: `DesignFields` → `StyleSelector + StyleOverridePanel + ResolvedStylePreview`
- Page 編集 UI: `PageStyleField`（Page-level cascade）
- Settings UI: `globalSectionStyle` 選択（Theme default）

### Out-of-scope

- Phase A で扱った PageHero cascade（PageHero は variant 別 component で styled-components 的に固定、Style cascade の対象外）
- Multitenant の Settings 分離（本プロジェクトは単一 tenant 想定）
- CSS-in-JS 実行時 Style 生成（build-time Tailwind class 解決のみ）

---

## 3. Cascade 解決仕様

### 3.1 解決順序（specificity 低 → 高）

```
1. DEFAULT_SECTION_STYLE       (hardcoded fallback)
2. Settings.globalSectionStyle (Theme-level preset)
3. Page.pageStyle              (Page-level override)
4. Section.style               (Section preset)
5. Section.styleOverride       (per-instance fine-tune)
```

### 3.2 Merge セマンティクス

**shallow merge at field-group level, deep merge within each group**:

- 各 layer の `spacing` / `background` / `container` / `typography` / `animation` object は、sub-field 単位で上位 layer が下位 layer を上書き（`{ ...acc.spacing, ...layer.spacing }`）
- `customClass` は string 単純上書き（join 等しない。上位 layer 指定時に完全置換）
- `null` layer はスキップ（layer.spacing が undefined ではなく object で null field を含む場合は merge 対象）

### 3.3 Null 扱い

- `section.styleId === null` → section preset 層をスキップ（次の override だけ残る）
- `section.styleOverride === null` → instance 層をスキップ
- `page.pageStyleId === null` → page 層をスキップ
- `settings.globalSectionStyleId === null` → global 層をスキップ
- 全 layer null → `DEFAULT_SECTION_STYLE` のみで描画

### 3.4 SetNull onDelete の意味

`Section.styleId`, `Page.pageStyleId`, `Settings.globalSectionStyleId` の FK は `ON DELETE SET NULL`:

- Style 削除 → 参照 section は `DEFAULT_SECTION_STYLE` にフォールバック（visual degradation ありうる）
- 削除前に **usage 一覧強制表示 + 確認 dialog** で影響範囲を editor に示す

---

## 4. SectionStyle Schema

### 4.1 Prisma モデル（詳細）

```prisma
model SectionStyle {
  id              String   @id @default(cuid()) @db.VarChar(30)
  name            String   @unique @db.VarChar(100)
  description     String?  @db.Text
  scope           String   @db.VarChar(32)

  spacing         Json
  background      Json
  container       Json
  typography      Json
  animation       Json
  customClass     String?  @db.VarChar(200)

  applicableTypes String[] @db.VarChar(64)

  version         Int      @default(1)
  parentId        String?  @db.VarChar(30)
  parent          SectionStyle?  @relation("StyleDerivation", fields: [parentId], references: [id])
  derived         SectionStyle[] @relation("StyleDerivation")

  createdById     String?  @db.Uuid
  updatedById     String?  @db.Uuid
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  sections        Section[]
  pagesAsDefault  Page[]    @relation("PageDefaultStyle")
  settingsGlobal  Settings? @relation("SettingsGlobalStyle")

  @@index([scope])
  @@index([applicableTypes])
  @@index([deletedAt])
}
```

### 4.2 JSON payload スキーマ（Zod）

```typescript
const spacingSchema = z.object({
  paddingTop: z.enum(["none", "sm", "md", "lg", "xl"]),
  paddingBottom: z.enum(["none", "sm", "md", "lg", "xl"]),
});

const backgroundSchema = z.object({
  type: z.enum(["default", "surface", "muted", "image", "gradient"]),
  value: z.string().optional(),
  overlayOpacity: z.number().min(0).max(1).default(0),
  imageUrl: z.string().url().optional(),
});

const containerSchema = z.object({
  maxWidth: z.enum(["sm", "md", "editorial", "lg", "xl", "full"]),
});

const typographySchema = z.object({
  titleSize: z.enum(["sm", "md", "lg", "xl"]),
  titleColor: z.string().optional(), // semantic token name
  textColor: z.string().optional(),
  textAlign: z.enum(["left", "center", "right"]),
});

const animationSchema = z.object({
  preset: z.enum(["none", "fade", "slide-up", "scale"]),
});

export const sectionStylePayloadSchema = z.object({
  spacing: spacingSchema,
  background: backgroundSchema,
  container: containerSchema,
  typography: typographySchema,
  animation: animationSchema,
  customClass: z
    .string()
    .max(200)
    .regex(/^[a-z0-9\s:\-_]*$/i)
    .optional(),
});
```

### 4.3 Section.styleOverride の schema

`sectionStylePayloadSchema.partial().optional()` と同等（全 field が optional、group レベルで `.partial({ deep: true })` 相当）。

---

## 5. Migration 設計

### 5.1 Schema migration (destructive)

手書き SQL、`prisma/migrations/<ts>_add_section_styles_and_cascade/migration.sql`:

1. `CREATE TABLE "SectionStyle"`
2. `ALTER TABLE "Section" ADD COLUMN "styleId" / "styleOverride"`
3. `ALTER TABLE "Page" ADD COLUMN "pageStyleId"`
4. `ALTER TABLE "Settings" ADD COLUMN "globalSectionStyleId"`
5. seed preset 5 件 INSERT（Editorial - Standard / Compact / CTA / Hero Adjacent / Full Bleed）
6. `Section.design` 列は **まだ削除しない**（Phase B.P4 で削除）

### 5.2 Data migration script

`scripts/migrate-section-design-to-style.ts`:

1. 全 `Section` を `{ id, design }` で取得
2. `design` を canonical JSON（key sort + null 除去 + 数値 precision 正規化）化してハッシュ
3. ハッシュ別にグルーピング → unique pattern 抽出
4. 各 unique pattern を `SectionStyle` に upsert（seed preset 優先 match）
5. `Section.styleId` に該当 id 設定
6. 移行ログ `migration-logs/section-design-to-style-<ts>.json` に before/after 記録

**Idempotency 保証**: 2 回連続実行で diff 0 を確認する。

### 5.3 design 列削除（Phase B.P4）

前提: `prisma.section.count({ where: { styleId: null } }) === 0` を確認してから `ALTER TABLE "Section" DROP COLUMN design`。

---

## 6. Domain API

### 6.1 `resolveSectionStyle()`

```typescript
export function resolveSectionStyle(
  section: Section & { style: SectionStyle | null },
  page: Page & { pageStyle: SectionStyle | null },
  settings: Settings & { globalSectionStyle: SectionStyle | null },
): ResolvedSectionStyle;
```

- Server Component / Server Action / Route Handler から呼び出し可能
- Client Component からは **直接呼び出し禁止**（prisma 依存、server-only）
- Page render 時に SC が 1 度計算し、`style: ResolvedSectionStyle` を SectionWrapper に渡す

### 6.2 `mergeStyleLayers()`

```typescript
function mergeStyleLayers(
  layers: (Partial<ResolvedSectionStyle> | null)[],
): ResolvedSectionStyle;
```

Pure function、unit test 網羅容易。

### 6.3 `isStyleApplicable(style, sectionType)`

```typescript
export function isStyleApplicable(
  style: SectionStyle,
  sectionType: string,
): boolean;
```

- `style.applicableTypes` が空配列なら全 type 適用可
- 空でなければ `applicableTypes.includes(sectionType)` で判定
- Admin UI の StyleSelector filter に使用

---

## 7. Admin UX

### 7.1 Style Library (`/admin/styles`)

- 一覧: カード形式（name / scope / applicableTypes / preview thumbnail）
- フィルタ: scope / applicableTypes / createdBy
- 新規作成 / 編集 / 削除（RBAC: admin only）
- derive: parent 選択 → 継承した新 Style 作成
- usage 表示: 該当 style を参照する `Section[] / Page[] / Settings` を一覧化

### 7.2 Section 編集画面

従来の `DesignFields`（6 フィールド直接編集）を廃止し、以下 3 コンポーネント構成に:

```tsx
<StyleSelector sectionType={type} value={styleId} onChange={setStyleId} />
<ResolvedStylePreview resolved={resolved} /> {/* 実際の描画サンプル */}
<Disclosure title="Override (このセクション固有の調整)">
  <StyleOverridePanel value={override} onChange={setOverride} />
</Disclosure>
```

**補助アクション**:

- "Save current overrides as new Style" → override を Style preset 化
- "Detach Style preset (embed override)" → 参照を解除して override に埋め込み

### 7.3 Page / Settings

- Page 編集画面に `PageStyleField` を追加（1 Page に 1 Style）
- Settings `/admin/settings` に `DesignSection` を追加（globalSectionStyle 選択）

---

## 8. RBAC / 権限

`src/admin/lib/admin-resources.ts` に `"sectionStyle"` 追加:

- admin: 全操作可
- editor: 読み取り + usage 確認のみ（編集は不可）
- viewer: 読み取りのみ

既存 `executeAdminMutationResult` パターンを踏襲（`resource: "sectionStyle"`）。

---

## 9. Cache Strategy

- `CACHE_TAGS.SECTION_STYLES` 新設（list tag）
- `getCacheTag.sectionStyles.detail(id)` detail tag
- Style 編集 → `invalidateSectionStyleCaches({ id })` で該当 section + page cache 連鎖無効化
- 公開ページ描画は `resolvedStyle` が prop として渡るため Server Component 再レンダリングで反映

---

## 10. テスト戦略

### 10.1 Unit (bun:test)

- `style-resolver.test.ts`: 4 段 cascade の全組み合わせ（2^5 = 32 ケース + null 変種）
- `style-merger.test.ts`: deep merge / null skip / customClass 上書き
- `applicable-types.test.ts`: 空配列 / 一致 / 不一致 / 大文字小文字
- `section-style.zod.test.ts`: schema validation 正常系 + 異常系

### 10.2 Integration (bun:test)

- `section-style-crud.test.ts`: Server Action create/update/delete/derive の正常系 + RBAC
- `section-design-migration.test.ts`: script の dry-run + actual run + idempotency (2 回実行 diff 0)

### 10.3 E2E (Playwright)

- `admin/section-styles.spec.ts`: Style Library CRUD + usage 一覧 + derive + Section 編集で style 適用 → 公開ページ反映確認

---

## 11. ロールバック

各 phase は 1 commit、`git revert <sha>` で個別 rollback 可能:

- P2 (schema migration) は revert SQL を併記
- P3 (data migration) は `migration-logs/<ts>.json` から復元 script を提供
- P4 (DROP COLUMN design) は `ALTER TABLE Section ADD COLUMN design JSONB` + log から復元

worktree 隔離 (`feature/section-arch-phase-b`) で main をクリーンに保つ。

---

## 12. Phase 依存マップ

```
P1 (spec + ADR) -- no code
P2 (schema + migration + seed) -- depends on P1
P3 (resolver + data migration script) -- depends on P2 (styleId FK 必要)
P4 (SectionWrapper + public pages + DROP COLUMN design) -- depends on P3 (styleId 全件 non-null 必要)
P5 (admin Style Library + Section editor 改修) -- depends on P4 (SectionWrapper API 確定後)
```

P1 → P5 順次進行。P4 の DROP COLUMN は P3 検証完了後のみ実行。

---

## 13. 品質ゲート

- 各 phase 完了後 `bun run validate && bun run build`
- P2 完了後 `bunx prisma migrate status` で反映確認
- P3 完了後 `prisma.section.count({ styleId: null })` === 0
- P4 完了後 全公開ページの visual smoke test（375/768/1280/1920）
- P5 完了後 Playwright E2E `admin/section-styles.spec.ts`
- Phase 全体完了後 `bun run test:all` + `bun run lhci`

---

## 14. Open Questions

- **Q1**: Style の削除を soft delete にするか、cascade SET NULL にするか？
  - **A**: 両方採用。soft delete（`deletedAt`）で一時停止、併せて FK は `ON DELETE SET NULL` で物理削除時の参照切れを防ぐ。
- **Q2**: `customClass` は editor 直接入力を許すか？
  - **A**: admin only、regex `/^[a-z0-9\s:\-_]*$/i` で XSS 回避。editor には input 権限無し。
- **Q3**: Style の version 管理は単純 `version: Int` か、`SectionStyleVersion` 子テーブルか？
  - **A**: Phase B では `version: Int` のみ。履歴保持が要件化したら後続 phase で子テーブル化検討。
- **Q4**: multisite 時の `Settings` 分離は？
  - **A**: 本 Phase では単一 Settings 前提。multisite 対応は将来 ADR で別途。
