# `.claude/rules/**` Clean-Break Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/rules/**` 49 ファイル / 14,520 行を公式ベストプラクティス + プロジェクト規約準拠で clean break refactor（deprecated note 整理 / frontmatter 整合性 / ADR drift 監査 / 巨大ファイル barrel-index 分割）

**Architecture:** 7 phase / 7 commit。phase 間は独立で commit 単位 rollback 可能。barrel-index 分割は `react-patterns.md` / `gsap-patterns.md` / `lexical-patterns.md` の既存パターン（barrel + sub-file 構造）を踏襲。

**Tech Stack:** Markdown + YAML frontmatter (`paths:` glob で Claude Code 自動ロード) + git commit 単位の rollback / `bun run validate` で構文検証なし（rule docs は実行されない）

**プロジェクト準拠の重要規律**:

- CLAUDE.md §調査・監査 「rule docs 構造仮定は事前 grep 必須」
- ADR 0015 同等の clean break 原則（旧名 re-export / `@deprecated` 印 / `// removed:` コメント禁止）
- 1 plan / 1 セッション規律（handoff `project_clean-break-refactor-handoff.md`）

---

## Pre-Audit (実行不要、参考値)

事前 grep で確定した ground truth:

| 指標                      | 値                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 全ファイル数              | 49（`find .claude/rules -type f -name "*.md" \| wc -l`）                                                                   |
| 全行数                    | 14,520（`xargs wc -l`）                                                                                                    |
| `paths:` frontmatter 保有 | 49 / 49（100%）                                                                                                            |
| deprecated marker 含有    | 14 ファイル / 36 occurrences                                                                                               |
| 既存 barrel-index         | 4 件（`react-patterns.md` / `gsap-patterns.md` / `frontend/lexical-patterns.md` / `frontend/admin-ui-patterns.md` hybrid） |
| 500 行超ファイル          | 11 件（最大 `server-actions.md` / `frontend/accessibility.md` 各 752 行）                                                  |

**500 行超ファイル一覧**（barrel-index 分割候補）:

| 順位 | ファイル                     | 行数 | バイト | 主要 section 数 | 分割優先度                                    |
| ---- | ---------------------------- | ---- | ------ | --------------- | --------------------------------------------- |
| 1    | `server-actions.md`          | 752  | 35KB   | 10              | **A: 必須**                                   |
| 2    | `frontend/accessibility.md`  | 752  | 26KB   | 15              | **A: 必須**                                   |
| 3    | `zod-patterns.md`            | 746  | 27KB   | 11              | B: 推奨                                       |
| 4    | `prisma-patterns.md`         | 725  | 39KB   | 14              | B: 推奨                                       |
| 5    | `auth-patterns.md`           | 715  | 33KB   | 11              | B: 推奨                                       |
| 6    | `tailwind-patterns.md`       | 569  | 22KB   | 11              | C: 任意                                       |
| 7    | `frontend/admin-ui/forms.md` | 528  | 22KB   | -               | C: 任意                                       |
| 8    | `gotchas.md`                 | 519  | 156KB  | **27**          | **A: 必須**（cross-cutting catch-all のため） |
| 9    | `test-quality.md`            | 510  | 18KB   | 10              | C: 任意                                       |
| 10   | `frontend/seo-patterns.md`   | 508  | 24KB   | 10              | C: 任意                                       |
| 11   | `error-handling.md`          | 504  | 19KB   | 7               | C: 任意                                       |

**本 plan の barrel 分割スコープ**: 優先度 A の 3 件（`server-actions.md` / `frontend/accessibility.md` / `gotchas.md`）。優先度 B/C は次セッション以降の判断とする（1 plan / 1 セッション規律遵守）。

**deprecated marker 含有 14 ファイル**:

```
.claude/rules/auth-patterns.md (3)
.claude/rules/api-routes.md (2)
.claude/rules/gotchas.md (19)
.claude/rules/server-actions.md (1)
.claude/rules/implementation-quality.md (2)
.claude/rules/prisma-patterns.md (1)
.claude/rules/zod-patterns.md (1)
.claude/rules/tailwind-patterns.md (1)
.claude/rules/frontend/admin-inline-editor-patterns.md (1)
.claude/rules/type-safety.md (1)
.claude/rules/frontend/admin-ui/forms.md (1)
.claude/rules/frontend/ui-ux-patterns.md (1)
.claude/rules/frontend/gsap/core.md (1)
.claude/rules/frontend/lexical/conventions.md (1)
```

---

## File Structure

