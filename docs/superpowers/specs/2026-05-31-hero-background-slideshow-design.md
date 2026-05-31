# Hero 背景スライドショー 設計

## 背景 / 目的

`hero` セクション (`StandardHeroSection`) と `page-hero` の `media` variant (`PageHero`) の全面背景メディアは、現在「画像1枚 or 動画1本」の単一フィールド (`createMediaGroupSchema` 由来の `{ url, alt, caption }` group) である。これを **複数の画像・動画（混在可）を自動で切り替えるスライドショー** に拡張する。

`page-hero` の `editorial-split` variant は既に複数画像カルーセル対応済みだが、これは雑誌カバー風 2 カラム split レイアウトで別物。本件は **全面背景 hero 2 種** のみを対象とする。

## 要件

- 背景に複数の画像/動画を登録し、自動で順に切り替わる
- 画像・動画の混在を許容する
- 動画スライドの挙動:
  - **R2 / 自前 mp4**: 再生完了 (`onEnded`) を待って次へ送る
  - **YouTube / Vimeo**: 終了検知に各社 JS SDK が必要なため、今回は **固定秒フォールバック** で送る（SDK 新規導入はスコープ外）
- ループは **スライドショー全体** で行う（最後 → 最初へ繰り返し）
- メディアが 1 つだけのときは従来挙動（動画 = `loop` 背景 / 画像 = 静止）
- `prefers-reduced-motion` 時は自動送りを停止し先頭スライドのみ表示

## 対象範囲

| 対象                         | 内容                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| ✅ `hero` セクション         | `hero/schema.ts` の `backgroundMedia`, `StandardHeroSection.tsx`                                          |
| ✅ `page-hero` media variant | `page-hero/schema.ts` の `mediaSchema.media`, `PageHero` media 描画                                       |
| ✅ 共有                      | `createMediaGroupSchema` ファクトリ（配列化）、新 `HeroBackgroundSlideshow` component、`VideoPlayer` 拡張 |
| ❌ 対象外                    | `page-hero` `editorial-split`（既存カルーセル）/ `minimal` / `compact` variant、`gallery` セクション      |

## データモデル（クリーンブレイク）

共有ファクトリを **配列化** する。後方互換の dual-field は採らない（プロジェクト規約: 後方互換ハック禁止）。

- ファクトリを `createMediaArraySchema(label)` にリネーム/変更し、`field.array(label, { subGroup: "media", fields: { url: field.media({ accept: "image-or-video" }), alt, caption } })` + 重複禁止 `refine` + `.default([])` を返す（`gallery` の `media` 配列と同型）
- 消費者は **2 箇所のみ**: `hero.backgroundMedia` / `page-hero.mediaSchema.media`（＝ファクトリ変更でドリフトしない）
- 旧データ `{ url, alt, caption }`（単一オブジェクト）は **読み取り時 preprocess** で `[{ ... }]` に正規化（`url` 空なら `[]`）。`decodePortableTextInput` と同じ手法でデプロイ移行スクリプト不要
- 追加フィールド（両スキーマ・design group）:
  - `transition`: `crossfade` | `ken-burns`（default `crossfade`）
  - `autoPlayInterval`: 画像スライドの表示秒数（default `5`、min `2`、max `20`）

## 描画

### 共有 `HeroBackgroundSlideshow`（client component）

- props: `items: { url, alt, caption }[]`, `transition`, `autoPlayInterval`, `parallaxSpeed?`, `priority`
- GSAP Pattern C（`ref` + `gsap.to` + `useMotionPreference` + アンマウント時 `killTweensOf` cleanup。homepage `hero-section.tsx` と同方式）
- スライド送りロジック（アクティブスライドの種別で分岐）:
  - 画像: `autoPlayInterval` 秒で送る。`ken-burns` 時はゆっくりズーム
  - R2 mp4: `<video loop={false} onEnded>` で再生完了時に送る
  - YouTube / Vimeo: 固定秒（`autoPlayInterval`）フォールバックで送る
- メディア 1 要素: 従来挙動（動画 `loop` 背景 / 画像静止、自動送りなし）
- ループ: 最後 → 最初
- `prefers-reduced-motion`: 先頭スライドのみ静止表示、自動送りなし

### `StandardHeroSection`

- `default` / `parallax`: 全面背景スライドショー。`parallax` は **単一画像時のみ** scrub パララックス、複数なら `crossfade`（scrub なし）に切替（パララックスとスライドショーは併用不可）
- `split`: 右カラム内で `crossfade` スライドショー
- `minimal`: メディアなし（変更なし）
- `overlay` / `overlayOpacity`: 既存維持

### `PageHero` media variant

- 全面背景スライドショー（`HeroBackgroundSlideshow` 共有）
- `posterImage`: 動画 load 中 / autoplay 失敗時の fallback として維持

## `VideoPlayer` 拡張

- optional `onEnded?: () => void` + `loop?: boolean` を追加（未指定時は現挙動維持＝`background` は `loop=true`）
- スライドショーは R2 mp4 に `loop={false}` + `onEnded` を渡す
- iframe provider（YouTube/Vimeo）は `onEnded` 不発火 → スライドショー側の固定秒フォールバックで送る
- pure render / client 両境界からの利用互換は維持

## アクセシビリティ

- `prefers-reduced-motion`: 自動送り停止 + 先頭表示
- tab 非表示時は停止（`visibilitychange`、homepage hero と同方針）
- `overlay` でメディア上テキストの可読性（WCAG 1.4.3）を既存通り確保

## defaults / parsing

- `getHeroConfig`（`section-defaults`）と `page-hero` defaults に `backgroundMedia` / `media: []`、`transition`、`autoPlayInterval` を追加
- `safeParse({})` 成立を維持（配列は `.default([])` で `.min()` を skip する Zod 4 公式挙動）

## テスト

- `hero` schema: `safeParse({})` / 配列重複 `refine` / 旧形式 preprocess wrap
- `page-hero` `media` variant schema: 同上
- `VideoPlayer`: `onEnded` / `loop` prop の挙動
- `registry.test`: セクション数 **22** 不変（新規 section type ではないため）

## ブランチ / PR 粒度

- 新ブランチ `feat/hero-background-slideshow`（`origin/main` 基点、gallery `#356` とは独立）
- PR 粒度: 300 行 / 10 file を超えそうなら 2 段スタックに分割
  - ① schema + 共有ファクトリ + 共有 `HeroBackgroundSlideshow` + `hero` セクション
  - ② `page-hero` media variant 配線
- 注: PR `#356`（gallery）は現在 CI FAIL だが本機能とは無関係（別途対応）

## 実装時に確認する事項

- `HeroBackgroundSlideshow` の配置パス（`StandardHeroSection` と `PageHero` 双方から import できる共有場所）
- `ken-burns` トランジションは video スライドでは無効化（画像のみ適用）
- `VideoPlayer` iframe の終了検知は将来の SDK 統合で改善余地あり（今回スコープ外、固定秒で許容）
