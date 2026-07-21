# スペースカード埋め込みブロック 設計

- 日付: 2026-07-22
- ステータス: 実装着手前 (writing-plans 相当)
- 出典: ユーザー提案「記事本文にライブのスペースカード（写真・料金・定員・予約ボタン）を埋め込みたい」

## 背景

現状の「内部リンクカード」（`InternalLinkCardNode` / `resolveInternalLinkCards`）は post/news/space/event
横断の汎用リンクプレビュー（サムネイル + タイトル + 抜粋）に留まり、価格・定員・予約導線までは持たない。
ブログ/お知らせ記事から実際のスペースへ直接予約導線を作れれば、このレンタルスペース予約サイトならではの
コンバージョン向上策になる。イベントカード埋め込み・FAQ構造化データブロックは将来候補として別途あるが、
本設計では**スペースカードのみ**を対象とする。

## 調査で確定した事実 (前提)

- **`Space` model** (`prisma/schema.prisma:476-559`): `id`(uuid) / `slug` / `name` / `capacity: Int` /
  `area: Decimal?` / `hourlyPrice: Decimal(10,2)` / `mainImageUrl` / `gallery: Json` /
  `isPublished: Boolean` / `isActive: Boolean` / `locationId`。**`deletedAt` 列は存在しない**、公開ゲートは
  `isPublished && isActive` のみ
- **既存の内部リンクカード基盤**: `InternalLinkCardNode`（`nodes/InternalLinkCardNode.tsx`）は
  `{contentType, contentId}` のみを state に保存し、`exportDOM()` は空プレースホルダー
  `<a data-internal-link-card data-content-type data-content-id href="#"></a>` を出力する。公開描画時に
  `resolveInternalLinkCards(html)`（`src/shared/lib/lexical/resolve-internal-link-cards.ts`）が
  正規表現でプレースホルダーを抽出し、`resolveLinkCardsByType`（`src/shared/domain/link-cards/resolve-queries.ts`）
  でDBから最新データを取得してHTML文字列に差し替える。**参照先が非公開/削除されていれば placeholder ごと
  除去**（404カード防止）
- **呼び出し箇所は4つ**: `blog/_components/post-detail-page-content.tsx:84`、
  `news/_components/news-detail-page-content.tsx:82-84`、`events/[slug]/page.tsx:176-178`、
  `spaces/[slug]/_components/space-info.tsx:37-39`。いずれも `await connection()` で動的化された
  Server Component 内、DB取得（`'use cache'`）の**後**・`SanitizedHtml` に渡す**前**に呼ばれる
- **`resolveLinkCardsByType` は意図的に `'use cache'` を使わない**（コメントで明記: freshness優先 +
  id配列キャッシュキー肥大回避）。記事本体は `CACHE_TAGS.POSTS`/`NEWS` でキャッシュされ得るが、
  リンクカードの中身は毎リクエストDBを叩くため常に最新
- **サニタイズは2層**: 保存時 `sanitizeLexicalContentHtml`（sanitize-html, `sanitize-content-html-core.ts`）と
  公開表示時 `SanitizedHtml`（DOMPurify, `SanitizedHtml.tsx`）。前者は `exportDOM()` が出力する
  **プレースホルダーのみ**を見る（解決後のリッチHTMLは保存されないため）。後者が解決後リッチHTMLに適用される。
  `img`/`a`/`div`/`span`/`button` はいずれも両サニタイザで既に許可済み、追加設定不要
- **スタイリング規約**: 解決後HTMLは Tailwind クラスではなく `data-*` 属性セレクタで
  `src/shared/styles/lexical-content.css`（`@layer` 外）に書く（`[data-bookmark-*]` /
  `[data-internal-link-card-*]` と同型）
- **予約導線の既存パターン**: `ReservationWidget` / `MobileReserveCta` / `SpaceAvailabilityCalendar` の
  3箇所すべてが `` `/reservation?spaceId=${space.id}` `` に遷移。**サイト全体で統一されたCTA遷移先**