### 新規作成（Phase 5-7 の barrel-index 分割で生成）

```
.claude/rules/
├── server-actions.md                          ← barrel index に置換（752 → ~25 行）
├── server-actions/                            ← 新規 sub-dir
│   ├── export-contract.md                     ← `"use server"` export 契約 + Reader 関数 = Route Handler
│   ├── use-cache.md                           ← 'use cache' パターン + キャッシュ無効化
│   ├── implementation.md                      ← Server Action 実装パターン + 公開データ取得 + safeFetch
│   └── prohibitions.md                        ← キャッシュタグ命名 + 禁止事項 + ファイル配置 + Gotchas
├── frontend/
│   ├── accessibility.md                       ← barrel index に置換（752 → ~25 行）
│   ├── accessibility/                         ← 新規 sub-dir
│   │   ├── semantics.md                       ← セマンティック HTML + aria-* 属性
│   │   ├── focus-keyboard.md                  ← フォーカス管理 + キーボードナビゲーション
│   │   ├── touch-text.md                      ← タッチターゲット 44px + フォントサイズ最小値 + Uppercase tracking
│   │   ├── motion.md                          ← prefers-reduced-motion
│   │   ├── images-text.md                     ← 画像 alt + 画像上テキスト 3 層保証
│   │   └── forms-prohibitions.md              ← フォーム a11y + 禁止事項 + ファイル配置 + 参照
└── gotchas.md                                 ← barrel index に置換（519 → ~30 行）
└── gotchas/                                   ← 新規 sub-dir
    ├── auth-routing.md                        ← Admin Gate + Multiple Root Layouts + ナビゲーション + Better Auth クライアント
    ├── domain.md                              ← 料金フォーマット + ドメイン・予約 + ホームページ Section 管理
    ├── ui.md                                  ← 公開フォーム UI 統一 + 公開ページ レスポンシブ標準 + Page-First Architecture + ブログサイドバー
    ├── prisma.md                              ← Prisma / adapter-pg + Prisma Migrate
    ├── deployment.md                          ← デプロイ + ビルド・検証 + ファイル操作・Git + Worktree + Tailwind v4/Turbopack HMR
    ├── claude-code.md                         ← Claude Code 設定 + shadcn/ui コンポーネント + Import Alias + Route Handler
    └── prohibitions.md                        ← フレームワーク固有 + セキュリティ + 外部 API 統合 + レートリミッター
```

### 修正（Phase 1-4 / Phase 8）

```
.claude/rules/<14 ファイル>                    ← Phase 1: deprecated note 整理（→「禁止事項」または「削除済みパターン参照」セクションに consolidate）
.claude/rules/**/*.md                          ← Phase 2: paths frontmatter 整合性チェック（修正は drift 検出時のみ）
                                               ← Phase 3: ADR drift audit（修正は drift 検出時のみ）
CLAUDE.md                                      ← Phase 8: barrel 分割を反映（参照箇所更新）
```

---

## Phase 1: Deprecated Note 整理

**Files:**

- Modify: 上記 14 ファイル（一括 PR は分割せず単一 commit）

**目的:** 「廃止済み」「削除済み」「再導入禁止」「@deprecated」「removed:」「legacy」「旧パターン」が本文に散在している状態を、ファイル末尾「禁止事項」または末尾「削除済みパターン参照」セクションに consolidate。clean break 原則のため、置換後の旧名の単純列挙（`X は削除済み` のみで何を使うべきか書いていないもの）は完全削除。新パターンへの誘導を含む記述（`X は廃止済み — 代わりに Y を使う`）は残す。

- [ ] **Step 1: Phase 1 用 commit base SHA 確認**

```bash
git log --oneline -1
```

Expected: `b4b96773 docs(claude): codify MEMORY.md re-read rule before large plan creation`（または以降の最新 commit）

- [ ] **Step 2: 14 ファイルの deprecated marker を 1 つずつ判定**

各 occurrence について以下フローで判定:

