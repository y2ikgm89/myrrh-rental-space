# Lexical リンクカード（内部 / 外部）設計

> 作成セッション: 2026-05-30
> 対象: 管理画面 Lexical エディタの本文中に「内部リンクカード」「外部リンクカード」を挿入する機能

## 1. 背景・目的

Lexical 本文中から、サイト内コンテンツ（記事 / お知らせ / スペース / イベント）や外部 URL へ
**リッチなリンクカード**で導線を張りたい。現状は外部 URL の OGP カード（`BookmarkNode`）のみで、
内部コンテンツを参照する手段がない。

業界調査（WordPress Simple Link Embed / Notion bookmark+mention / Ghost bookmark card /
Sanity Portable Text internal-reference vs external-link）の結論として、
**内部リンクと外部リンクはデータモデルが本質的に異なる**ため、UX は統一しつつ実装を分離する。

|                       | 外部リンクカード                                                                     | 内部リンクカード                                                          |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| データ                | URL + OGP スナップショット（title / desc / image / favicon / siteName をキャッシュ） | 参照のみ `{ contentType, contentId }`                                     |
| 解決タイミング        | 保存時にベイク（外部データは非所有 → キャッシュするしかない）                        | **公開描画時に解決**（自社データ → 常に最新の title / サムネ / 公開状態） |
| スラッグ変更          | 影響なし（URL 直）                                                                   | **強い**（id 参照 → slug 変化に追従）                                     |
| 参照先が削除 / 非公開 | カードは残る（既存挙動）                                                             | **自動で非表示**（404 カードを防ぐ）                                      |
| 実装ノード            | `BookmarkNode` を流用（ラベルを「外部リンクカード」へ）                              | 新規 `InternalLinkCardNode`                                               |

設計原則: 「外部は所有しないからキャッシュ」「内部は所有するから描画時に新鮮に解決」。
これは Sanity の reference vs URL と同じ理屈で、本機能の唯一の核となる判断。

## 2. ゴール / 非ゴール

### ゴール

- ツールバー「挿入」とスラッシュメニューに **統一「リンクカード」項目** を 1 つ追加
- ダイアログ内 2 モード:
  - **サイト内から選ぶ** — posts / news / spaces / events を検索ピッカー → 内部カード（参照）
  - **外部 URL** — URL 入力 → OGP 取得 → 外部カード（既存 `BookmarkNode` を流用）
- 内部カードは公開描画時に最新データへ解決。参照先が削除 / 非公開なら自動で非表示
- 既存「ブックマーク」挿入項目はこの「外部 URL」モードに統合（破壊的変更許容）

### 非ゴール（YAGNI / Phase 2）

- pages（カスタムページ）参照 — サムネが section 合成で曖昧なため Phase 2
- faq / terms 参照 — 個別ルートやサムネがなくカード非対応
- 縦型 / 横型のカードスタイル切替 — v1 は横型 1 種。Inspector オプションは後追い
- inline link mention（Notion 流のテキスト内ミニ参照）— ブロックカードのみ
- 既存 `news` / `posts` 等への自動転載（operational → content sync は anti-pattern、対象外）

## 3. アーキテクチャ

