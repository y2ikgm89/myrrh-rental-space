# キャッシング戦略 — なぜ Next.js 16 PPR を選んだか

> このドキュメントは採用したキャッシング戦略の **「なぜ」** を説明する（Diátaxis: explanation）。
>
> **実装パターンの SSoT**: [`AGENTS.md`](../../AGENTS.md) の Data, Auth, Security 節 / Claude Code 用 `.claude/rules/server-actions/use-cache.md` / プロジェクト定数 `@/shared/lib/constants/cache.ts`（`CACHE_TAGS` / `CACHE_LIFE`）。

## 採用方針

このプロジェクトは Next.js 16 の **`cacheComponents: true`**（PPR + Cache Components）を全面採用する。後方互換のための `unstable_cache` / `unstable_noStore` は使わない。

- 静的シェルと動的コンテンツを同一ルート内で組み合わせ、初期ページロードを高速化する
- 公開・管理を `Multiple Root Layouts` で分離した上で、各ルートグループ単位で適切な戦略を選ぶ
- キャッシュ無効化は **タグ駆動**（`updateTag` / `revalidateTag`）を基本にし、パス無効化は最終手段にする

## 3 つの動的コンテンツタイプ

公式が推奨する 3 パターンを役割で使い分ける。

| パターン       | 用途                           | 特徴                                     |
| -------------- | ------------------------------ | ---------------------------------------- |
| `'use cache'`  | 全ユーザー共通の読み取り       | 静的シェルに含めプリレンダ。タグで無効化 |
| `<Suspense>`   | ランタイムデータが必要         | fallback が静的、本体はストリーミング    |
| `connection()` | 非決定的処理 (`Date.now()` 等) | プリレンダ不可を明示。Suspense と併用    |

## キャッシュ階層の判断基準

| レベル | パターン                          | 適用例                           |
| ------ | --------------------------------- | -------------------------------- |
| L1     | 静的（外部依存なし）              | プライバシーポリシーの固定文言   |
| L2     | `'use cache'` + `STATIC_SETTINGS` | サイト設定 / ナビゲーション      |
| L3     | `'use cache'` + `PUBLIC_CONTENT`  | 公開ブログ / ニュース / スペース |
| L4     | `'use cache'` + `DYNAMIC_DATA`    | メンテナンスフラグ / 在庫        |
| L5     | `<Suspense>`                      | 検索結果 / 認証連動コンテンツ    |
| L6     | `connection()`                    | 非決定的演算                     |

`CACHE_LIFE.*` 定数はこの階層と 1:1 対応する。マジックストリング (`cacheLife("hours")`) は禁止。

## なぜ updateTag を Server Actions で優先するか

read-your-own-writes を保証するため。書き込み直後の同一リクエスト内で読み取りに反映させる必要がある。

- `updateTag(tag)` — 即時失効（**Server Actions 専用**）
- `revalidateTag(tag, profile)` — 非同期再検証（Route Handlers / バックグラウンド）
- `revalidatePath(path)` — 最終手段（タグで対応不能なページ単位無効化のみ）

優先順位の判断ツリー:

```
Server Actions の CRUD 後  →  updateTag
Route Handler / cron / webhook  →  revalidateTag(tag, CACHE_LIFE.MAX)  // SWR
タグで対応不能              →  revalidatePath
```

## セキュリティ観点でのキャッシュ境界

- ユーザー固有のデータ（予約・問い合わせ・通知）は **キャッシュしない**
- 認証境界を跨ぐデータは `'use cache'` を付けない
- 公開・非公開のキャッシュキーを分離する（公開クエリは `isPublished: true` を引数に含める）
- 機密情報をキャッシュキーに含めない（user id 等を tag 名に直接使わない）

詳細な検出ルール: [`security-model.md`](./security-model.md)。

## 実装パターンの参照先

実装の具体例（`'use cache'` ディレクティブ、`cacheTag` 使用例、`updateTag` / `revalidateTag` の API 仕様）は以下を参照:

- **Claude Code rule**: `.claude/rules/server-actions/use-cache.md`（path-scoped で auto-load）
- **プロジェクト SSoT**: `@/shared/lib/constants/cache.ts`（`CACHE_TAGS` / `CACHE_LIFE` / `getCacheTag`）
- **Next.js 公式**: [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components) / [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) / [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag)

## 後方互換性方針

| レガシー API       | 廃止理由                             | 代替                                     |
| ------------------ | ------------------------------------ | ---------------------------------------- |
| `unstable_cache`   | Next.js 16 で非推奨化                | `'use cache'` + `cacheLife` + `cacheTag` |
| `unstable_noStore` | Suspense / `connection()` で置換可能 | `<Suspense>` または `connection()`       |

新規実装で上記レガシー API を導入しない。既存の使用箇所はゼロ。