```
1. occurrence の文章を read
2. 判定:
   (a) 旧名 X の単純宣言（`X は削除済み`）のみ → 削除（clean break）
   (b) 旧名 X + 新名 Y への誘導（`X は廃止済み、Y を使う`）→ 保持
   (c) 「再導入禁止」のような積極ガード → 「禁止事項」セクションへ移動
3. 修正後の section 構造を維持（`##` / `###` 階層）
```

参考実装（`gotchas.md:61` の判定例）:

```
- `CACHE_TAGS.SETTINGS` は廃止済み — 粒度タグ（LAYOUT_SETTINGS, ...）を直接使用 ← (b) → 保持
```

参考実装（`gotchas.md:167` の判定例）:

```
- `@layer compat` と旧カラートークンは削除済み — `--color-primary` 等の旧トークンは存在しない。全コンポーネントが `@theme` のセマンティックトークンを直接使用 ← (a) 旧名宣言のみだが「全コンポーネントが」の説明が文脈を持つ → 保持（境界判定: 「使用すべき新パターン」の名前指定があれば保持）
```

- [ ] **Step 3: 修正適用**

各 file ごとに Edit ツールで occurrence を修正。複数 occurrence のあるファイル（`gotchas.md` 19 件 / `auth-patterns.md` 3 件 / `api-routes.md` 2 件 / `implementation-quality.md` 2 件）は 1 ファイルにつき複数 Edit 呼び出しに分けて慎重に。

- [ ] **Step 4: 監査 grep 再実行**

```bash
grep -rn "@deprecated\|deprecated:\|廃止済み\|削除済み\|再導入禁止\|❌ 過去\|removed:\|legacy\|旧パターン" .claude/rules/ | wc -l
```

Expected: 削減後の数値（少なくとも (a) 削除分は減少）。「ゼロ」目標ではなく「(b)/(c) のみ残存」が目標。

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/
git commit -m "$(cat <<'EOF'
refactor(rules): consolidate deprecated notes per clean-break principle

ADR 0015 と同様の clean break 原則に従い、`.claude/rules/**` の
deprecated marker (14 ファイル / 36 occurrences) を整理:

- (a) 旧名宣言のみの occurrence → 削除（clean break）
- (b) 旧名 → 新名誘導の occurrence → 保持（migration ガイド価値あり）
- (c) 「再導入禁止」の積極ガード → 「禁止事項」セクションへ移動

`@deprecated` / `// removed:` 等の付与禁止（CLAUDE.md 項目維持）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Frontmatter `paths:` 整合性チェック

**Files:**

- Read-only audit: 全 49 ファイル
- Modify (drift 検出時のみ): 該当ファイル

**目的:** `paths:` glob が現在のリポジトリ構造で実際に match するか確認。MINGW64 の `()` 含むパス（`src/app/(admin)/...`）でも動作することを再確認（既に handoff で確認済み）。

- [ ] **Step 1: 全 paths を抽出**

```bash
for f in $(find .claude/rules -type f -name "*.md"); do
  echo "=== $f ==="
  awk '/^paths:/,/^[a-z]+:|^---$/' "$f" | grep "^  -"
done
```

- [ ] **Step 2: 各 path glob が実在 file に match するか確認**

任意の paths から 5 件 sample で `Glob` 実行して match 数 > 0 を確認。0 件なら drift（リファクタで対象 dir が消えた）として該当 rule を update or delete 候補にリストアップ。

例:

```
.claude/rules/frontend/gsap-patterns.md の paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/components/effects/**"
→ Glob で 5 件以上 match すれば OK
```

- [ ] **Step 3: drift 検出した場合のみ修正**

drift がない場合は no-op で次 phase へ。

- [ ] **Step 4: Commit (drift 検出時のみ)**

```bash
git add .claude/rules/
git commit -m "$(cat <<'EOF'
refactor(rules): align paths frontmatter with current repo structure

Phase 2 of rules clean-break refactor.
<検出した具体的な drift 一覧>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

drift なしの場合は commit 不要、Phase 3 へ。

---

## Phase 3: ADR Drift Audit

**Files:**

- Read-only: `docs/architecture/decisions/*.md` (22 件) + `.claude/rules/**/*.md` (49 件)
- Modify (drift 検出時のみ): 該当 rule ファイル / ADR

**目的:** ADR で採択された制約と rule docs の記述が乖離していないか検証。skill `adr-drift-audit` を起動して dead code 化したルール / supersede 漏れ ADR を検出。

- [ ] **Step 1: skill 起動**

```
/adr-drift-audit
```

または手動で:

1. `ls docs/architecture/decisions/` で 22 件全 ADR をリストアップ
2. 各 ADR の Decision section を read
3. 該当 rule docs（`.claude/rules/**`）を Grep で逆引き
4. drift 検出: ADR で「禁止」採択されたパターンが rule docs に「使用例」として残存 / 逆に rule docs にしかない厳格化が ADR 化されていない

- [ ] **Step 2: drift 表作成**

```markdown
| ADR      | rule file             | drift 内容                                     | 修正方針 |
| -------- | --------------------- | ---------------------------------------------- | -------- |
| ADR 0015 | gotchas.md:XXX        | 旧 X re-export 例が残存                        | 削除     |
| ADR 0019 | server-actions.md:XXX | execute-admin-mutation-result の実行順序が古い | 更新     |
```

- [ ] **Step 3: 修正適用**

drift がない場合は no-op で次 phase へ。

- [ ] **Step 4: Commit (drift 検出時のみ)**

```bash
git add .claude/rules/ docs/architecture/decisions/
git commit -m "$(cat <<'EOF'
refactor(rules): resolve ADR drift in rule docs

Phase 3 of rules clean-break refactor.
<検出した具体的な drift 一覧と修正内容>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Validation Checkpoint（Phase 1-3 完了後）

**Files:** 確認のみ

- [ ] **Step 1: 修正後の rule autoload 動作確認**

`bun run validate` は rule docs を実行しないため構文検証なし。代わりに以下を実行:

```bash
# 全 file の frontmatter parse error チェック (Python YAML 経由)
python3 -c "
import yaml, sys, glob
for path in glob.glob('.claude/rules/**/*.md', recursive=True):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    if not content.startswith('---'):
        continue
    try:
        end = content.index('---', 3)
        yaml.safe_load(content[3:end])
    except Exception as e:
        print(f'PARSE_ERROR: {path}: {e}')
