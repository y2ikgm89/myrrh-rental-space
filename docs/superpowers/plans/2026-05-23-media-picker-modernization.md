# 207: MediaPicker モダナイゼーション (動画 / 音声 / ファイル統合)

## 概要

現在 `field.url()` ベースで URL 入力のみだった hero.videoUrl / Lexical Audio Node / Lexical File Node を、業界標準の Asset Manager 統合 (WordPress Video Block / Sanity Studio / Webflow 直系) に刷新する。R2 既存ストレージ (10GB 無料枠 + egress 無料) を再利用し、self-host (R2 アップロード) + 外部埋め込み (YouTube/Vimeo) のハイブリッド UX を実現する。`r2/image-magic-bytes.ts` を `r2/media-magic-bytes.ts` に一般化し、`field.media` + `AutoMediaField` を新規導入。SSoT 規律 (`ssot-singletons.md`) を更新して動画 / 音声 / ファイルも MediaPicker 統合対象に編入する。

## 業界準拠の根拠

- WordPress Video Block: アップロード / ライブラリ / URL の 3 経路 (`elementor.com/blog/how-to-embed-video-in-wordpress-guide/`)
- Sanity Studio: `defineType({ type: "file", options: { accept: "video/*" } })` で MIME filter
- Cloudflare R2: 10GB 無料 + egress 無料 (`developers.cloudflare.com/r2/pricing/`) — 動画 self-host が実質無料で可能
- 公式 SSRF 規律: `isUrlSafe()` を外部 URL 受け入れ時に必須 (`auth-patterns/admin-actions.md`)

## 破壊的変更 (後方互換なし)

- `hero.videoUrl: string` → `hero.video: { url: string; source: "r2" | "external"; provider?: "youtube" | "vimeo" }`
- `r2/image-magic-bytes.ts` → `r2/media-magic-bytes.ts` (rename + 一般化、旧 path への re-export なし)
- `SUPPORTED_IMAGE_MIME_TYPES` → `SUPPORTED_MEDIA_MIME_TYPES`
- `MediaPickerField` / `useSingleMediaPicker` の `defaultUsage` 型に video/audio/file が物理的に通るよう Media model `MediaType` enum を実運用化
- `Lexical AudioNode` / `FileNode` Inspector の URL `<Input>` 直接入力廃止 → MediaPicker 強制

## フェーズ分割 (PR 単位)

### Phase 1: R2 multi-MIME 基盤 (PR1)

#### 実装内容

- `r2/image-magic-bytes.ts` を `r2/media-magic-bytes.ts` に rename + 一般化
- video (mp4 ftyp / webm EBML) / audio (mpeg / wav) / document (pdf %PDF) の magic-byte 検出追加
- `SupportedMediaMimeType` 型 + `MEDIA_MIME_EXTENSIONS` 拡張
- 各 MIME 別 max size 制約 (image 5MB / video 50MB / audio 20MB / document 10MB)
- `MediaType` enum (`IMAGE` / `VIDEO` / `AUDIO` / `DOCUMENT`) を `mimeType → MediaType` 派生関数で実運用化
- Media model `mimeType` 列の型 narrow 更新

#### 新規ファイル

- `src/shared/lib/r2/media-magic-bytes.ts` - 一般化された magic-byte 検出 (image/video/audio/document)
- `src/shared/lib/r2/media-type-derivation.ts` - `mimeType → MediaType` 派生 SSoT
- `__tests__/unit/r2/media-magic-bytes.test.ts` - magic-byte 検出 + size 制約 test

#### 削除ファイル

- `src/shared/lib/r2/image-magic-bytes.ts` (rename されたため)

#### 変更ファイル

- `src/shared/lib/r2/keys.ts` - `generateStorageKey({ contentType })` の拡張子派生対応
- `src/shared/lib/r2/upload.ts` - `FileValidation.allowedTypes: SupportedMediaMimeType[]`
- `src/app/(admin)/admin/api/media/upload/route.ts` - MIME filter 拡張
- `src/shared/domain/media/commands.ts` - `media.create` で `MediaType` 自動判定

### Phase 2: field.media + AutoMediaField (PR2)

#### 実装内容

