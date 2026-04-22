# Admin Pages Beginner-Friendly Editor — Implementation Plan

**日付**: 2026-04-23
**Spec**: `docs/superpowers/specs/2026-04-23-admin-pages-beginner-ux.md`
**ブランチ**: `main` 直接（短期・段階的 commit）

---

## 全体方針

- **後方互換性なし** — clean-break
- **Phase ごとに 1 commit** — linear history 維持
- **各 Phase 完了後に `bun run validate && bun run build` で緑を確認してから commit**
- **ADR 0018 作成** — Phase 1 と同時（`.describe()` 廃止 + `.meta()` 採用の記録）

---

## Phase 1: Zod 4 Field Registry 移行（1 commit）

### 目的

Zod 4 公式の `.meta()` + `z.registry<FieldMeta>()` パターンに移行し、独自 `.describe(JSON.stringify())` 方式を廃止。`FieldMeta` に `group` 必須追加。

### タスク

#### 1.1 ADR 0018 作成

`docs/architecture/decisions/0018-field-registry-and-group-hierarchy.md`:

- 採択: Zod 4 `.meta()` + `z.registry<T>()` / `.describe()` 廃止
- 採択: `FieldMeta.group = "content" | "design" | "advanced"` 3 段階固定
- 採択: Accordion `type="multiple"` で複数同時展開
- 採択: content を Accordion 外に常時展開

#### 1.2 新規ファイル `src/shared/lib/sections/field-registry.ts`

- `FieldMeta` インターフェース定義（`group` 必須）
- `fieldRegistry = z.registry<FieldMeta>()`
- `field` object — text / textarea / number / boolean / select / color / image / url / icon / array / group の 11 ヘルパー
- 全ヘルパーに `group?: FieldMeta["group"]` option 追加（省略時 `"content"` default）
- `extractFieldMeta(schema)` を `fieldRegistry.get(schema)` ラッパーで提供（後方互換目的の一時 adapter。Phase 2 以降で直接参照に移行）

#### 1.3 `src/shared/lib/sections/zod-introspection.ts` 書き換え

- `extractFieldMeta` 呼び出し → `fieldRegistry.get()` 直接呼び出し
- `FieldInfo` 型の `meta` フィールドは `FieldMeta` そのもの（`undefined` 扱いは「registry 未登録」に変更）
- registry 未登録フィールドは `fields` 配列から除外（現状と同等挙動）

#### 1.4 22 セクション `schema.ts` 書き換え

対象ファイル:

```
src/shared/lib/sections/definitions/concept/schema.ts
src/shared/lib/sections/definitions/contact-form/schema.ts
src/shared/lib/sections/definitions/cta/schema.ts
src/shared/lib/sections/definitions/custom/schema.ts
src/shared/lib/sections/definitions/embed/schema.ts
src/shared/lib/sections/definitions/event-calendar/schema.ts
src/shared/lib/sections/definitions/faq-list/schema.ts
src/shared/lib/sections/definitions/features/schema.ts
src/shared/lib/sections/definitions/gallery/schema.ts
src/shared/lib/sections/definitions/hero/schema.ts
src/shared/lib/sections/definitions/hero-parallax/schema.ts
src/shared/lib/sections/definitions/homepage-cta/schema.ts
src/shared/lib/sections/definitions/homepage-features/schema.ts
src/shared/lib/sections/definitions/homepage-how-it-works/schema.ts
src/shared/lib/sections/definitions/homepage-spaces/schema.ts
src/shared/lib/sections/definitions/instagram/schema.ts
src/shared/lib/sections/definitions/map/schema.ts
src/shared/lib/sections/definitions/news-list/schema.ts
src/shared/lib/sections/definitions/post-list/schema.ts
src/shared/lib/sections/definitions/space-list/schema.ts
src/shared/lib/sections/definitions/space-showcase/schema.ts
src/shared/lib/sections/definitions/testimonial/schema.ts
```

変更内容:

- `import { field } from "../../field-helpers"` → `import { field } from "../../field-registry"`
- 各 `field.xxx(label, opts)` 呼び出しで `group` を明示（Phase 1 では全フィールド `"content"` または schema 固有の自然な振り分けで付与。本格的な振り分けは Phase 4 で完成）
- この Phase では振り分け原則だけ適用:
  - variant / height / overlay / overlay opacity / heightCustom / columns / align → `"design"`
  - limit / sort / filter / categoryId / tagId / publishedOnly → `"advanced"`
  - その他（title / subtitle / image / button text / URL / video URL / description） → `"content"`

#### 1.5 `src/shared/lib/sections/field-helpers.ts` 削除

**破壊的変更**。削除前に全参照元が `field-registry.ts` に移行済みであることを `Grep "from.*field-helpers"` で確認。

#### 1.6 テスト

新規 `__tests__/unit/shared/lib/sections/field-registry.test.ts`:

- `field.text("見出し")` で schema + registry 両方に正しく登録される
- `fieldRegistry.get(schema)` で `FieldMeta` を取得できる
- `group` 省略時 `"content"` が default
- 各 field ヘルパー（text / textarea / number / boolean / select / color / image / url / icon / array / group）の metadata 形が正しい
- registry 未登録の素の `z.string()` は `fieldRegistry.get()` で `undefined`

既存 `__tests__/unit/shared/lib/sections/zod-introspection.test.ts` 更新:

- registry 経由で field 抽出できる
- 22 セクションの代表的 schema で期待通りの FieldInfo[] が返る

#### 1.7 `package.json` scripts の test:unit バッチ追加

`bun test __tests__/unit/shared/lib/sections` がまだバッチに無ければ追加（`mock.module` 干渉回避のため per-directory 指定 — ADR 0010）。

#### 1.8 検証

- `bun run validate && bun run build` 緑
- `bun test __tests__/unit/shared/lib/sections`（新規テスト + 既存の全件パス）
- `/admin/pages/home/edit` を手動で開き、現状と同等の表示が出ることを確認

#### 1.9 commit

```
refactor(sections): migrate to Zod 4 .meta() + z.registry<FieldMeta>() (ADR 0018)

- Replace .describe(JSON.stringify()) with z.registry<FieldMeta>()
- Add FieldMeta.group: "content" | "design" | "advanced" (required)
- Rewrite 22 section schemas to use new field-registry
- Delete field-helpers.ts (breaking change, no backward compat)
- Rewrite zod-introspection.ts to use fieldRegistry.get() directly
- Add unit tests for field-registry + updated zod-introspection tests
```

---

## Phase 2: AutoSectionForm Accordion 3 層化（1 commit）

### 目的

WAI-ARIA APG Accordion パターン準拠で、Content（常時展開）/ Design / Advanced（Accordion 折りたたみ）に UI を分離。

### タスク

#### 2.1 `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` 書き換え

- `fields` を `meta.group` で 3 配列に分離（`contentFields` / `designFields` / `advancedFields`）
- Content は従来どおり `<div className="space-y-4">` で展開
- Design + Advanced は Radix `<Accordion type="multiple">` で既定閉じ
- `AccordionItem` の見出しは「デザイン」「詳細設定」
- field が 0 個のグループは Accordion Item を出さない
- Accordion 全体も field が 0 個なら `<Accordion>` 要素自体を出さない

#### 2.2 shadcn/ui Accordion 確認

既存の `@/admin/components/ui/accordion` が import 可能か確認。なければ shadcn CLI で追加。

#### 2.3 スタイル

- Accordion の `AccordionTrigger` は既存設定セクション（`PermissionsSection` 等）と統一（`bg-muted/50 rounded-lg border px-4`）
- `AccordionContent` は `pt-2 pb-4 space-y-4`
- `data-[state=open]:border-b` は不要（content 自体に space-y）

#### 2.4 テスト（E2E or manual）

- 17 セクションタイプを一通り開いて group 分離が正しく動くか
- Accordion 閉じ状態で Tab キーが次の要素に飛ぶか（a11y）
- Accordion Trigger に Enter / Space で展開するか

#### 2.5 検証 + commit

```
feat(admin-pages): split AutoSectionForm into Content / Design / Advanced accordion

- Content group always expanded (zero-click for text/image edits)
- Design + Advanced groups in Radix Accordion (type="multiple", default closed)
- Follows WAI-ARIA APG Accordion pattern
- Aligns with Payload CMS + Sanity Studio field grouping best practices
```

---

## Phase 3: AutoImageField 強化（1 commit）

### 目的

画像フィールドを大型サムネイル + Drag & Drop に強化。

### タスク

#### 3.1 `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoImageField.tsx` 書き換え

- サムネイル 64×64 → 160×120（`aspect-[4/3] w-40`）
- Drag & Drop 対応（`onDragOver` / `onDragLeave` / `onDrop`）
- Drop されたファイルを既存 upload エンドポイントに POST（`/admin/api/media/upload` または既存 Server Action）
- 画像表示中は hover overlay で「変更 / 削除」ボタン
- 空状態は「画像を選択 / ドロップ」の文言 + `IconPhotoPlus` 8×8
- アップロード中は `<Spinner />` + `aria-busy`
- エラー時は `toast.error` + アップロード前の状態に戻す

#### 3.2 既存 `useSingleMediaPicker` との統合

- 「変更」ボタンは従来どおり MediaPicker を開く
- ドロップされたファイルは MediaPicker を介さず直接アップロード → Media レコード作成 → URL 反映
- 既存 upload flow（R2 S3 Client）を再利用

#### 3.3 MediaPicker 起動前 preview の fallback

- 画像 URL が有効でも next/image が fetch 失敗する場合（R2 access denied 等）のフォールバック UI を追加（`onError` で placeholder）

#### 3.4 テスト