print('OK')
"
```

Expected: `OK`（PARSE_ERROR の出力なし）

- [ ] **Step 2: 行数 / バイト数の delta 確認**

```bash
echo "Phase 1-3 後の状態:"
find .claude/rules -type f -name "*.md" | xargs wc -l | tail -1
find .claude/rules -type f -name "*.md" | wc -l
```

Phase 1 で行数減少していることを確認（deprecated marker (a) 削除分）。

---

## Phase 5: Barrel Split — `server-actions.md` → `server-actions/` sub-dir

**Files:**

- Modify: `.claude/rules/server-actions.md` (752 → ~25 行 barrel に置換)
- Create: `.claude/rules/server-actions/export-contract.md`
- Create: `.claude/rules/server-actions/use-cache.md`
- Create: `.claude/rules/server-actions/implementation.md`
- Create: `.claude/rules/server-actions/prohibitions.md`

**分割マッピング** (`.claude/rules/server-actions.md` の `## section` 名 → 移動先):

| section（行）                                  | 移動先               |
| ---------------------------------------------- | -------------------- |
| `"use server"` ファイルの export 契約（11）    | `export-contract.md` |
| Reader 関数は Route Handler が canonical（50） | `export-contract.md` |
| 'use cache' パターン（131）                    | `use-cache.md`       |
| キャッシュ無効化パターン（241）                | `use-cache.md`       |
| Server Action 実装パターン（342）              | `implementation.md`  |
| 公開データ取得パターン（518）                  | `implementation.md`  |
| キャッシュタグ命名規則（572）                  | `prohibitions.md`    |
| 禁止事項（618）                                | `prohibitions.md`    |
| ファイル配置（734）                            | `prohibitions.md`    |
| Gotchas（747）                                 | `prohibitions.md`    |

- [ ] **Step 1: 既存 barrel-index pattern を re-read（参考）**

```
Read: .claude/rules/react-patterns.md          ← 15 行 / 4 sub-file 参照
Read: .claude/rules/frontend/gsap-patterns.md  ← 20 行 / 4 sub-file 参照
Read: .claude/rules/frontend/lexical-patterns.md ← 18 行 / 5 sub-file 参照
```

- [ ] **Step 2: 4 sub-file を新規作成**

各 sub-file は frontmatter（`description:` + 必要に応じて `paths:`）+ 移動元の section をそのまま copy で作成。

`server-actions/export-contract.md` 例:

```markdown
---
description: Server Action ファイルの export 契約 — async 関数のみ export 可、Reader 関数は Route Handler が canonical
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/app/(admin)/admin/api/**"
---

# Server Action — Export 契約 / Reader 関数

(server-actions.md L11-130 を移動)
```

`server-actions/use-cache.md` 例:

```markdown
---
description: Server Action の 'use cache' パターン + キャッシュ無効化（updateTag / revalidateTag）
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/shared/lib/cache/**"
  - "src/shared/lib/constants/**"
---

# Server Action — 'use cache' / キャッシュ無効化

(server-actions.md L131-341 を移動)
```

`server-actions/implementation.md` 例:

