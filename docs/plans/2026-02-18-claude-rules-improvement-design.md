# Claude Rules 改善設計ドキュメント

> 設計日: 2026-02-18
> ステータス: 承認済み → 実装計画作成待ち

## 目的

`.claude/rules/` ディレクトリのファイルを Claude Code 公式ベストプラクティスに準拠させる。

1. **構造改善**: `paths:` フロントマターで条件付きロードに変換 → コンテキスト効率化
2. **コンテンツ改善**: 詳細実装例を `docs/reference/claude-rules/` に移動 → ルールを簡潔・指示的に

## 現状分析

### always-loaded ファイル（問題）

現在 13ファイル ~4,451行 が全てのリクエストで常時ロードされている:

| ファイル | 行数 | 問題 |
|---------|------|------|
| `react-patterns.md` | 792 | テスト・DB作業時も常時ロード |
| `bun-patterns.md` | 656 | フロントエンド・DB作業時も常時ロード |
| `server-actions.md` | 480 | Dockerfileや設定ファイル編集時も常時ロード |
| `zod-patterns.md` | 419 | 同上 |
| `error-handling.md` | 392 | ✓ 常時ロード妥当 |
| `nuqs-patterns.md` | 390 | 常時ロード不要 |
| `prisma-patterns.md` | 381 | 常時ロード不要 |
| `test-quality.md` | 358 | テスト以外では不要 |
| `auth-patterns.md` | 358 | 常時ロード不要 |
| `tailwind-patterns.md` | 336 | 常時ロード不要 |
| `type-safety.md` | 289 | ✓ 常時ロード妥当 |
| `implementation-quality.md` | 197 | ✓ 常時ロード妥当 |
| `server-only-patterns.md` | 95 | ✓ 常時ロード妥当 |

### 確立済みプロジェクトパターン

`docs/reference/claude-rules/gsap-reference.md` など6ファイルが既存。
ルールファイルは以下のリンクで参照:

```markdown
> **詳細リファレンス**: `docs/reference/claude-rules/gsap-reference.md`
```

このパターンを `react-patterns.md` / `bun-patterns.md` に適用する。

---

## 設計

### Section 1: paths: 追加（9ファイル）

以下9ファイルに YAML フロントマターを追加する。

#### `react-patterns.md`
```yaml
---
paths:
  - src/**
---
```

#### `server-actions.md`
```yaml
---
paths:
  - src/app/**
  - src/shared/**
---
```

#### `zod-patterns.md`
```yaml
---
paths:
  - src/**
---
```

#### `nuqs-patterns.md`
```yaml
---
paths:
  - src/app/**
---
```

#### `prisma-patterns.md`
```yaml
---
paths:
  - src/**
---
```

#### `bun-patterns.md`
```yaml
---
paths:
  - __tests__/**
  - e2e/**
---
```

#### `test-quality.md`
```yaml
---
paths:
  - __tests__/**
  - e2e/**
---
```

#### `auth-patterns.md`
```yaml
---
paths:
  - src/app/**
  - src/shared/**
---
```

#### `tailwind-patterns.md`
```yaml
---
paths:
  - src/**
---
```

**結果**: 常時ロード 4ファイル ~973行（type-safety, implementation-quality, error-handling, server-only-patterns）

---

### Section 2: コンテンツ改善

#### 2-A: react-patterns.md 792行 → ~350行

**新規作成**: `docs/reference/claude-rules/react-api-reference.md`

移動内容（ルール指示として不要な詳細実装例）:
- React 19.2 新API の詳細コード例:
  - `useOptimistic`（楽観的UI実装コード）
  - `useActionState`（フォーム状態管理詳細）
  - `useFormStatus`（フォーム送信状態詳細）
  - `use()`（Promise/Context読み取り詳細）
  - `ViewTransition`（Shared Element実装例）
  - `FragmentRef`（FragmentInstance API詳細）
  - `Activity`（KeepAlive実装例）
  - Resource Preloading（prefetchDNS/preconnect/preload/preinit詳細）
- React Compiler 制限事項の詳細（try/catch パターン、クラスコンポーネント）
- Server Components / Server Actions のコード例（`server-actions.md` に重複あり）

**残す内容**（必須ルール・禁止事項）:
- forwardRef 廃止（breaking change、必須対応）
- React Compiler 自動メモ化（useCallback/useMemo/memo 禁止ルール）
- useCallback + ref.current の衝突パターン（lint エラーの原因）
- Rules of React 4箇条
- watch() 禁止 → useWatch()
- 禁止事項テーブル
- `> **詳細リファレンス**: docs/reference/claude-rules/react-api-reference.md` 追加

#### 2-B: bun-patterns.md 656行 → ~280行

**新規作成**: `docs/reference/claude-rules/bun-test-reference.md`

移動内容:
- モック関数の詳細 API リスト（`mockResolvedValueOnce`, `mockImplementationOnce` 等）
- Prisma モックの詳細実装例（createMockPrismaClient の内部実装）
- Auth モックの詳細実装例（createMockUser, setMockSession の内部実装）
- Next.js モックの詳細実装例（mock.module パターン全体）
- グローバル API モックパターン（fetch, console の詳細）
- Bun ランタイム固有機能（Bun.file, Bun.write, Bun.env）

**残す内容**（必須ルール・禁止事項）:
- 基本 import パターン（`vi.*` 禁止）
- `mock.module()` の呼び出し順序（TDZ 回避）
- `Symbol.dispose` + `using` キーワード
- 環境変数モック基本パターン（beforeAll/afterAll パターン）
- Server Actions テスト基本構造（3ステップ）
- Vitest API 禁止テーブル
- ファイル配置・命名規則
- コマンド一覧
- `> **詳細リファレンス**: docs/reference/claude-rules/bun-test-reference.md` 追加

---

### Section 3: CLAUDE.md

現行バージョン（160行）は正確・適切。**変更なし**。

---

## 実装順序

1. `react-patterns.md` と `bun-patterns.md` のコンテンツ改善（詳細リファレンス分離）
2. 残り9ファイルへの `paths:` フロントマター追加
3. `docs/reference/codex-rules/` のミラーファイル更新（変更したファイルのみ）

---

## 期待効果

| 指標 | 現在 | 改善後 |
|------|------|--------|
| 常時ロード行数 | 4,451行 | 973行 |
| コンテキスト削減率 | — | **78% 削減** |
| react-patterns.md | 792行 | ~350行 |
| bun-patterns.md | 656行 | ~280行 |
