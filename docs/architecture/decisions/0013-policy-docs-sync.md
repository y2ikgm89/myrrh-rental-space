# 13. .claude/rules と docs/reference/codex-rules を canonical-driven で同期

- **Status**: Superseded（2026-04-24: Codex ネイティブ clean-break により同期を廃止）
- **Date**: 2026-04-15（初版）/ 2026-04-22（改訂）
- **Deciders**: @y2ikgm89
- **Tags**: docs, governance, ci

## Supersession Note

この ADR は歴史的記録として残す。現在の Codex 正本は `AGENTS.md`, `.agents/skills`, `.codex/agents`, `.codex/rules`, `.codex/hooks.json` であり、`docs/reference/codex-rules/*`、policy sync scripts、CI の `policy-docs-sync` job は廃止済み。現在の方針は [`docs/architecture/codex-instructions.md`](../codex-instructions.md) を参照。

## Context and Problem Statement

本プロジェクトでは 2 種類の AI エージェントが同じルールセットを参照する:

- **Claude Code**（`.claude/rules/**/*.md`）— `paths:` frontmatter で条件付き自動ロード
- **Codex Plugin**（`docs/reference/codex-rules/**/*.md`）— 別の読込機構（単一 markdown ファイルとして読み込み）

両者は同じ内容を記述するが、ディレクトリ構造・ファイル命名規則が異なる。最初は手動コピーで運用していたが、片側だけ更新してもう片側を忘れるドリフトが発生し、Codex 側のエージェントが旧ルールに従って「削除されたパターン」を提案する事故があった。

さらに Claude Code 側は公式推奨（`code.claude.com/docs/en/claude-directory`）に従い `paths:` で path-scoped に細かく分割することで context 圧迫を抑えたい一方、Codex 側は単一ファイルで全量読み込む方が参照効率が良い。この粒度差を両立する仕組みが必要となった。

## Decision Drivers

- 同一内容のルールドキュメントが 2 箇所に存在する状態を維持する必要がある（両エージェントの読込機構が異なる）
- Claude Code 側は `paths:` scoping 恩恵のため細粒度分割を許容
- Codex Plugin 側は単一ファイル粒度を維持（断片化しない）
- ドリフトを CI で検出し、PR が merge される前にブロックする
- どちらが「canonical（正本）」かを明確にし、更新方向を固定する
- バイト単位の厳密な比較（markdown の空白・改行違いもドリフトとして扱う）

## Considered Options

1. **Option A**: どちらか一方だけ残し、もう一方は symlink にする
2. **Option B**: ビルド時に canonical 側から生成する（markdown preprocessor）
3. **Option C**: 2 箇所に実ファイルを置き、CI で byte-identical を assert する（1:1 のみ）
4. **Option D**: Canonical を N 分割しつつ mirror は 1 ファイル。Node stdlib のみで concat 生成（1:1 と N:1 両対応）

## Decision Outcome

**Chosen option**: "Option D — Node stdlib で N-to-1 concat 生成 + CI で byte-identical を強制"、なぜなら:

- symlink（Option A）は Windows 開発環境で権限問題が発生する
- preprocessor 生成（Option B）は外部ツール導入が必要
- 1:1 固定（Option C）は Claude 側の path-scoped 細分化と相容れない
- **Option D は Node stdlib のみで実装可能**（concat は `readFileSync` + `Buffer` 連結のみ）。Claude 側の細分化と Codex 側の単一ファイル化を両立できる

実装:

- `scripts/policy-docs-pairs.mjs` に pair 定義を SSoT 化（`{ mirror, sources[] }` 形式）
- `scripts/verify-policy-docs.mjs` が各 pair で期待される mirror 内容を構築し `Buffer.equals()` で比較
- `scripts/sync-policy-docs.mjs` が mirror を再生成（手動 `cp` の代替）
- 不一致があれば `process.exit(1)` で CI job blocking
- `.github/workflows/ci.yml` の `policy-docs-sync` job が最初に走り、他 job の前提条件
- 開発者ローカル: `bun run docs:verify-policy-sync` / `bun run docs:sync-policy`

### Canonical 方向

- **`.claude/rules/**` が正本\*\*（Claude Code が本プロジェクトの主要エージェント）
- `docs/reference/codex-rules/**` は mirror（編集は canonical 側で行い sync script で再生成）

### Pair 種別

| sources.length | 挙動                                                               | 用途                                                               |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1              | Mirror は canonical と byte-identical（frontmatter 含む）          | 単一ファイル粒度で十分な rules（例: admin-inline-editor-patterns） |
| 2+             | Mirror は各 source の frontmatter を剥がし source marker で concat | Claude 側で path-scoped 分割したい大 rules（例: lexical）          |