```markdown
---
description: Server Action 実装パターン（executeAdminMutationResult / safeFetch / toPlainObject）+ 公開データ取得
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
---

# Server Action — 実装パターン / 公開データ取得

(server-actions.md L342-571 を移動)
```

`server-actions/prohibitions.md` 例:

```markdown
---
description: Server Action のキャッシュタグ命名規則 / 禁止事項 / ファイル配置 / Gotchas
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
---

# Server Action — 命名規則 / 禁止事項 / 配置 / Gotchas

(server-actions.md L572-end を移動)
```

- [ ] **Step 3: barrel index に server-actions.md を置換**

```markdown
---
description: Server Action パターン（Next.js 16 / "use server" 契約 / 'use cache' / キャッシュ無効化）— 詳細は sub-file を参照
paths:
  - "src/**/_actions/**"
  - "src/**/actions/**"
  - "src/app/(admin)/admin/api/**"
---

# Server Action パターン（barrel index）

このファイルは barrel index。各トピックは以下 sub-file で管理:

- [server-actions/export-contract.md](./server-actions/export-contract.md) — `"use server"` export 契約 / Reader 関数は Route Handler が canonical
- [server-actions/use-cache.md](./server-actions/use-cache.md) — 'use cache' パターン / キャッシュ無効化（updateTag / revalidateTag / CACHE_TAGS）
- [server-actions/implementation.md](./server-actions/implementation.md) — `executeAdminMutationResult` / 公開データ取得（safeFetch + toPlainObject）
- [server-actions/prohibitions.md](./server-actions/prohibitions.md) — キャッシュタグ命名規則 / 禁止事項 / ファイル配置 / Gotchas
```

- [ ] **Step 4: 移動後の line 数 + 内容 hash 検証**

```bash
# 元 file の合計行数（修正前）≈ 移動後 4 sub-file の合計行数（barrel header 分のみ増加）
wc -l .claude/rules/server-actions/*.md
# Expected: 元 752 + frontmatter overhead 4*5 ≈ 772 行
```

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/server-actions.md .claude/rules/server-actions/
git commit -m "$(cat <<'EOF'
refactor(rules): split server-actions.md into barrel-index + 4 sub-files

server-actions.md (752 行) を barrel-index pattern (precedent: react-patterns.md /
gsap-patterns.md / lexical-patterns.md) で分割:

- server-actions/export-contract.md — "use server" 契約 / Reader = Route Handler
- server-actions/use-cache.md — 'use cache' / キャッシュ無効化
- server-actions/implementation.md — 実装パターン / 公開データ取得
- server-actions/prohibitions.md — 命名規則 / 禁止事項 / 配置 / Gotchas

barrel index は ~25 行に短縮。各 sub-file が独立 paths frontmatter で
autoload 範囲を明示。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Barrel Split — `frontend/accessibility.md` → `frontend/accessibility/` sub-dir

**Files:**

- Modify: `.claude/rules/frontend/accessibility.md` (752 → ~30 行 barrel に置換)
- Create: `.claude/rules/frontend/accessibility/semantics.md`
- Create: `.claude/rules/frontend/accessibility/focus-keyboard.md`
- Create: `.claude/rules/frontend/accessibility/touch-text.md`
- Create: `.claude/rules/frontend/accessibility/motion.md`
- Create: `.claude/rules/frontend/accessibility/images-text.md`
- Create: `.claude/rules/frontend/accessibility/forms-prohibitions.md`

**分割マッピング**:

| section（行）                           | 移動先                  |
| --------------------------------------- | ----------------------- |
| 概要（11）                              | barrel header に統合    |
| セマンティック HTML（24）               | `semantics.md`          |
| aria-\* 属性（180）                     | `semantics.md`          |
| フォーカス管理（253）                   | `focus-keyboard.md`     |
| キーボードナビゲーション（677）         | `focus-keyboard.md`     |
| タッチターゲット（307）                 | `touch-text.md`         |
| フォントサイズ最小値（386）             | `touch-text.md`         |
| Uppercase ラベル tracking 標準値（410） | `touch-text.md`         |
| prefers-reduced-motion（436）           | `motion.md`             |
| 画像 alt テキスト（596）                | `images-text.md`        |
| 画像上テキストの 3 層可読性保証（618）  | `images-text.md`        |
| フォームアクセシビリティ（535）         | `forms-prohibitions.md` |
| 禁止事項（713）                         | `forms-prohibitions.md` |
| ファイル配置（737）                     | `forms-prohibitions.md` |
| 参照（748）                             | `forms-prohibitions.md` |

