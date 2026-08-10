# Bun dependency overrides

`package.json` の `overrides` は transitive 依存のセキュリティ修正・再現性確保のための
pin 表。この表は required status check **`Dependency Audit (bun audit)`**
（`.github/workflows/ci.yml` の `bun audit --audit-level=high`）を緑に保つための
集合であり、`package.json` の `overrides` が SSoT、本表はその**説明**にあたる。

**dev 依存も対象に含む。** この表には元から `minimatch`（eslint 経由）や `basic-ftp`
（`@lhci/cli` 経由）のような dev 専用 pin が入っており、それらを足したのは
`chore(quality): Phase 1 SSoT 強化 + dev 依存脆弱性削減` (#45) だった。つまり
「dev の advisory も潰す」が最初からの運用で、gate 側だけが `--prod` で狭かった。

ゲートが赤くなったときの手順:

1. `bun audit` で advisory と影響範囲を確認する
2. `package.json` の `overrides` を上げる（`bun install` で `bun.lock` も更新）
3. **同じ commit で本表の Pin 列と経路を更新する**
4. `bun run validate` を通す

Pin と表の整合は
[`__tests__/unit/architecture/dependency-overrides-doc.test.ts`](../__tests__/unit/architecture/dependency-overrides-doc.test.ts)
が機械的に強制する（過去、表に書かずに 3 件が追加され、6 件が版ずれのまま残った）。

「経路」列は `bun why <package>` の実測。**どこから引かれているか**が分かると、
その pin を外してよいか・上げると何が壊れうるかを推測ではなく確認で判断できる。

| Package             | Pin      | 経路 (`bun why` 実測)                                                       |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `@grpc/grpc-js`     | ^1.14.4  | `google-gax` → `@google-analytics/data`                                     |
| `pg`                | ^8.22.0  | `@prisma/adapter-pg`（`better-auth` の optional peer でもある）             |
| `protobufjs`        | ^8.7.1   | `@grpc/proto-loader` / `proto3-json-serializer` → `google-gax`              |
| `minimatch`         | ^10.2.5  | `@eslint/config-array` / `@typescript-eslint/typescript-estree` → `eslint`  |
| `fast-uri`          | ^3.1.5   | `ajv` → `@prisma/dev`(prisma) / `eslint`                                    |
| `postcss`           | ^8.5.18  | `next` / `sanitize-html` / `@tailwindcss/postcss`                           |
| `hono`              | ^4.12.34 | `@prisma/dev` → `prisma`                                                    |
| `qs`                | ^6.15.3  | `googleapis-common` → `googleapis`／`body-parser` → `express` → `@lhci/cli` |
| `@tootallnate/once` | ^3.0.1   | `http-proxy-agent`（proxy スタック）                                        |
| `@hono/node-server` | ^2.0.12  | `@prisma/dev` → `prisma`                                                    |
| `basic-ftp`         | ^6.0.1   | `get-uri` → `pac-proxy-agent` → `proxy-agent` → `@lhci/cli`                 |
| `flatted`           | ^3.4.2   | `flat-cache` → `file-entry-cache` → `eslint`（キャッシュ層）                |
| `ip-address`        | ^10.5.0  | `socks` → `socks-proxy-agent`                                               |
| `picomatch`         | ^4.0.4   | `micromatch` / `tinyglobby` / `fdir`                                        |
| `tmp`               | ^0.2.7   | `exceljs`／`@lhci/cli`・`external-editor`                                   |
| `playwright-core`   | ~1.62.1  | `playwright` → `@playwright/test`（E2E runner と lockstep）                 |
| `brace-expansion`   | ^5.0.8   | `minimatch` のみ                                                            |
| `uuid`              | ^11.1.1  | `exceljs`／`@lhci/cli`                                                      |
| `ws`                | ^8.21.0  | `happy-dom` → `@lexical/headless`／`lighthouse`・`socket.io-adapter`        |
| `happy-dom`         | ^20.11.0 | `@lexical/headless` の内部フォールバック DOM                                |
| `undici`            | ^8.9.0   | `jsdom`（jsdom 30 が `^8.9.0` を要求。7 系に留めると range 違反）           |
| `sharp`             | ^0.35.0  | `next` の optionalDependency（画像処理）                                    |
| `valibot`           | ^1.4.2   | `@prisma/dev` → `prisma`／`@t3-oss/env-core`                                |
| `nanoid`            | ^3.3.17  | `postcss`（GHSA-2v37-7h3g-55p8: size 0 で無限ループ）                       |
| `js-yaml`           | ^3.15.1  | `@lhci/utils` → `@lhci/cli`                                                 |
| `body-parser`       | ^1.20.6  | `express` → `@lhci/cli`                                                     |
| `socket.io-parser`  | ^4.2.7   | `socket.io` → `react-email`                                                 |
| `@babel/core`       | ^7.29.7  | `eslint-plugin-react-hooks`                                                 |

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
