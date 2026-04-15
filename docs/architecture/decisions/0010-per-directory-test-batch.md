# 10. Bun Test は per-directory バッチ実行に統一する

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: testing, tooling, ci

## Context and Problem Statement

`bun test __tests__/unit` のように親ディレクトリを 1 プロセスで一括実行すると、`mock.module()` がグローバルモジュールキャッシュを書き換えるためテストファイル間で相互干渉し、次のような偽陽性／偽陰性を発生させた:

- ファイル A の `mock.module("@/shared/db/prisma", ...)` がファイル B の実 import を上書きし、ファイル B で `Export named 'X' not found` を発生させる
- `@/shared/lib/errors/server` / `@/shared/lib/crypto` / `@/shared/lib/constants` など広く mock される module でファイルごとに定義が食い違いハングする
- CI で `bun test --coverage` として 1 プロセス実行したところ、ローカルでは通るテストが再現性なく失敗する

Bun 本家の mock サブシステムはファイル境界でモジュールキャッシュをリセットしないため、「1 ファイルずつ別プロセスで起動する」以外に恒久的な対処法がない（[Bun issue tracker] でも `mock.module()` のスコープは未サポート）。

## Decision Drivers

- テスト結果の再現性（CI とローカルで同一結果）
- 開発者が `mock.module()` を自由に使えること（mock 利用を減らす方向は維持コストが大きい）
- 新規テスト追加時の摩擦を最小化する運用ルール

## Considered Options

1. **Option A**: 1 プロセス一括実行（`bun test __tests__/unit`）を維持し、mock module を禁止する
2. **Option B**: すべての mock 対象モジュールを allowlist 化し、全 export を含む共通モック fixture に集約する
3. **Option C**: per-directory バッチ実行を `package.json` の `test:unit` / `test:integration` スクリプトに固定し、親ディレクトリ指定や単独 `bun test` を禁止する

## Decision Outcome

**Chosen option**: "Option C — per-directory batch in package.json"、なぜなら:

- mock.module() は本プロジェクトの 4000+ 単体・統合テストの標準パターンであり、禁止は非現実的
- サブディレクトリごとに別プロセスを起動するオーバーヘッドは許容範囲（Bun の起動は ~50ms）
- `package.json` の `test:unit` / `test:integration` スクリプトが唯一の正規実行方法であるという規約は、CI と開発者双方で強制できる

実装:

- `package.json` `test:unit` に全 unit サブディレクトリを `&&` チェーンで列挙
- `package.json` `test:integration` に全 integration サブディレクトリを `&&` チェーンで列挙
- 単一実行（`bun test __tests__/unit`）・`bun test --coverage` は **運用で禁止**（CLAUDE.md §test-quality + `.claude/rules/bun-patterns.md` §同一モジュールへの mock.module 連続呼び出し禁止）
- CI は `bun run test:unit && bun run test:integration` を呼び、coverage 計測は行わない

### Consequences

**良い点**:

- 4991 tests（unit 3339 + integration 1652）が決定的に pass / fail するようになった
- 新規テスト追加時は対応するサブディレクトリが既に batch に入っていれば追加作業不要
- 「CI と local の結果が違う」調査コストがゼロに

**悪い点 / トレードオフ**:

- 新規テストサブディレクトリ追加時、`package.json` の `test:unit` / `test:integration` チェーンにも **手動で追記する必要がある**（忘れるとテストが実行されない）
- `bun test --coverage` による coverage 計測ができない（mock 干渉で不正確になるため）。coverage はローカルで参考値として取るにとどめる
- CI 実行時間が 1 プロセスより長い（~30 秒程度の増加）

### Compliance / Validation

- `package.json` `test:unit` / `test:integration` スクリプトが `&&` チェーンで全ディレクトリを列挙
- `.github/workflows/ci.yml` の unit-tests job は `bun run test:unit` + `bun run test:integration` を呼ぶ（`bun test --coverage` は禁止）
- `CLAUDE.md` §プロセスルール「`test:unit` / `test:integration` は per-directory バッチ」記載
- `.claude/rules/bun-patterns.md` §Gotchas に `mock.module` グローバル干渉の説明とバッチ実行要件を明記

## Pros and Cons of the Options

### Option A: mock.module 禁止

- ❌ DI 層を持たないプロジェクトで現実的ではない（Server Actions テストが不可能になる）
- ❌ 既存 4000+ テストの書き直し工数が莫大

### Option B: 共通モック fixture 集約

- ⚠️ `@/shared/lib/errors/server` など実装に沿った全 export を 1 箇所に集める運用は継続コストが高い
- ⚠️ 部分モックができず柔軟性が落ちる
- ❌ 根本原因（プロセス境界のリセット不足）を解決しない

### Option C: per-directory batch ✅ 採用

- ✅ 再現性 100%
- ✅ 既存テストの変更不要
- ✅ 新規モック自由
- ⚠️ ディレクトリ追加時の `package.json` 追記が必要

## Links / References

- [Bun Test Documentation - mock.module](https://bun.sh/docs/test/mocks#mock-module)
- 関連 rules: `.claude/rules/bun-patterns.md`, `.claude/rules/test-quality.md`
- 関連 commit: `c9e4f2aa ci(fixes): per-directory test batch + extract lefthook guards`