- [ ] **Step 1: 6 sub-file を新規作成**

各 sub-file は frontmatter（`description:` + `paths:`）+ 移動元 section の copy で作成。

`frontend/accessibility/semantics.md` 例:

```markdown
---
description: Accessibility — セマンティック HTML / aria-* 属性
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility — セマンティック HTML / aria-\*

(frontend/accessibility.md L24-252 を移動)
```

他 5 sub-file も同様に作成。`paths:` は元 file の paths をそのまま継承。

- [ ] **Step 2: barrel index に置換**

```markdown
---
description: Accessibility — WCAG 2.1 AA / 2.5.5 Enhanced AAA 準拠（詳細は sub-file 参照）
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(admin)/**/*.tsx"
---

# Accessibility（barrel index）

WCAG 2.1 AA + 2.5.5 Enhanced (AAA) 準拠。各トピックは以下 sub-file で管理:

- [accessibility/semantics.md](./accessibility/semantics.md) — セマンティック HTML / aria-\* 属性
- [accessibility/focus-keyboard.md](./accessibility/focus-keyboard.md) — フォーカス管理 / キーボードナビゲーション
- [accessibility/touch-text.md](./accessibility/touch-text.md) — タッチターゲット 44px / フォントサイズ最小値 / Uppercase tracking
- [accessibility/motion.md](./accessibility/motion.md) — prefers-reduced-motion
- [accessibility/images-text.md](./accessibility/images-text.md) — 画像 alt / 画像上テキスト 3 層可読性保証
- [accessibility/forms-prohibitions.md](./accessibility/forms-prohibitions.md) — フォーム a11y / 禁止事項 / 参照
```

- [ ] **Step 3: 移動後検証 + Commit**