- **既存の公開スペースカード** (`(public)/_components/space-list/space-card.tsx`) は写真・名前・料金・定員を
  表示するが、**「予約する」ボタンは持たない**（カード全体が `/spaces/{slug}` へのリンク）。今回作る記事埋め込み
  カードは別コンポーネントとして新規に用意する（要件が異なるため）
- **公開スペース読み取りクエリ** (`src/shared/domain/spaces/public-queries.ts`) は `getPublishedSpacesPaginated`
  (195行) / `getSpaceBySlug` (321行) いずれも `'use cache'` + `cacheTag(CACHE_TAGS.SPACES, ...)`。
  ただし「複数idバッチ取得 + 常に最新」という埋め込みカードの要件には合わないため新規クエリを追加する
- **ノード登録は6箇所を機械強制的に同期する必要がある**: `config/nodes.ts` の `EDITOR_NODES` 配列 /
  Inspector 4ファイル (`inspectable-nodes.ts` の union、`inspector-registry.ts` の
  `CLASS_NAME_TO_INSPECTOR_NODE_TYPE` + `INSPECTABLE_NODE_TYPES_FROM_REGISTRY`、新規 InspectorPanel、
  `InspectorSidebar.tsx` の switch) / `markdown-loss-detection.ts` の `isUnrepresentableInMarkdown`
  （登録漏れは「Markdownコピー時に無警告で本文消失」というサイレントバグになる） /
  `ssot-drift-gates.test.ts` の Gate A〜E 対応表（`CLASS_NAME_TO_INSERT_ITEM_ID` 含む） /
  `insert-items/embed.ts` + `config/dialog-registry.ts` の挿入UI配線
- **挿入UIの再利用元**: `LinkCardPlugin.tsx` の `InternalTab` が `/admin/api/link-cards/search?type=space`
  的なエンドポイントをfetchして検索結果（id/title/thumbnail）を返す既存実装があり、これは type=space
  指定で**そのまま再利用可能**（新規APIエンドポイントは不要）
- **Feature Module フィルタリングは insert-item 単位では未実装**（`ComponentPickerPlugin`/`insert-items/*.ts`
  に feature module 依存の grep 一致なし）。LinkCardPlugin の「サイト内」タブ内のコンテンツ種別選択のみが
  `filterEnabledLinkCardContentTypes` でフィルタされている

## ゴール

1. 管理画面のLexicalエディタに新規スラッシュコマンド「スペースカードを挿入」を追加し、公開済みスペースを
   検索して選択・挿入できる
2. 挿入されたブロックは公開記事（ブログ/お知らせ/イベント詳細/スペース詳細のいずれの本文でも）で、
   写真1枚・スペース名・料金（税込み表示、既存 `formatUnitPriceWithTax` と同じロジック）・定員・
   「予約する」ボタン（`/reservation?spaceId={id}`）を伴うリッチカードとして描画される
3. カードの中身は**常にDBの最新値**（価格改定・写真差し替え等が即座に反映される。記事本体キャッシュとは
   独立して鮮度を保つ、既存の内部リンクカードと同じ設計思想）
4. 参照先スペースが非公開/非アクティブ/削除された場合、カードは**自動的に非表示**になる（404防止、既存方針を踏襲）
5. 既存の6箇所の登録パイプライン・drift gate テスト全てを更新し、`bun run validate` +
   `architecture-boundaries.test.ts` を含む既存テストスイートを壊さない

## 非ゴール (スコープ外)

- **イベントカード埋め込み・FAQ構造化データブロック**: 別セッションで着手。ただし本設計のアーキテクチャ
  （専用DecoratorNode + placeholder + resolve-at-render関数）はイベントカードにもそのまま再利用できる形にする