実装パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`

### 3.1 ノード構成

#### `InternalLinkCardNode`（新規 DecoratorNode, block-level）

- NodeState（`$config` + `createState`、`flat: true`）:
  - `contentType: "post" | "news" | "space" | "event"`（型ガード付き parse、`config/type-guards.ts` の `createEnumGuard`）
  - `contentId: string`（`parseString`）
- **編集中 `decorate()`**: エディタ内では選択した時点の title / サムネをプレビュー表示
  （エディタ用に軽量スナップショットを node state に持たせるか、admin API でその場 fetch
  するかは実装計画で確定。**公開描画は参照のみで再解決**する点が本質で、エディタ表示は利便性目的）
- **`exportDOM()`**: data-attribute のみのプレースホルダーを出力（CSS クラス禁止規律に準拠）

  ```html
  <a
    data-internal-link-card="true"
    data-content-type="post"
    data-content-id="<uuid>"
    href="#"
  ></a>
  ```

  `href="#"` はプレースホルダー。公開描画時にサーバー側で実 URL + カード本体へ差し替える。

- **`importDOM()`**: `a[data-internal-link-card]` を検出して `data-content-type` / `data-content-id`
  から復元（`exportDOM` とセット必須、priority 指定）
- 単一値ブロックのため Inspector は **省略可**（`InlineIconNode` と同方針: 「削除 → 再挿入」が自然）。
  ただし参照先の差し替えを編集 UI で行いたい場合は Inspector パネル追加を検討（v1 は省略で開始）

#### `BookmarkNode`（既存・外部カード）

- 変更最小。挿入 UX 上のラベルを「外部リンクカード」に統一。OGP fetch / スナップショット保存は現状維持
- `rel="noreferrer"` 規律（外部 URL）は現行どおり

### 3.2 挿入 UX（統一ダイアログ）

- `config/insert-items/embed.ts`（または新カテゴリ）に **`linkCard` 1 項目**を追加（`type: "dialog"`）
  - 既存 `bookmark` 項目は削除し `linkCard` に統合
- 新ダイアログ `LinkCardDialog`（`dialogs/` + `dialog-registry.ts` 登録）:
  - タブ 1「サイト内」: 種別フィルタ + 検索 → 候補リスト（title / サムネ / 種別バッジ）→ 選択で
    `InternalLinkCardNode` 挿入。候補取得は admin API `/admin/api/link-cards/search`
    （`checkAdminAuth` で十分: DB write なし・特定 resource に紐づかない共通ユーティリティ）
  - タブ 2「外部 URL」: 既存 `BookmarkPlugin` の OGP 取得フロー（`/admin/api/ogp`）を再利用 →
    `BookmarkNode` 挿入
- 挿入は `$insertNodeToNearestRoot`（block-level）。ダイアログ起動は `editor.update` の外で
  同期 `openDialog`（既存 insert-items 実行モデルに準拠）

### 3.3 公開描画時の参照解決（核心）

`SanitizedHtml` は Client Component で同期描画のため、**サーバー側で `contentHtml` を後処理**してから渡す。
`injectHeadingAnchors`（`@/shared/lib/html/extract-headings`）と同じ「サーバーで HTML を変換する」前例に倣う。

新規 SSoT: `@/shared/lib/lexical/resolve-internal-link-cards.ts`

```ts
// server-only
export async function resolveInternalLinkCards(html: string): Promise<string>;
```

処理フロー:

1. `html` から `a[data-internal-link-card]` プレースホルダーを抽出
   （`extract-headings` と同じ HTML パース方式で実装、正規表現直書きは避ける）
2. `(contentType, contentId)` を種別ごとに集約してバッチ収集
3. 種別ごとに **公開フィルタ付き** id 一括解決クエリを実行（`'use cache'` でキャッシュ、
   tag は各コンテンツの既存 CACHE_TAGS を流用）
   - posts: `isPublished` 等の公開条件 + `{ title, excerpt, coverImageUrl, slug, publishedAt }`
   - news / spaces / events: 各 public-queries に id バッチ解決 helper を追加
4. 各プレースホルダーを解決結果の **カード本体マークアップ**（`<a href="/posts/<slug>">` +
   title + 抜粋 + サムネ）へ差し替え
5. **解決できない参照（削除 / 非公開）はプレースホルダーごと除去**（404 カードを出さない）
6. 変換後 HTML を返す → 呼び出し側で `<SanitizedHtml html={resolvedHtml} />`

呼び出し箇所（いずれも既に Server Component）:

- `posts/_components/post-detail-page-content.tsx`
- `news/_components/news-detail-page-content.tsx`
- `events/[slug]/page.tsx`
- `spaces/[slug]/_components/space-info.tsx`
- `terms/[slug]/page.tsx`（内部カードを許可するなら。許可範囲は実装計画で確定）

`extractHeadingsFromHtml` は raw `contentHtml` に対して継続実行（内部カードプレースホルダーは heading を
含まないため影響なし）。カード解決は表示用 HTML に対して行う。

公開カードマークアップは DOMPurify 許可タグ（a / img / div / span / p）の範囲で構築し、
`SanitizedHtml` の既存 sanitize を通過させる。スタイルは公開側 CSS の data-attribute セレクタで対応
（`lexical-content.css` に `[data-internal-link-card]` 系を追加、CSS-first 規律準拠）。

### 3.4 データ保存（Lexical serialization）

- 新ノード追加は **additive**（既存 contentJson の形を変えない）ため、6 テーブル一括 migration は不要
  （`frontend/lexical/conventions.md` の serialization migration 規律: 既存ノードの state 変更時のみ必須）
- 内部カードは `{ contentType, contentId }` のみ保存。参照整合性は DB FK ではなく描画時解決で担保
  （dangling 参照は描画時に自動非表示）

## 4. ノード登録チェックリスト（`nodes.md` 準拠）

`InternalLinkCardNode` 追加で更新する箇所:

| ファイル                                             | 内容                                                     | 要否       |
| ---------------------------------------------------- | -------------------------------------------------------- | ---------- |
| `nodes/InternalLinkCardNode.tsx`                     | ノード本体（NodeState + exportDOM/importDOM + decorate） | 必須       |
| `config/nodes.ts`                                    | `EDITOR_NODES` に追加                                    | 必須       |
| `nodes/index.ts`                                     | barrel export                                            | 必須       |
| `dialogs/`（`LinkCardDialog`）+ `dialog-registry.ts` | ダイアログ登録                                           | 必須       |
| `config/insert-items/*.ts`                           | `linkCard` 項目追加 / `bookmark` 項目削除                | 必須       |
| `plugins/`（必要なら command プラグイン）            | 挿入 command                                             | 任意       |
| Inspector 5 箇所                                     | v1 は Inspector 省略のため不要                           | 不要（v1） |

外部カードは `BookmarkNode` 既存登録を流用（ラベル変更のみ）。

## 5. 公開側 API / クエリ

- `/admin/api/link-cards/search`（新規, `checkAdminAuth`）: 種別 + クエリで候補を返す検索エンドポイント
- 各 public-queries に **id バッチ解決 helper** を追加（公開フィルタ付き）:
  - `getPublishedPostsByIds(ids)` / `getPublishedNewsByIds(ids)` /
    `getPublishedSpacesByIds(ids)` / `getPublishedEventsByIds(ids)`
  - 返却は `Serialized<T>`（Decimal → number / Date → string 変換は既存ドメイン層方針に準拠）
- 公開 URL ビルダー: `/posts/<slug>` `/news/<slug>` `/spaces/<slug>` `/events/<slug>`

## 6. エラーハンドリング / エッジケース

- 参照先が削除 / 非公開 → カードを描画しない（プレースホルダー除去）。ログは debug レベルに留める
- OGP 取得失敗（外部） → 既存 `BookmarkPlugin` の挙動を踏襲（エラー表示、挿入させない）
- 解決クエリ失敗 → 当該カードのみスキップし本文描画は継続（`logError` 構造化ログ）
- SSRF: 外部 URL の OGP は既存 `/admin/api/ogp` の SSRF guard を流用（新規経路なし）

## 7. テスト方針

- unit: `resolve-internal-link-cards` のプレースホルダー抽出 / バッチ集約 / 差し替え / 非公開除去
  （正常系・参照先なし・複数種別混在・0 件）
- unit: `InternalLinkCardNode` の exportDOM ↔ importDOM round-trip（型ガード fallback 含む）
- unit: 各 `getPublished*ByIds` の公開フィルタ（draft / 非公開を返さないこと）
- e2e（任意, PR `e2e` label）: 挿入ダイアログ 2 モード → 本文に内部 / 外部カード → 公開ページ描画確認
- bun:test 規律（Vitest API 不使用）/ Playwright は e2e/ パターン準拠

## 8. ロールアウト

- 1 PR = 1 logical change 規律に従い、必要なら分割:
  1. `InternalLinkCardNode` + 登録 + exportDOM/importDOM + unit
  2. `LinkCardDialog`（2 モード）+ insert-items 統合 + 検索 API
  3. 公開描画 `resolveInternalLinkCards` + 各 public-queries バッチ helper + 呼び出し配線 + CSS
- migration なし（additive node）。`bun run validate && bun run build` + unit/integration 両走で完遂判定

## 9. 未確定事項（実装計画で確定）

- エディタ内プレビューのデータ源（node state スナップショット vs admin API その場 fetch）
- 内部カードに Inspector を付けて「参照先の差し替え」を可能にするか（v1 は省略で開始）
- terms 本文で内部カードを許可するか（許可コンテンツ種別の最終確定）
- 公開カードの正確なマークアップ / data-attribute セレクタ設計（横型レイアウト）