```bash
wc -l .claude/rules/frontend/accessibility/*.md
# Expected: 元 752 + frontmatter overhead 6*5 ≈ 782 行

git add .claude/rules/frontend/accessibility.md .claude/rules/frontend/accessibility/
git commit -m "$(cat <<'EOF'
refactor(rules): split frontend/accessibility.md into barrel-index + 6 sub-files

frontend/accessibility.md (752 行 / 15 sections) を barrel-index pattern で分割:

- accessibility/semantics.md — セマンティック HTML / aria-*
- accessibility/focus-keyboard.md — フォーカス / キーボードナビ
- accessibility/touch-text.md — 44px タッチ / フォントサイズ / tracking
- accessibility/motion.md — prefers-reduced-motion
- accessibility/images-text.md — 画像 alt / 画像上テキスト 3 層保証
- accessibility/forms-prohibitions.md — フォーム / 禁止事項 / 参照

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7: Barrel Split — `gotchas.md` → `gotchas/` sub-dir

**Files:**

- Modify: `.claude/rules/gotchas.md` (519 → ~30 行 barrel に置換)
- Create: `.claude/rules/gotchas/auth-routing.md`
- Create: `.claude/rules/gotchas/domain.md`
- Create: `.claude/rules/gotchas/ui.md`
- Create: `.claude/rules/gotchas/prisma.md`
- Create: `.claude/rules/gotchas/deployment.md`
- Create: `.claude/rules/gotchas/claude-code.md`
- Create: `.claude/rules/gotchas/prohibitions.md`

**分割マッピング** (27 sections → 7 sub-file):

| section群                                                                                       | 移動先            |
| ----------------------------------------------------------------------------------------------- | ----------------- |
| Admin Gate / Multiple Root Layouts / ナビゲーション / Better Auth クライアント                  | `auth-routing.md` |
| 料金フォーマット / ドメイン・予約 / ホームページ Section 管理                                   | `domain.md`       |
| 公開フォーム UI 統一 / 公開ページ レスポンシブ標準 / Page-First Architecture / ブログサイドバー | `ui.md`           |
| Prisma / adapter-pg / Prisma Migrate                                                            | `prisma.md`       |
| デプロイ / ビルド・検証 / ファイル操作・Git / Worktree / Tailwind v4 / Turbopack HMR            | `deployment.md`   |
| Claude Code 設定 / shadcn/ui コンポーネント / Import Alias / Route Handler（PPR 環境）          | `claude-code.md`  |
| フレームワーク固有 / セキュリティ / 外部 API 統合 / レートリミッター                            | `prohibitions.md` |

- [ ] **Step 1: 7 sub-file を新規作成**

frontmatter `paths:` は元 `src/**` + `prisma/**`（gotchas.md 全体の paths）を継承。各 sub-file の `description:` で内容を簡潔表現。

例 `gotchas/deployment.md`:

```markdown
---
description: Gotchas — デプロイ / ビルド検証 / Git Worktree / Tailwind v4 + Turbopack HMR
paths:
  - "src/**"
  - "prisma/**"
  - "Dockerfile"
  - "cloudbuild.yaml"
---

# Gotchas — デプロイ / ビルド / Git / Worktree / Tailwind+Turbopack

(gotchas.md の該当 sections を移動)
```

- [ ] **Step 2: barrel index に置換**

```markdown
---
description: Gotchas — プロジェクト固有の落とし穴と対処法（barrel index）
paths:
  - "src/**"
  - "prisma/**"
---

# Gotchas（barrel index）

プロジェクト固有の落とし穴と対処法。各トピックは以下 sub-file で管理:

- [gotchas/auth-routing.md](./gotchas/auth-routing.md) — Admin Gate / Multiple Root Layouts / ナビゲーション / Better Auth クライアント
- [gotchas/domain.md](./gotchas/domain.md) — 料金フォーマット / ドメイン・予約 / ホームページ Section 管理
- [gotchas/ui.md](./gotchas/ui.md) — 公開フォーム UI / レスポンシブ標準 / Page-First / ブログサイドバー
- [gotchas/prisma.md](./gotchas/prisma.md) — Prisma + adapter-pg / Prisma Migrate
- [gotchas/deployment.md](./gotchas/deployment.md) — デプロイ / ビルド / Git / Worktree / Tailwind+Turbopack HMR
- [gotchas/claude-code.md](./gotchas/claude-code.md) — Claude Code 設定 / shadcn/ui / Import Alias / Route Handler
- [gotchas/prohibitions.md](./gotchas/prohibitions.md) — フレームワーク固有 / セキュリティ / 外部 API / レートリミッター
```

- [ ] **Step 3: 移動後検証 + Commit**

```bash
wc -l .claude/rules/gotchas/*.md
# Expected: 元 519 + frontmatter overhead 7*7 ≈ 568 行

git add .claude/rules/gotchas.md .claude/rules/gotchas/
git commit -m "$(cat <<'EOF'
refactor(rules): split gotchas.md into barrel-index + 7 sub-files

gotchas.md (519 行 / 27 sections / 156KB の cross-cutting catch-all) を
barrel-index pattern で分割:

- gotchas/auth-routing.md — Admin Gate / Multiple Root Layouts / ナビ
- gotchas/domain.md — 料金 / ドメイン予約 / ホームページ Section
- gotchas/ui.md — 公開フォーム / レスポンシブ / Page-First / サイドバー
- gotchas/prisma.md — Prisma adapter-pg / Migrate
- gotchas/deployment.md — デプロイ / ビルド / Git Worktree / Tailwind HMR
- gotchas/claude-code.md — Claude Code 設定 / shadcn / Import Alias
- gotchas/prohibitions.md — FW固有 / セキュリティ / 外部 API / RL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8: CLAUDE.md / docs 参照更新

**Files:**

- Modify: `CLAUDE.md`（barrel split 後の参照を反映）
- Read-only: `docs/**/*.md`（drift 検出のみ）

**目的:** Phase 5-7 で 3 大 rule file が barrel になったため、CLAUDE.md / `docs/**` 内の参照が drift していないか確認。

- [ ] **Step 1: CLAUDE.md 内の参照を grep**

```bash
grep -n "server-actions.md\|frontend/accessibility.md\|gotchas.md" CLAUDE.md
```

CLAUDE.md は `→ <rule>.md` 形式で参照しているため、barrel pointer がそのまま機能（autoload 連鎖で sub-file もロードされる）。**修正は drift 検出時のみ**。

- [ ] **Step 2: docs/** 内の参照を grep\*\*

```bash
grep -rn "server-actions.md\|frontend/accessibility.md\|gotchas.md" docs/ --include="*.md"
```

ADR や guides で `→ .claude/rules/<file>.md` を指している箇所が barrel か sub-file かを確認。barrel pointer は OK だが、特定 section を指している場合は sub-file path に更新。

- [ ] **Step 3: 修正適用（drift 検出時のみ）**

```bash
# 例:
grep -rln "\.claude/rules/server-actions\.md#cache" CLAUDE.md docs/
# → ヒットしたら .claude/rules/server-actions/use-cache.md に更新
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "$(cat <<'EOF'
docs(claude): update rule references for barrel-index splits

Phase 5-7 で server-actions.md / frontend/accessibility.md / gotchas.md を
barrel + sub-file 構造に分割した結果、CLAUDE.md / docs/** の参照を更新。

barrel pointer (`→ <rule>.md`) はそのまま autoload 連鎖で sub-file もロード
されるため修正不要。section anchor (`#xxx`) を指している箇所のみ sub-file
path に置換。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 9: 完了報告

- [ ] **Step 1: 全 phase の commit 確認**

```bash
git log --oneline -10
```

Expected output（順序は phase 番号通り）:

```
<sha9>  docs(claude): update rule references for barrel-index splits         ← Phase 8
<sha8>  refactor(rules): split gotchas.md into barrel-index + 7 sub-files     ← Phase 7
<sha7>  refactor(rules): split frontend/accessibility.md into barrel-index... ← Phase 6
<sha6>  refactor(rules): split server-actions.md into barrel-index...         ← Phase 5
<sha5>  refactor(rules): resolve ADR drift in rule docs                       ← Phase 3 (drift 検出時のみ)
<sha4>  refactor(rules): align paths frontmatter with current repo structure  ← Phase 2 (drift 検出時のみ)
<sha3>  refactor(rules): consolidate deprecated notes per clean-break...      ← Phase 1
b4b96773 docs(claude): codify MEMORY.md re-read rule before large plan creation ← base
```

- [ ] **Step 2: 行数 / ファイル数 delta 確認**

```bash
echo "=== Phase 1-7 完了後 ==="
find .claude/rules -type f -name "*.md" | wc -l    # 49 → 49 + 17 sub-file = 66 (期待値)
find .claude/rules -type f -name "*.md" | xargs wc -l | tail -1
```

- [ ] **Step 3: Memory 更新**

`~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_clean-break-refactor-handoff.md` に「✅ C1 完了 (commit `<最後の sha>`)」追記。

- [ ] **Step 4: 完了サマリーを user に報告**

```
C1 完了 (commit <sha>):
- 7 commit / N 行整理
- 3 barrel split (server-actions / accessibility / gotchas)
- 17 新 sub-file 追加
- deprecated marker 整理（X → Y 件）

次セッション推奨: C2 (.claude/agents/** cleanup) または P19 Phase 1
```

---

## Self-Review Checklist

このセクションは plan 提出前の self-review 結果。

**1. Spec coverage:**

| Spec 項目（handoff より）               | 対応 task                       |
| --------------------------------------- | ------------------------------- |
| 30+ ファイル監査                        | Phase 1-3（全 49 ファイル走査） |
| deprecated パターン削除 / 整理          | Phase 1（14 ファイル）          |
| frontmatter `paths:` 整合性             | Phase 2                         |
| barrel-index 構造を他 large rule に展開 | Phase 5-7（3 件 split）         |
| `adr-drift-audit` skill 活用            | Phase 3                         |

**Gap:** 優先度 B/C の barrel split（zod / prisma / auth / tailwind / forms / test-quality / seo / error-handling）は本 plan 範囲外。次セッション以降で必要時に追加 plan。

**2. Placeholder scan:** TBD / TODO / 「fill in details」なし ✓

**3. Type consistency:** ファイルパス / section 名は ground truth grep で確定済み ✓

**4. Realism check:**

- Phase 1: 14 ファイル × 平均 2.5 occurrence = ~36 個の Edit、~30-45 分
- Phase 2-3: drift なしなら no-op、~15 分
- Phase 5-7: 3 split × ~25 分 = ~75 分
- Phase 8-9: ~10 分
- **合計目安**: 2-3 時間（subagent-driven で並列化なし、sequential 実行前提）

**5. Worktree 判断:**

- 本 plan は `.claude/rules/**` のみ編集（src/ には触れない）
- main で incremental commit すれば rollback 容易
- worktree 不要、main で実行で OK

---

## 起動方法

このファイル保存後、controller（main session）で以下を起動:

**推奨: subagent-driven-development**

```
docs/superpowers/plans/2026-04-27-rules-cleanup.md を subagent-driven-development で実行してください。
各 phase を 1 dispatch で実行し、phase 間で git log + wc -l 検証してください。
全 phase 完了後 memory に ✅ C1 完了を追記してください。
```

**代替: executing-plans (inline)**

```
docs/superpowers/plans/2026-04-27-rules-cleanup.md を executing-plans skill で
inline 実行してください。Phase 1 → 4 まで実行後 user に確認、その後 Phase 5-9 を実行。
```