- `field.media({ accept })` 新規導入 (accept: "image" | "video" | "audio" | "file" | "any")
- `AutoMediaField` (AutoImageField を一般化、accept で MIME filter + プレビュー)
- `useSingleMediaPicker` の accept option 追加
- `MediaPickerDialog` の Library tab で accept 引数による MIME filter
- 動画/音声プレビュー (HTML5 `<video>` `<audio controls>`、PDF は thumbnail icon)
- `MediaPickerDialog` の URL タブで accept 別 placeholder ヒント表示

#### 新規ファイル

- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoMediaField.tsx` - 一般化メディア field
- `src/admin/components/media-picker/MediaPreview.tsx` - MIME 別プレビュー primitive
- `__tests__/unit/components/admin/AutoMediaField.test.tsx`

#### 変更ファイル

- `src/shared/lib/sections/field-registry.ts` - `field.media` helper 追加 + FieldType 型に `"media"` 追加
- `src/admin/hooks/use-media-picker.tsx` - `accept?: MediaAcceptType` option
- `src/admin/components/media-picker/MediaPickerDialog.tsx` - Library/Upload/URL タブで accept 適用
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` - `case "media"` 分岐
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx` - `fieldType === "media"` 分岐
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection.ts` - media field 認識

### Phase 3: hero.video migration + VideoPlayer Primitive (PR3)

#### 実装内容

- `hero.videoUrl: field.url()` → `hero.video: field.media({ accept: "video" })` 破壊的変更
- 公開側 `<VideoPlayer>` Primitive 新規 (R2 → `<video controls poster>`、YouTube/Vimeo → `<iframe>` 自動 dispatch)
- URL pattern detect (`youtube.com/watch` / `youtu.be/` / `vimeo.com/`) で provider 判定
- oEmbed API でサムネ自動取得 (admin 入力時のプレビュー強化)
- DB migration: 既存 `Section.config.videoUrl` (string) → `video` ({ url, source, provider? }) 変換 (PL/pgSQL data-preserving)
- StandardHeroSection video variant の `<video>` 直書きを `<VideoPlayer>` に置換

#### 新規ファイル

- `src/public/components/design-system/video-player.tsx` - R2/YouTube/Vimeo 自動 dispatch SC primitive
- `src/shared/lib/video/url-detect.ts` - URL pattern → provider 判定 (純粋関数)
- `src/shared/lib/video/oembed.ts` - YouTube/Vimeo oEmbed API client (admin プレビュー用)
- `prisma/migrations/<ts>_section_hero_video_url_to_object/migration.sql` - data-preserving 変換
- `__tests__/unit/shared/lib/video/url-detect.test.ts`
- `__tests__/integration/sections/hero-video-migration.test.ts`

#### 変更ファイル

- `src/shared/lib/sections/definitions/hero/schema.ts` - `videoUrl` → `video` (`field.media({ accept: "video" })`)
- `src/app/(public)/_components/StandardHeroSection.tsx` - `<VideoPlayer>` 利用
- `src/shared/lib/sections/section-defaults.ts` - hero defaults 更新
- `prisma/seed.ts` - hero section seed の video 形式更新

### Phase 4: Lexical Audio Node MediaPicker 統合 (PR4)

#### 実装内容

- `AudioInspectorPanel` の URL `<Input>` を `useSingleMediaPicker({ accept: "audio" })` に置換
- `AudioPlugin` 挿入 dialog も MediaPicker 経由
- 公開側 `<audio controls>` レンダリング維持 (R2 URL 直接配信)
- 音声サムネ icon は `IconMusic` で統一

#### 変更ファイル

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/AudioInspectorPanel.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/AudioPlugin.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/AudioNode.tsx` - URL 直接書込ではなく MediaPicker 結果受領

### Phase 5: Lexical File Node MediaPicker 統合 (PR5)

#### 実装内容

- `FileInspectorPanel` の URL `<Input>` を `useSingleMediaPicker({ accept: "file" })` に置換
- `FilePlugin` 挿入 dialog も MediaPicker 経由
- File card 表示 (file name + size + download link、`<a download>` 経由 R2 配信)
- PDF / Excel / PowerPoint 等の icon 自動判定 (mimeType → icon map)

#### 変更ファイル

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/FileInspectorPanel.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/FilePlugin.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FileNode.tsx`

### Phase 6: SSoT 規律更新 + docs (PR6)

#### 実装内容

- `.claude/rules/ssot-singletons.md` の `useSingleMediaPicker` エントリ更新
  - 「対象外」リストから `audio` / Lexical Audio / Lexical File を削除
  - 動画は「self-host R2 + 外部 URL (YouTube/Vimeo) のハイブリッド」と明文化
  - 新規 `field.media` + `AutoMediaField` を SSoT 化