- **複数写真のカルーセル表示**: `SanitizedHtml` は静的HTML文字列 + 最小限のvanilla-JSハイドレーション
  （Tabsのみ既存実装あり）という設計のため、カルーセルを足すには新規ハイドレーションJSが要る。
  ユーザー要件は「写真」（単数）であり、`mainImageUrl` 1枚表示で十分。将来必要になれば追加検討
- **レビュー評価（★）・空き状況インジケーターの表示**: ユーザー要件（写真・料金・定員・予約ボタン）に
  含まれないため追加しない
- **エディタ内のライブプレビュー（DB再取得によるリアルタイム表示）**: 挿入時に検索結果から取得済みの
  `spaceName` を表示ヒントとして保存するのみに留め、エディタを開くたびにDB再取得するプレビューは作らない
  （新規APIエンドポイント・ローディング/エラー状態管理という追加スコープに見合う価値が薄いと判断。
  既存 `InternalLinkCardNode` も同水準の簡易プレビューに留めている）
- **spaces Feature Module がOFFの場合の挿入項目自体の非表示化**: 既存コードに insert-item 単位の
  feature module フィルタ機構が存在せず、新規に汎用フィルタ機構を作るのは過剰。代わりに
  **resolve関数側で `isFeatureEnabled("spaces")` をチェックし、OFFなら他の非公開ケースと同様にカードを
  除去する**（正しさを担保する層は resolve 側に一元化、UI側の事前フィルタは省略)
- **価格帯 (range) 表示・曜日別料金プラン (`SpaceRatePlan`) の反映**: 既存の公開スペースカードも
  `Space.hourlyPrice` 単一値のみを表示しており、range表示ロジック自体がリポジトリに存在しない。
  本機能も同じ単一値表示に揃える（一貫性優先、独自に先行実装しない）

## アーキテクチャ設計

### 1. 新規ノード `SpaceCardNode`

`InternalLinkCardNode` とは別の専用 DecoratorNode として新設する（理由: 表示形状が汎用リンクカードと
根本的に異なるため、variant フラグで既存ノードを分岐させるより単一責任のノードにする方がクリーン）。

- state: `spaceId`（正本、UUID）+ `spaceName`（表示ヒントのみ。挿入/差し替え時に検索結果から複製して
  保存、公開HTMLには一切出力しない。エディタリロード後も「どのスペースか」が分かるようにするための
  純粋な編集補助）
- `exportDOM()`: `<a data-space-card-embed="true" data-space-id="{id}" href="#"></a>`
  （`InternalLinkCardNode` と同型のプレースホルダー方式）
- `importDOM()`: 上記 placeholder タグを `SpaceCardNode` に復元（管理画面内コピペのラウンドトリップ用）
- editor 内プレビュー: アイコン + 「スペースカード」ラベル + `spaceName`（`InternalLinkCardComponent` と
  同型の簡易カード、DBフェッチなし）

### 2. 公開解決: 新規 `resolveSpaceCardEmbeds(html)`

`resolve-internal-link-cards.ts` と同じ構造を持つ新規ファイル
（`src/shared/lib/lexical/resolve-space-card-embeds.ts`）として追加する。既存ファイルを汎用リンクカードと
スペースカードの両方を扱うよう分岐させるのではなく、責務ごとに分離する（1ファイル1関心事）。

処理順序: 正規表現で `data-space-card-embed` プレースホルダーを抽出 → `spaceId` を集約 →
新規ドメインクエリでバッチ取得 → `getPublicTaxSettings()`/`getTaxRate()`/`formatUnitPriceWithTax()` で
価格ラベルを一括整形（バッチ内で税設定取得は1回のみ）→ リッチHTML文字列を組み立てて置換。
DBエラー時・0件時は placeholder を除去して本文描画を継続する（既存パターンと同じ try/catch フォールバック）。

呼び出し箇所は4つの詳細ページ全てに `resolveInternalLinkCards` の直後に1行追加する:

