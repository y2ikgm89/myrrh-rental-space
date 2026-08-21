# ADR 0005: Next サーバーだけ Node、それ以外は Bun

Status: Accepted (2026-08-12)

## Context

このリポジトリは Bun 前提（`packageManager: bun@1.4.0`、`engines.bun`、`bun.lock`）で、
依存解決・スクリプト・テスト・Prisma CLI をすべて Bun で走らせている。
一方 **Next.js サーバーの実行と `next build` は Node** で、Dockerfile に
`FROM node:24-alpine AS runner` と `COPY --from=node:24-alpine /usr/local/bin/node` の
2 箇所が入っている（PR #2183 / #2189）。

この分割は事故対応の結果として入ったもので、「なぜ全部 Bun ではないのか」が
繰り返し問われる形になっていた。2026-08-12 に全面的に再調査した。

### 何が Node を必要にしているか

`jsdom` が **Next の require-hook の下の Bun で読めない**。最小再現（同一 `.mjs`）:

| runtime      | Next の require-hook | `require("jsdom")`                                         |
| ------------ | -------------------- | ---------------------------------------------------------- |
| BUN 1.3.14   | 読む                 | **FAIL** `Cannot find module '../data/patch.json' from ''` |
| BUN 1.3.14   | 読まない             | OK                                                         |
| NODE v26.6.0 | 読む                 | OK                                                         |

