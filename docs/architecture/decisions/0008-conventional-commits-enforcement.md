# 0008. Conventional Commits 強制（lefthook commit-msg + CI）

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: governance, developer-experience, changelog

## Context and Problem Statement

コミットメッセージの形式が統一されていなかった。結果として:

- `CHANGELOG.md` を自動生成する基盤がない
- PR ごとの変更種別（feat / fix / refactor）を目視で判断するしかない
- Renovate の `:semanticCommits` 連携が活かせない
- Dependency Dashboard や release automation の前提条件を満たさない
- 将来的に semantic-release や changesets を導入する場合に migration コストが発生

## Decision Drivers

- 自動 CHANGELOG 生成の基盤整備
- Renovate の semantic commit 連携
- PR 種別の機械可読性
- ローカル（commit 時）と CI の両方で validation
- 既存開発者の学習コスト最小化

## Considered Options

1. **Option A: Commitlint + husky で commit-msg hook**
2. **Option B: Lefthook commit-msg + 内蔵 regex check**
3. **Option C: 強制せず推奨のみ（CONTRIBUTING.md に記載）**
4. **Option D: `cz-cli` (Commitizen) で対話的生成**

## Decision Outcome

**Chosen option**: "Option B — Lefthook commit-msg + 内蔵 regex"

Husky/Commitlint を追加せず、既に導入済みの Lefthook の `commit-msg` hook で直接 regex check を実装:

```yaml
# lefthook.yml
commit-msg:
  jobs:
    - name: conventional-commits
      run: |
        MSG=$(cat {1})
        if ! echo "$MSG" | grep -qE '^(feat|fix|refactor|perf|test|docs|chore|ci|style|build|revert)(\(.+\))?!?: .+'; then
          echo "❌ コミットメッセージは Conventional Commits 形式で書いてください"
          echo "   例: feat(reservation): add cancellation flow"
          echo "   type: feat/fix/refactor/perf/test/docs/chore/ci/style/build/revert"
          exit 1
        fi
```

**許可する type**:

- `feat` — 新機能
- `fix` — バグ修正
- `refactor` — リファクタリング（動作変更なし）
- `perf` — パフォーマンス改善
- `test` — テスト追加・修正
- `docs` — ドキュメント
- `chore` — ビルド・ツール・依存
- `ci` — CI / workflow
- `style` — フォーマッティング
- `build` — ビルドシステム
- `revert` — revert コミット

**optional**: `<scope>` (例: `feat(reservation):`) と breaking change 印 `!` (例: `feat!:`)

### Consequences

**良い点**:

- 追加依存なし（Lefthook 既存導入）
- commit-msg 違反が commit 時にローカルで即検出
- `CHANGELOG.md` 自動生成の前提条件を満たす
- PR template の「変更の種類」チェックボックスと整合
- Renovate の `:semanticCommits` が機能
- 将来 semantic-release 導入時の移行コストゼロ

**悪い点 / トレードオフ**:

- Commitlint のような高度な rule（subject 長さ、scope enum 等）は未対応
- `--no-verify` で bypass 可能（ただし CLAUDE.md で deny 推奨）
- 日本語メッセージ対応は `.+` で柔軟に対応しているが scope の検証は弱い

### Compliance / Validation

- `lefthook.yml` の `commit-msg` job で commit 時に block
- `CONTRIBUTING.md` のコミット規約節に例と許可 type を明記
- PR template の変更種別チェックボックスと対応
- `CHANGELOG.md` の冒頭で Conventional Commits → Keep a Changelog 対応表を提示

将来 `CHANGELOG.md` 自動生成を導入する場合は `conventional-changelog-cli` / `changesets` / `release-please` のいずれかを選択。

## Pros and Cons of the Options

### Option A: Commitlint + Husky

- ✅ 業界標準、豊富な rule
- ❌ 追加依存（@commitlint/cli + @commitlint/config-conventional）
- ❌ Husky 併用で lefthook との役割重複

### Option B: Lefthook commit-msg + regex ✅ 採用

- ✅ 追加依存なし
- ✅ シンプルで理解しやすい
- ⚠️ 高度な rule は未対応（ただし regex で十分）

### Option C: 強制せず推奨のみ

- ❌ 実効性なし、自動 CHANGELOG の前提が崩れる

### Option D: Commitizen 対話的生成

- ✅ 初心者に優しい
- ❌ 追加依存 + 対話的コミットの UX 変更が大きい

## Links / References

- [Conventional Commits 1.0.0 公式](https://www.conventionalcommits.org/en/v1.0.0/)
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [`lefthook.yml`](../../../lefthook.yml)
- 関連: [`CONTRIBUTING.md`](../../../CONTRIBUTING.md), [`CHANGELOG.md`](../../../CHANGELOG.md), [ADR-0005 Lefthook](./0005-lefthook-for-git-hooks.md)