```ts
let html = await resolveInternalLinkCards(post.contentHtml);
html = await resolveSpaceCardEmbeds(html);
```

### 3. 新規ドメインクエリ

`src/shared/domain/spaces/public-queries.ts` に追加（配置場所は他の公開スペース読み取りクエリと揃える）。

```ts
export async function resolveSpaceCardEmbedData(
  ids: readonly string[],
): Promise<Map<string, SpaceCardEmbedData>> {
  // 'use cache' は付けない（freshness優先、id配列のキャッシュキー肥大回避 — 既存 resolveSpaceCards と同じ理由）
  // where: { id: { in: ids }, isPublished: true, isActive: true }
  // select: id, slug, name, capacity, mainImageUrl, hourlyPrice
}
```

`isFeatureEnabled("spaces")` が false の場合は空 Map を返す（呼び出し元で placeholder 除去に繋がる）。

### 4. 解決後カードの HTML/CSS 構造

`<a>` のネストを避けるため、カード全体を1つの巨大アンカーにはしない（写真+タイトルのリンクと、独立した
「予約する」ボタンリンクを兄弟要素にする）:

```html
<div data-space-card-embed-resolved>
  <a data-space-card-embed-image href="/spaces/{slug}"
    ><img src="{mainImageUrl}" alt=""
  /></a>
  <div data-space-card-embed-body>
    <a data-space-card-embed-title href="/spaces/{slug}"><h4>{name}</h4></a>
    <p data-space-card-embed-meta>{定員}名 ・ {税込み料金}/h</p>
    <a data-space-card-embed-cta href="/reservation?spaceId={id}">予約する</a>
  </div>
</div>
```

スタイルは `lexical-content.css` に `[data-space-card-embed-*]` セレクタとして追加
（`[data-bookmark-*]` / `[data-internal-link-card-*]` と同じ節に並べる）。サニタイザ設定
（`sanitize-content-html-core.ts` / `SANITIZE_OPTIONS`）の変更は不要（既存許可タグ/属性で足りる）。

### 5. 挿入UI

新規 `SpaceCardPlugin.tsx`（`LinkCardPlugin.tsx` の `InternalTab` を type="space" 固定で流用/抽出した
軽量版）。既存の内部コンテンツ検索エンドポイントを再利用し、新規APIルートは追加しない。選択時に
`$createSpaceCardNode({spaceId, spaceName})` を `$insertNodeToNearestRoot` で挿入。

- `insert-items/embed.ts` に `id: "spaceCard"`, `type: "dialog"`, `dialogId: "spaceCard"` を追加
- `config/dialog-registry.ts` に `{ dialogId: "spaceCard", component: SpaceCardPlugin }` を追加
- Inspector: `SpaceCardInspectorPanel.tsx` を新設し、挿入後に別スペースへの差し替えを可能にする
  （`InternalLinkCardInspectorPanel` と同型）

### 6. テスト更新

- `SpaceCardNode` の factory/exportDOM/importDOM ラウンドトリップ単体テスト
  （`internal-link-card-node.test.ts` と同型）
- `resolveSpaceCardEmbeds` の単体テスト（正常解決/非公開除去/feature module OFF除去/DBエラーフォールバック、
  `resolve-internal-link-cards.test.ts` と同型）
- `ssot-drift-gates.test.ts` の Gate A〜E 対応表、`inspectable-nodes.test.ts` の更新
- 既存 `bun run validate` + `bun run test:unit`（`architecture-boundaries.test.ts` 含む）を通す

## 未解決点・実装時に確認する事項

- `resolveSpaceCardEmbedData` の正確な配置ファイルと既存クエリとの重複排除方法（実装計画フェーズで
  `public-queries.ts` の現状行数と既存関数群を再確認してから決定）
- `SpaceCardPlugin.tsx` を `LinkCardPlugin.tsx` からの抽出リファクタとして書くか、独立実装にするかは
  実装時に既存コードの結合度を見て判断する
