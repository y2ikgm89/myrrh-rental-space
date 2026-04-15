# 0005. Lefthook を git hooks manager として採用

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: tooling, developer-experience, quality

## Context and Problem Statement

プロジェクトには git hooks が未設定だった。以下の問題を抱えていた:

- コミット前の format/lint 実行を各開発者が手動で行う必要があり、忘れると CI で初めて format drift が発覚
- 保護ファイル（`.env*` / `bun.lock` / `prisma/migrations/*.sql`）への誤コミットを防ぐ仕組みがローカルに存在しない
- Conventional Commits 規約を決めても実行時に検証できず、violation が main に混入
- push 前の重い検証（type-check, architecture-boundaries test）がない

## Decision Drivers

- 並列実行対応（Husky の逐次実行は遅い）
- staged files のみに対する増分チェック
- pre-commit / pre-push / commit-msg の 3 段階 hook
- インストールが簡単（Node 依存なし、Go バイナリ）
- 設定ファイル 1 つで完結

## Considered Options

1. **Option A: Husky + lint-staged**
2. **Option B: Lefthook (evilmartians)**
3. **Option C: pre-commit framework (Python)**
4. **Option D: 独自 shell script**

## Decision Outcome

**Chosen option**: "Option B — Lefthook"

`bun add -d lefthook` + `lefthook.yml` + `package.json` に `prepare: lefthook install`。

**pre-commit** (parallel):

- `eslint-fix` on staged `.ts/.tsx/.js/.jsx/.mjs/.cjs` with `stage_fixed: true`
- `prettier-fix` on staged `.{ts,tsx,js,jsx,mjs,cjs,json,md,yml,yaml,css}` with `stage_fixed: true`
- `protected-files` — `.env*` / `bun.lock` / `prisma/migrations/*.sql` への commit を shell script で block

**pre-push** (sequential):

- `type-check` — `bun run type-check`（全件、遅いが安全）
- `architecture-boundaries` — `bun test __tests__/unit/architecture-boundaries.test.ts`

**commit-msg**:

- Conventional Commits 形式 regex gate: `/^(feat|fix|refactor|perf|test|docs|chore|ci|style|build|revert)(\(.+\))?!?: .+/`

### Consequences

**良い点**:

- コミット前に format drift / lint error が自動修正される
- 保護ファイルの誤コミットを物理的に防止
- Conventional Commits が強制され、`CHANGELOG.md` 生成の基盤となる
- push 前の type-check / architecture-boundaries で CI 失敗を事前検出
- `parallel: true` で Husky よりも高速（pre-commit が 2-3x 高速化）
- Go バイナリなので Node / Python 依存なし

**悪い点 / トレードオフ**:

- 新規ツール（Lefthook）の学習コスト
- `LEFTHOOK=0 git commit` で bypass 可能（`--no-verify` は CLAUDE.md で deny）
- Windows と POSIX で shell script の互換性に注意

### Compliance / Validation

- `lefthook.yml` + `prepare: lefthook install` で `bun install` 時に自動セットアップ
- `CONTRIBUTING.md` に使用方法を記載
- `CLAUDE.md` の「保護ファイル」ルールと同期

## Pros and Cons of the Options

### Option A: Husky + lint-staged

- ✅ 最もポピュラー、ドキュメント豊富
- ❌ Husky v9 で大きく仕様変更、migration コストあり
- ❌ 逐次実行で遅い
- ❌ Node.js 依存

### Option B: Lefthook ✅ 採用

- ✅ 並列実行、高速
- ✅ 単一設定ファイル (`lefthook.yml`)
- ✅ Go バイナリで依存最小
- ⚠️ 日本語ドキュメントは少ない

### Option C: pre-commit framework

- ✅ Python エコシステムで実績あり
- ❌ Python 依存が不自然（JS プロジェクト）

### Option D: 独自 shell script

- ❌ 再発明、メンテナンスコスト

## Links / References

- [Lefthook 公式ドキュメント](https://lefthook.dev/)
- [Lefthook vs Husky ベンチマーク](https://github.com/evilmartians/lefthook/wiki/Benchmark-lefthook-vs-overcommit)
- [`lefthook.yml`](../../../lefthook.yml)
- 関連 ADR: [ADR-0004](./0004-turbopack-native-bundle-analyzer.md)
