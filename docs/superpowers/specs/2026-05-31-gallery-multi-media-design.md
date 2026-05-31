# Gallery セクション マルチメディア化 設計

> 2026-05-31 / Gallery セクションを「画像のみ複数」から「画像・動画 混在の複数メディア」へ clean-break

## 背景・課題

ページ管理（Dynamic Section Architecture）のメディア入力は現状 2 系統に分かれている。

| 仕組み                                                            | 複数 | 画像/動画    |
| ----------------------------------------------------------------- | ---- | ------------ |
| Gallery セクション (`field.array` + `field.image`)                | ✅   | **画像のみ** |
| 単一メディアフィールド (`field.media` / `createMediaGroupSchema`) | ❌   | 画像 or 動画 |

「複数の画像・**動画**を並べたい」という要件を満たす箇所が存在しない。Gallery は既に「複数」を実現しているため、唯一の欠落である「動画」を埋めるのが最小かつ最クリーンな解になる。

## ゴール

- Gallery セクションで画像・動画を **混在で複数** 登録できる。
- 公開側は各アイテムを runtime に image/video 判定して出し分ける。
- 後方互換マッパーは作らない（clean break）。既存データはマイグレーションで移行。

## 非ゴール（採用しない案と理由）

- **汎用 `field.mediaArray` ヘルパー新設** — 複数メディアの消費者は Gallery のみ。「過剰抽象化禁止（3 箇所未満は抽象化しない）」に反する。`field.array` × `field.media` のインライン表現で足りる。
- **単一メディア箇所（Hero 等）の複数化（スライダー）** — 別 UX 要件・別スコープ。今回は対象外。

## 設計

### ① スキーマ（`src/shared/lib/sections/definitions/gallery/schema.ts`）― 破壊的変更

- フィールドキー `images` → **`media`**（実体が画像・動画混在になるため意味的に正名）。
- item の `url: field.image("画像")` → `url: field.media("メディア", { accept: "image-or-video" })`。
- `alt` / `caption` は維持。uniqueness refine（`new Set(media.map(m => m.url)).size === media.length`）の参照を `images` → `media` に更新。
- `GalleryConfig` 型は `z.infer` で自動追従（`media` プロパティになる）。

公式 idiom（WordPress Cover Block / Sanity polymorphic media）に沿い、type discriminator は持たず公開側で URL から派生する。

### ② 公開レンダラ（`src/app/(public)/_components/GallerySection.tsx`）

- `config.images` 参照を全て `config.media` に置換。
- 各アイテムを `detectMediaSourceType(item.url)`（`@/shared/lib/media/detect-media-type`）で分岐:
  - **画像** → 現状どおり `<button onClick={openLightbox}>` + `<Image>`。クリックで lightbox 拡大。
  - **動画** → `<VideoPlayer url={item.url} variant="controls" title={item.alt}>`（`@/public/components/design-system/video-player`）をその場でインライン再生。**lightbox の `<button>` で包まない**（`<video controls>` / `<iframe>` を `<button>` 内にネストすると HTML 違反 + hydration mismatch になるため）。
- **lightbox の index 対象は画像サブセットのみ**。grid map は全 `media` を走査し per-item 分岐、lightbox 操作は `media.filter(m => detectMediaSourceType(m.url) !== "video")` の配列を index する。
- grid / masonry / carousel レイアウト、GSAP stagger reveal、`key={item.url}` はそのまま流用。
- 空判定 `config.media.length === 0` で early return（既存 `images.length === 0` と同等）。

### ③ 管理 UI ― コード変更なし

- `AutoArrayField` + `AutoMediaField` が `field.array` 内の `field.media` を汎用ディスパッチで既に描画する。メディアピッカー（画像 or 動画 / R2・YouTube・Vimeo URL）が自動で表示される。
- ビルド時に `AutoFieldByType` の `media` fieldType → `AutoMediaField` dispatch を実機確認するのみ（新規配線なし）。

### ④ メタデータ（`src/shared/lib/sections/definitions/gallery/metadata.ts`）

- ラベル「画像ギャラリー」→「メディアギャラリー」、説明文を画像・動画対応に更新。

### ⑤ データ移行

- 既存 DB の `Section.config` のうち `type === "gallery"` のレコードについて、`config.images` → `config.media` へキー rename する `bun -e` 冪等スクリプト（後方互換マッパーは作らない）。
- 既存の画像 URL 値はそのまま有効（画像は valid な media）。
- gallery は seed（`DEFAULT_PAGE_SECTIONS` / `seed.ts`）の対象外のため、移行はユーザー作成分のみ。seed 変更は不要。

### ⑥ テスト

- `__tests__/unit/lib/validations/section.test.ts` の gallery `images` 参照を `media` に更新。
- gallery schema の `safeParse({})` 成立 / `media` 配列 / uniqueness refine（同一 URL 重複拒否）/ `field.media` accept のテストを追加・更新。

## 影響範囲（`.images` 直接参照）

- `src/app/(public)/_components/GallerySection.tsx`（レンダラ）
- `__tests__/unit/lib/validations/section.test.ts`（テスト）
- `src/shared/lib/sections/definitions/gallery/schema.ts`（定義）

型経由の配線（`registry.ts` / `validations/section.ts` / `section-defaults.ts`）は `GalleryConfig` / `galleryConfigSchema` 参照のため rename に自動追従し、コード変更不要。

## 検証

- `bun run validate && bun run build`
- `bun test __tests__/unit/lib/validations/section.test.ts` + gallery schema test
- 公開ページで gallery セクションに画像・動画を混在登録 → grid 表示・動画インライン再生・画像 lightbox を実機確認
- a11y: 動画アイテムが button ネストを起こしていないこと（`audit-a11y` skill で確認）

## 規模・PR 粒度

1 PR = 1 logical change。schema 破壊的変更を含むため単独 PR。schema + renderer + metadata + 移行スクリプト + テストで 300 行以内の見込み。