### Concat フォーマット（N:1 時）

先頭に auto-generated notice、各 source の本文直前に marker を挿入:

```markdown
<!-- === AUTO-GENERATED: do not edit directly ===
     canonical sources (edit these instead):
       - .claude/rules/frontend/lexical/core.md
       - .claude/rules/frontend/lexical/nodes.md
       ...
     regenerate: node scripts/sync-policy-docs.mjs
=== -->

<!-- === source: .claude/rules/frontend/lexical/core.md === -->

(frontmatter 除去済み本文)

<!-- === source: .claude/rules/frontend/lexical/nodes.md === -->

(frontmatter 除去済み本文)
```

### 現在の同期対象（2 pairs）

| Mirror                                                       | Sources                                                                   | Mode      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| `docs/reference/codex-rules/lexical-patterns.md`             | `.claude/rules/frontend/lexical-patterns.md`（後続 commit で 4 分割予定） | 1:1 → N:1 |
| `docs/reference/codex-rules/admin-inline-editor-patterns.md` | `.claude/rules/frontend/admin-inline-editor-patterns.md`                  | 1:1       |

Pair 追加・変更は `scripts/policy-docs-pairs.mjs` の `PAIRS` 配列に追記/改変。

### Consequences

**良い点**:

- ドリフトは CI で必ず検出される（実際にこの ADR 執筆中の点検でドリフト 2 件を検出・修正した実績あり）
- 正本方向が固定されているため「どちらを更新すべきか」の判断コストがない
- byte 比較なので改行コード・末尾空白のような目に見えにくい差分も逃さない
- Claude 側は `paths:` scoping の恩恵を受けつつ Codex 側は単一ファイル参照を維持できる
- Mirror 再生成が自動化され手動 `cp` のオペレーションミスが消える

**悪い点 / トレードオフ**:

- Mirror は auto-generated のため手動編集禁止（ファイル冒頭の notice で明示）
- 新規 pair 追加時は `scripts/policy-docs-pairs.mjs` に追記が必要（pair 定義が 1 箇所に集約されているためコスト小）
- N:1 concat の場合、mirror を読むと source marker が混じる（Codex の markdown レンダリングは HTML comment を無視するため実害なし）

### Compliance / Validation

- `.github/workflows/ci.yml` `policy-docs-sync` job が blocking で走る
- `scripts/verify-policy-docs.mjs` が node のみで動作（bun 不要、Node stdlib のみ）
- 本 ADR 自体が「canonical は `.claude/rules`」の公式記録
- Mirror 更新手順: `node scripts/sync-policy-docs.mjs`（全 pair 再生成）
- Dry-run: `node scripts/sync-policy-docs.mjs --check`（CI と等価の drift 検出）

## Pros and Cons of the Options

### Option A: symlink

- ✅ 1 ファイル編集で両側更新
- ❌ Windows 権限問題（`mklink` 要管理者、Git の `core.symlinks` 設定依存）
- ❌ Codex Plugin が symlink を実ファイルとして認識しない可能性

### Option B: build 時生成（preprocessor）

- ✅ 自動同期
- ❌ markdown preprocessor 導入コスト
- ❌ 生成物をコミットする必要あり（Codex Plugin 要件）

### Option C: CI byte 比較（1:1 のみ）

- ✅ シンプル
- ❌ Claude 側の細分化（path-scoping 恩恵）と両立できない

### Option D: Node stdlib concat + CI byte 比較 ✅ 採用

- ✅ Node stdlib のみ、依存ゼロ
- ✅ 1:1 と N:1 両対応で粒度差を吸収
- ✅ Mirror 再生成スクリプトで手動 `cp` 排除
- ⚠️ 新規 pair 追加時に `policy-docs-pairs.mjs` 編集が必要だが 1 箇所集約でコスト小

## Links / References

- 実装:
  - `scripts/policy-docs-pairs.mjs`（pair 定義 SSoT）
  - `scripts/verify-policy-docs.mjs`（検証）
  - `scripts/sync-policy-docs.mjs`（再生成）
- CI job: `.github/workflows/ci.yml` §policy-docs-sync
- 関連 commit:
  - `0bccbe4e docs(policy): resync codex-rules with .claude/rules canonical source`（初版）
  - 2026-04-22 改訂: Option D 採用 + N-to-1 concat 対応
- 関連 directories: `.claude/rules/frontend/`, `docs/reference/codex-rules/`
- 関連 ADR: [ADR-0015 Clean-Break Refactor](./0015-clean-break-refactor-and-parallel-implementer-discipline.md)