- 単体テスト（新規）`__tests__/unit/admin/auto-image-field.test.tsx` は不要（統合テストは手動確認で十分）
- 手動確認: `/admin/pages/home/edit` でヒーロー背景画像を Drag & Drop でアップロード → 保存 → 再読み込みで反映

#### 3.5 検証 + commit

```
feat(admin-pages): upgrade AutoImageField with larger thumbnail and drag-and-drop

- Thumbnail 64x64 → 160x120 (4:3 aspect ratio)
- Drop files to upload directly (no MediaPicker roundtrip)
- Hover overlay with "変更 / 削除" actions
- Aria-busy during upload
```

---

## Phase 4: ラベル日本語 UX 改善（1 commit）

### 目的

22 セクション全フィールドの `label` と `helpText` を運用者視点の自然な日本語に統一 + 正式な group 振り分け。

### タスク

#### 4.1 22 セクション `schema.ts` のラベル・helpText・group リライト

**リライトガイドライン**:

- 英語 jargon（"CTA" / "Variant" / "Opacity"）→ 日本語
- 技術単位（`svh` / `px`）→ `suffix` で表示、label には入れない
- 真偽フィールドの label は「〜する / しない」形式で動詞（toggle 用途）
- 画像フィールドは「〜画像」または「〜の画像」で統一
- 数値フィールドで範囲の意味が重要なものは `helpText` で補足（例: `"0% は透明、100% は完全に黒"`）
- group 最終振り分け:
  - **content** (常時展開): title / subtitle / description / image / button text / URL / quote / video URL / location / embed code
  - **design** (折りたたみ): variant / layout / height / heightCustom / overlay / overlayOpacity / columns / align / accentColor / rounded / withBorder
  - **advanced** (折りたたみ): limit / perPage / sort / sortOrder / filter / categoryId / tagId / locationId / publishedOnly / showIf / customClass

#### 4.2 代表リライト例

```ts
// Before (hero/schema.ts)
variant: field.select("バリエーション", { options: variantOptions, default: "default" }),
overlay: field.boolean("オーバーレイ", { default: true }),
overlayOpacity: field.number("オーバーレイ不透明度", { min: 0, max: 100, default: 40 }),

// After
variant: field.select("レイアウトの種類", {
  options: variantOptions, default: "default",
  helpText: "ヒーローセクションの見せ方を選びます",
  group: "design",
}),
overlay: field.boolean("背景画像に黒いオーバーレイを重ねる", {
  default: true,
  group: "design",
}),
overlayOpacity: field.number("オーバーレイの濃さ", {
  min: 0, max: 100, default: 40,
  helpText: "0% は透明、100% は完全に黒",
  suffix: "%",
  group: "design",
}),
```

#### 4.3 22 セクション一括確認（チェックリスト）

各ファイルで確認:

- [ ] 全フィールドに `group` が明示されている（Phase 1 で足りなければここで追加）
- [ ] label が日本語 UX フレンドリー
- [ ] 技術単位は `suffix` に分離
- [ ] 必要に応じて `helpText` で補足
- [ ] boolean は動詞形 label
- [ ] 英語 jargon がない

#### 4.4 検証 + commit

```
refactor(sections): rewrite field labels to beginner-friendly Japanese

- 22 sections: English jargon → natural Japanese (e.g. "Variant" → "レイアウトの種類")
- Booleans use verb phrasing ("〜する / 〜しない")
- Technical units (svh, px, %) moved to `suffix`
- Added `helpText` for range-sensitive fields (overlay opacity, limit, etc.)
- Finalized group assignment (content / design / advanced)
```

---

## 全 Phase 完了後

### 最終検証

```bash
bun run validate && bun run build
bun test __tests__/unit/shared/lib/sections
# /admin/pages/home/edit を手動で開き、全 17 セクションを選択 → Accordion 動作確認
# /admin/pages/about/edit など他ページも代表的にチェック
```

### E2E（任意）

既存の `e2e/admin/` 配下に `page-section-edit.spec.ts` があれば動作確認。なければ手動で十分。

### ロールバック計画

各 Phase が独立した commit なので、問題発生時は `git revert <sha>` で個別撤退可能。特に Phase 1 は DB への変更なし（`Section.config` JSON 構造は無変更）。

---

## 進行ログ（実装時に追記）

### Phase 1

- [ ] ADR 0018 作成
- [ ] field-registry.ts 作成
- [ ] zod-introspection.ts 書き換え
- [ ] 22 セクション書き換え
- [ ] field-helpers.ts 削除
- [ ] テスト追加
- [ ] validate + build 緑
- [ ] commit

### Phase 2

- [ ] AutoSectionForm 書き換え
- [ ] Accordion import 確認
- [ ] 手動動作確認
- [ ] validate + build 緑
- [ ] commit

### Phase 3

- [ ] AutoImageField 書き換え
- [ ] Drag & Drop 動作確認
- [ ] validate + build 緑
- [ ] commit

### Phase 4

- [ ] 22 セクション label リライト
- [ ] group 最終振り分け
- [ ] validate + build 緑
- [ ] commit
