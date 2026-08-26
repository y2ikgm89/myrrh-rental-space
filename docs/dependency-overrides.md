# Bun dependency overrides

`package.json` の `overrides` は transitive 依存のセキュリティ修正・再現性確保のための
pin 表。この表は required status check **`Dependency Audit (bun audit)`**
（`.github/workflows/ci.yml` の `bun audit --audit-level=high`）を緑に保つための
集合であり、`package.json` の `overrides` が SSoT、本表はその**説明**にあたる。

**dev 依存も対象に含む。** この表には元から `minimatch`（eslint 経由）や `flatted`
（`eslint` のキャッシュ層経由）のような dev 専用 pin が入っており、それらを足したのは
`chore(quality): Phase 1 SSoT 強化 + dev 依存脆弱性削減` (#45) だった。つまり
「dev の advisory も潰す」が最初からの運用で、gate 側だけが `--prod` で狭かった。

## この表に版を書かない

以前は Pin 列に版を書いていたが、**SSoT の値を書き写す形は必ずドリフトする**ので廃止した。
実際、Renovate が `overrides` の版を上げる PR を出すと `package.json` だけが動き、
本表は取り残されて gate が落ちた（2026-08-11、初回スキャンで 10 件が該当）。

版を知りたいときは `package.json` の `overrides` を見る。ここに置くのは
**そこから導けないもの＝どこから引かれているか**だけにする。

ゲートが赤くなったときの手順:

1. `bun audit` で advisory と影響範囲を確認する
2. `package.json` の `overrides` を上げる（`bun install` で `bun.lock` も更新）
3. **新しい package を足したときだけ**、同じ commit で本表に行を足す
4. `bun run validate` を通す

過不足は
[`__tests__/unit/architecture/dependency-overrides-doc.test.ts`](../__tests__/unit/architecture/dependency-overrides-doc.test.ts)
が機械的に強制する（過去、表に書かずに 3 件が追加された）。

「経路」列は `bun why <package>` の実測。**どこから引かれているか**が分かると、
その pin を外してよいか・上げると何が壊れうるかを推測ではなく確認で判断できる。

| Package             | 経路 (`bun why` 実測)                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `@grpc/grpc-js`     | `google-gax` → `@google-analytics/data`                                                           |
| `pg`                | `@prisma/adapter-pg`（`better-auth` の optional peer でもある）                                   |
| `protobufjs`        | `@grpc/proto-loader` / `proto3-json-serializer` → `google-gax`                                    |
| `minimatch`         | `@eslint/config-array` / `@typescript-eslint/typescript-estree` → `eslint`                        |
| `fast-uri`          | `ajv` → `@prisma/dev`(prisma) / `eslint`                                                          |
| `postcss`           | `next` / `sanitize-html` / `@tailwindcss/postcss`                                                 |
| `hono`              | `@prisma/dev` → `prisma`                                                                          |
| `qs`                | `googleapis-common` → `googleapis`                                                                |
| `@hono/node-server` | `@prisma/dev` → `prisma`                                                                          |
| `flatted`           | `flat-cache` → `file-entry-cache` → `eslint`（キャッシュ層）                                      |
| `picomatch`         | `micromatch` / `tinyglobby` / `fdir`                                                              |
| `tmp`               | `exceljs`                                                                                         |
| `playwright-core`   | `playwright` → `@playwright/test`（E2E runner と lockstep）                                       |
| `brace-expansion`   | `minimatch` のみ                                                                                  |
| `uuid`              | `exceljs`                                                                                         |
| `ws`                | `happy-dom` → `@lexical/headless`／`engine.io`・`socket.io-adapter` → `socket.io` → `react-email` |
| `happy-dom`         | `@lexical/headless` の内部フォールバック DOM                                                      |
| `undici`            | `jsdom`（jsdom 30 は `undici ^8.9.0` を要求。7 系に留めると range 違反）                          |
| `sharp`             | `next` の optionalDependency（画像処理）                                                          |
| `valibot`           | `@prisma/dev` → `prisma`／`@t3-oss/env-core`                                                      |
| `nanoid`            | `postcss`（GHSA-2v37-7h3g-55p8: size 0 で無限ループ）                                             |
| `socket.io-parser`  | `socket.io` → `react-email`                                                                       |
| `@babel/core`       | `eslint-plugin-react-hooks`                                                                       |
| `deepmerge-ts`      | `@prisma/config` → `prisma`                                                                       |

## 誤解しやすい 2 件

- **`happy-dom` はテスト用の DOM ではない。** リポジトリのコードは
  テスト・本番とも JSDOM を明示的に使う（`__tests__/setup-dom.ts`、
  `src/shared/lib/lexical-headless-dom-environment.ts`）。`@lexical/html` は完全な DOM 実装を
  前提にしており、happy-dom 側の既知バグを踏むため意図的に避けている。この pin は
  `@lexical/headless` が引く transitive の解決版を固定するためだけにある。
- **`jsdom` は直接依存**（`package.json` の `dependencies`）であって override 対象ではない。
  override しているのはその transitive の `undici`。

## overrides の適用範囲

`overrides` は **transitive のみ**を対象にする。直接依存のバージョンは
`dependencies` / `devDependencies` が SSoT。bun 本体のバージョンは
トップレベルの `packageManager`（同値を `engines.bun` にも置く）が SSoT で、
どちらも overrides では動かさない。