Bun 単体の問題ではない。Next の `require-hook.js` は `request` を差し替えるだけで
`parent` はそのまま転送しており（`require-hook.js:65-70`）、`parent` を落としているのは
Bun 側。upstream [oven-sh/bun#13076](https://github.com/oven-sh/bun/issues/13076) は
2024-08-04 から open のまま（2026-08 時点）。

`bun test` で jsdom が動くのは require-hook を通さないため。

### jsdom はなぜ要るのか

`@lexical/headless` の HTML 生成に実 DOM が要る。サーバー側の利用は 4 用途:

| 用途            | 呼び出し元                                                      |
| --------------- | --------------------------------------------------------------- |
| JSON→HTML 導出  | 6 つの Server Action（event / news×2 / post×2 / space / terms） |
| アイコン enrich | 同じ pipeline                                                   |
| sanitize        | 同上（**既に DOM 非依存**。PR #2182 で sanitize-html 化）       |
| HTML→JSON       | `terms/new/page.tsx` の 1 箇所（静的テンプレート）              |

### 代替 DOM は成立しない（実測 2026-08-12）

| DOM               | 段落             | テーブル              | 判定                            |
| ----------------- | ---------------- | --------------------- | ------------------------------- |
| jsdom 30.0.1      | 66 bytes         | 374 bytes             | 唯一動く                        |
| happy-dom 20.11.2 | 66 bytes（同一） | **0 bytes・例外なし** | 無言のデータ欠落                |
| linkedom 0.18.13  | —                | —                     | `getComputedStyle` が存在しない |

happy-dom は DOM 操作単体では jsdom と完全一致する（`createElement` で
table/tbody/tr/td を組んで `innerHTML` を読む比較で同一文字列）。落ちるのは Lexical 側で、
`$appendNodesToHTML` は `element` が falsy だと無言で捨てる（`LexicalHtml.dev.mjs:3074`）。
`lexical-headless-dom-environment.ts` の JSDoc が挙げていた却下理由 2 つ
（主要コンストラクタ欠落 /`querySelector("colgroup")` が throw）は現行版で解消済みだが、
**理由は消えたのではなく移動した**。

css-tree 3.2.1 / jsdom 30.0.1 とも最新で、バージョンを上げて逃げる道は無い。

## Decision

**Next サーバーの実行と `next build` は Node、それ以外はすべて Bun。この分割を維持する。**

次のいずれも採用しない:

- `bun patch css-tree`（相対 require を絶対パス化するローカルパッチ）
- runner を Bun へ戻す
- サーバーから DOM 利用を除去する改修（クライアント導出 + enrich の DOM 非依存化）

## Rationale

- **jsdom を持つコストが実質ゼロ。** 保存 1 回あたり median 21.1ms（min 16.7 / max 38.5、
  40 段落の本文、warm）、`node_modules/jsdom` は 9 MB（css-tree・dom-selector 込みで
  約 13 MB / イメージは 494 MB）。DOM 除去改修が買えるのはこの 21ms と 13MB だけ
- **DOM 除去改修は最も事故が痛い領域に触る。** 「保存 HTML は必ず JSON から導出される」
  という保証を手放し、6 つの Server Action と保存 HTML の生成主体を変えることになる
- **Bun で本番サーバーを動かす積極的理由が無い。** Next 16.3.0 の docs が挙げる前提は
  Node.js 20.9 以上。Bun は Verified Adapter に載っているが本リポジトリは Adapter API を
  使っておらず（`adapterPath` 未設定）、リンク先の bun.com ガイドは `bun --bun next start` を
  示すだけで本番保証の記述が無い。npm の `next-adapter-bun` は Next 公式 org ではなく
  個人製の 0.3.0 で 2026-03-27 以降更新なし
- **Bun で動かしていた期間の実績コストが高い。** 本番事故 1 件（PR #2182: SSR が 200 の
  まま本文だけ欠けた）と是正 4 PR。得られるのは pull サイズ約 59 MB
- **ローカルパッチ単独では何も変わらない。** Node で走っている限り css-tree パッチは
  無効果で、transitive dep のフォークを恒久的に抱えるだけになる

## Consequences

- Dockerfile に Node 由来の行が 2 箇所残る（runner の `FROM` と builder の `COPY`）。
  両者のメジャー一致は `__tests__/unit/architecture/deploy-packaging-contract.test.ts` が強制する
- `jsdom` は `dependencies` に残る（本番の admin 保存経路で実際に使う）
- Lighthouse も本番と同じ Node で計測する（PR #2191 で `--bun` を除去済み）

## Alternatives considered

- **css-tree を upstream で直す** — `lib/data-patch.js` と `lib/version.js` の相対 require を
  絶対パス化すれば Bun + require-hook でも jsdom が通ることは実測済み
  （Node も Lexical テスト 29/29 も緑、戻すと症状再発）。維持コストが我々に無いので
  **これだけは価値がある**。ただし採用しても本リポジトリの判断は変わらない
  （Bun へ戻す理由が別に無いため）
- **Lexical の export を自前 serializer に置換** — 全カスタムノードの `exportDOM` を
  二重管理することになり drift 事故が確実。却下

## Re-evaluation triggers

次のいずれかが起きたら、この ADR を再検討する:

- oven-sh/bun#13076 が close される
- css-tree が相対 require を修正したリリースを出す
- Next の Bun Adapter が Next.js 公式 org から公開される
- happy-dom の更新後に `__tests__/unit/components/editor/lexical` が緑になる
  （`createHeadlessJsdom()` を 5 行差し替えて回せば 30 秒で判定できる）

## Related

- [csstree/csstree#371](https://github.com/csstree/csstree/pull/371) — Alternatives の
  「css-tree を upstream で直す」を実際に提出したもの（2026-08-12）。`lib/data-patch.js` と
  `lib/version.js` の相対 require を `fileURLToPath(new URL(…, import.meta.url))` にし、
  生成される `cjs/*.cjs` は patch 前と同一に保つ。**待つだけで、追う作業はしない** —
  upstream の master は 2026-03-05 を最後に動いておらず、同じ箇所を直す
  [#352](https://github.com/csstree/csstree/pull/352) は 2025-09-15 から maintainer 応答が無い。
  **マージされても本 ADR の決定は変わらない**（Bun へ戻す理由が別に無いため）。
  fork のブランチ `fix/absolute-path-for-createrequire-json` は PR の head なので消さない
- [oven-sh/bun#13076](https://github.com/oven-sh/bun/issues/13076) — 根本原因。Bun 自身が
  `confirmed bug` とラベル付けしたまま 2024-08-04 から open で、最新の 1.3.14
  （2026-05-13）でも再現する
