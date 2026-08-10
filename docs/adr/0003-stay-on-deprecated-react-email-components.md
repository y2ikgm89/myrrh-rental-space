# ADR 0003: deprecated な `@react-email/components` に留まる

Status: Accepted (2026-08-11)

## Context

2026-08-11 に Renovate を有効化した直後、Dependency Dashboard が
`@react-email/components` を deprecated として報告した。npm registry を直接引いて
確認した事実:

- **全 135 版が deprecated**（初版 `0.0.1` を含む）。メッセージは npm の定型文
  `Package no longer supported.` で、後継の案内を含まない
- 個別コンポーネント（`@react-email/button` / `html` / `tailwind` 等）も同様に全版 deprecated
- 一方 `react-email`（CLI, 0/289 版）と `@react-email/render`（0/78 版）は
  **非 deprecated**。`@react-email/render` と `@react-email/editor` は
  統合の対象外として明示的に残されている

つまりこれは事故ではなく、react-email が統合パッケージ `react-email`（v6.5.0+）へ
components を寄せた結果の意図的な deprecation。利用者は `react-email` から直接
import することが期待されている。

本リポジトリの利用状況:

- `@react-email/components` は `dependencies`。`src/shared/emails/*.tsx` の **36 箇所**が import
- `@react-email/render` も `dependencies`（deprecation の影響を受けない）
- `react-email` は `devDependencies`（`bun run email:dev` のプレビュー用）

## Decision

**`@react-email/components` に留まる。統合 `react-email` へは移行しない。**

deprecation 警告は受け入れる。コード側の変更は行わない。

## Rationale

- **deprecation は npm の警告のみで機能影響がない。** `1.0.12` は 2026-04-09 公開で
  正常に動作しており、`bun audit` にも上がっていない
- **移行すると CLI の依存ツリーが production に入る。** components を `react-email` から
  import するには `react-email` を `devDependencies` → `dependencies` へ移す必要があり、
  プレビューサーバー用の依存が丸ごと本番側に乗る。`node_modules` 実測（2026-08-11）:

  | package           | サイズ | package       | サイズ      |
  | ----------------- | ------ | ------------- | ----------- |
  | `@babel/parser`   | 4.5 MB | `css-tree`    | 1.3 MB      |
  | `@babel/traverse` | 3.9 MB | `conf`        | 1.1 MB      |
  | `prismjs`         | 2.0 MB | `marked`      | 0.7 MB      |
  | `jiti`            | 1.6 MB | `tailwindcss` | 0.7 MB      |
  | `glob`            | 1.5 MB | ほか          | —           |
  | `socket.io`       | 1.4 MB | **合計**      | **19.6 MB** |

  比較として `@react-email/components` 本体は 8.3 MB。`esbuild` のプラットフォーム
  バイナリは別パッケージに分かれているため、実際の増分はこれより大きい。
  本番は Cloud Run のコンテナイメージなので、この差はそのままイメージサイズに効く

- **上流の修正はまだ効いていない。** ランタイムバンドル肥大の
  [resend/react-email#3556](https://github.com/resend/react-email/issues/3556) は
  2026-07-10 に close されたが、**その後に公開された `react-email@6.9.2`
  （2026-08-07）の `dependencies` には依然 `prismjs` / `marked` / `tailwindcss` /
  `esbuild` / `socket.io` が並ぶ**。同 issue の検証報告によれば Prism の文法テーブルは
  module scope で実行されるため、`sideEffects: false` を付けてもバンドラは落とせない
- **Renovate も移行を提案していない。** Dashboard の Deprecations 欄は
  `Replacement PR? unavailable` で、放置しても PR は湧かない

## Migration Triggers (re-evaluate すべき条件)

1. `react-email` の `dependencies` から CLI 系（`prismjs` / `marked` / `tailwindcss` /
   `esbuild` / `socket.io`）が外れる
2. components が CLI 依存を引かない subpath export で提供される
3. `@react-email/components` に脆弱性が報告される — deprecated なので修正版は
   期待できず、その時点で移行が不可避になる

3 は CI の `Dependency Audit (bun audit)` が検知する。この gate は dev ツリーも
対象に含めて high 以上で失敗する設定なので（経緯は
[`../dependency-overrides.md`](../dependency-overrides.md)）、`devDependencies` 側で
先に兆候が出ても取りこぼさない。

## Rejected Alternatives

- **統合 `react-email` へ移行する** — 上記のとおり production の依存ツリーが
  19.6 MB 増える。上流が CLI 依存を切り離すまで待つほうが安い
- **個別コンポーネントパッケージ（`@react-email/button` 等）へ戻す** — それらも
  全版 deprecated で、かつ `components` より古い。状況が悪化するだけ
- **components を vendoring する（リポジトリに取り込む）** — 36 テンプレートが依存する
  コンポーネント群の保守を自前で抱えることになる。deprecation は警告のみで
  実害が出ていない現時点では釣り合わない

## Related

- `.github/workflows/ci.yml` の `Dependency Audit (bun audit)` job（dev ツリーを含めて
  high 以上で失敗する）
- [`../dependency-overrides.md`](../dependency-overrides.md) — `socket.io-parser` の
  pin は `socket.io` → `react-email` 経由で入っており、この判断と経路を共有する
- 上流 issue: <https://github.com/resend/react-email/issues/3556>
- 運用文書の索引: [`../README.md`](../README.md)