- `.claude/rules/ssot-singletons.md` の `r2/image-magic-bytes` 関連エントリを `media-magic-bytes` に rename
- `CLAUDE.md` クリティカルルールに「動画/音声/ファイルは MediaPicker 強制、外部 URL は YouTube/Vimeo のみ」追加検討
- `docs/how-to/` に運用手順は追加しない (rule docs / SSoT で完結)

#### 変更ファイル

- `.claude/rules/ssot-singletons.md`
- `.claude/rules/frontend/admin-ui/forms/widgets.md` - `field.url` から `field.media` への移行例追記
- `docs/superpowers/plans/2026-05-23-media-picker-modernization.md` - 全 Phase 完了後に削除

## 検証 (各 Phase 完了時)

- [ ] `bun run validate` 通過 (type-check + lint)
- [ ] `bun run build` 成功
- [ ] `bun run test:unit` 全 pass
- [ ] `bun run test:integration` 全 pass
- [ ] e2e: admin で動画アップロード → 公開ページで再生確認 (Playwright MCP)
- [ ] `architecture-boundaries.test.ts` 通過 (新規 `r2/media-magic-bytes` 含む)
- [ ] R2 free tier 10GB 内で動作確認 (動画 file size 上限 50MB)
- [ ] SSRF guard: 外部 URL 受領経路で `isUrlSafe()` 経由を grep で確認

## マイグレーション

Phase 1: 不要 (rename のみ、enum 値追加なし)
Phase 3: **要マイグレーション** — `prisma/migrations/<ts>_section_hero_video_url_to_object/migration.sql`

- PL/pgSQL で `Section.config->>'videoUrl'` を `Section.config->'video'` の object 形式に data-preserving 変換
- 既存 URL は `{ url: <既存値>, source: "external" }` で wrap (YouTube/Vimeo URL pattern で provider 推定)
  Phase 4-5: 不要 (Lexical Node の JSON 構造は既存維持、Inspector UI のみ変更)

## 環境変数

なし — R2 既存 credential (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`) を流用。

## 受入基準

1. hero.video フィールドが admin で「アップロード / ライブラリ / URL」3 経路選択可能
2. R2 アップロードした mp4 が公開 hero で `<video controls poster>` で再生
3. YouTube/Vimeo URL 入力で `<iframe>` 自動生成 + サムネプレビュー表示
4. Lexical Audio Node が `useSingleMediaPicker({ accept: "audio" })` 経由でのみ音声選択可能
5. Lexical File Node が `useSingleMediaPicker({ accept: "file" })` 経由でのみファイル選択可能
6. 50MB 超過動画 / 20MB 超過音声 / 10MB 超過ドキュメントは upload 段階で reject
7. magic-byte 不一致 (mp4 偽装 HTML 等) は upload 段階で reject
8. SSRF guard が外部 URL 受領経路で動作 (admin が `file://` / 内部 IP を入力 → reject)
9. SSoT 規律 (`ssot-singletons.md`) が新仕様を正しく記述
10. `bun run validate && bun run build` 全 Phase 完了時 exit 0

## リスク

- **DB migration 失敗**: 既存 hero.video セクションが破損 → backup ロールバック手順を migration ファイル冒頭にコメント
- **R2 容量超過**: ユーザーが 10GB 超アップロード → admin UI で R2 使用量警告 (`/admin/media` 画面に容量 progress bar 追加検討、本 plan の scope 外)
- **oEmbed API 障害**: YouTube/Vimeo サムネ取得失敗 → fallback で URL のまま表示、admin UI に reload ボタン
- **Lexical Node JSON 構造変更**: AudioNode / FileNode の既存 export 形式維持を保証 (Inspector UI のみ刷新)

## 進行順序

1. Phase 1 (R2 multi-MIME 基盤) — 全 Phase の前提
2. Phase 2 (field.media + AutoMediaField) — Phase 3-5 の前提
3. Phase 3 (hero.video migration + VideoPlayer) — 独立、Phase 4-5 と並行可能
4. Phase 4 (Lexical Audio) — Phase 5 と並行可能
5. Phase 5 (Lexical File) — Phase 4 と並行可能
6. Phase 6 (SSoT 規律更新) — 全 Phase 完了後に一括 (drift 防止)
