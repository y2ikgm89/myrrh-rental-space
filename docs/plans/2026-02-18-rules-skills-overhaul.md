# Rules / Skills / CLAUDE.md 全面刷新 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** `.claude/rules/`（22ファイル）・`.claude/skills/`・`.claude/agents/`・`CLAUDE.md`・`AGENTS.md`・`docs/reference/codex-rules/` を、context7 + WebSearch による公式ドキュメントリサーチに基づいて最高品質に全面再構築する。

**Architecture:** 各タスクがそれぞれのドメイン（ライブラリ・パターン）を context7 でリサーチし、既存ファイルを読んだ上で完全に書き直す。タスクは独立しており、フェーズ順に実行する。研究フェーズの知見は後続タスクの入力になる。

**Tech Stack:** Next.js 16, React 19.2, TypeScript 6.0-beta, Bun 1.3, Prisma 7, Zod 4, Better Auth 1.4, Lexical 0.40, Tailwind CSS 4, GSAP 3.14, nuqs 2, PixiJS 8, Three.js 0.182

**Design Doc:** `docs/plans/2026-02-18-rules-skills-overhaul-design.md`

---

## 前提・制約

- **プロジェクトルート**: `G:/workspace/work/website/customer/myrrh-rental-space`
- **破壊的変更OK**: 後方互換性ハック禁止。不要コードは完全削除。
- **研究必須**: 推測で書かない。context7 または WebSearch で公式確認してから書く。
- **OK/NG例必須**: すべてのルールファイルにコードサンプル（OK/NG両方）を含める。
- **実際のパス**: プロジェクト内の実際のファイルパスを正確に記載する。
- **言語**: ファイル本文は日本語で書く（コードは英語）。

---

## Phase 1: Core Rules 更新（最重要5ファイル）

### Task 1: type-safety.md 完全刷新

**Files:**

- Read: `.claude/rules/type-safety.md`（現行版）
- Modify: `.claude/rules/type-safety.md`
- Sync: `.claude/rules/type-safety.md`

**Context（サブエージェントへ）:**
このプロジェクトは TypeScript 6.0-beta を使用。`noUncheckedIndexedAccess: true`、`strict: true` が有効。
型アサーション（`as`）は原則禁止。許可例外は4つのみ:

1. DOM event target（`event.target as HTMLElement`）
2. Prisma JSON型（`{} as Prisma.InputJsonObject`）
3. SectionConfig union widening（`result.data as SectionConfig` — コメント必須）
4. TS 6.0 条件型（`as unknown as ActionSuccess<T>`）

**Step 1: context7 でリサーチ**

```
context7: /microsoft/typescript
Query: "TypeScript 6.0 noUncheckedIndexedAccess strict mode type safety patterns 2025"
```

また以下も確認:

```
WebSearch: "TypeScript 6.0 satisfies operator type guards best practices 2025 2026"
```

**Step 2: 現行ファイルを読む**

```bash
cat .claude/rules/type-safety.md
```

**Step 3: ファイルを書き直す**

以下の構成で `.claude/rules/type-safety.md` を書き直す:

```markdown
# 型安全ルール

> TypeScript 6.0-beta / noUncheckedIndexedAccess 有効

## noUncheckedIndexedAccess（有効）

[TypeScript 6.0 の最新パターン — 研究結果を反映]

### 配列アクセス

[OK/NGコード例]

### Record型アクセス

[OK/NGコード例]

### ループパターン

[OK/NGコード例]

## 型アサーション（`as`）禁止

### 許可例外（4種のみ）

[各例外とその理由、コードサンプル]

### 代替手段

[keysOf / isValid* / satisfies の使い方]

## satisfies キーワード

[使いどころとコード例]

## 型ガードパターン

[Set-based / isinstance / Zodベース型ガード]

## ユーティリティ

[keysOf, isValid*, getValid* — ファイルパス付き]
```

**Step 4: .claude/rules/type-safety.md に同内容をコピー**

```bash
cp .claude/rules/type-safety.md .claude/rules/type-safety.md
```

**Step 5: 確認**

ファイルが存在し、内容が適切か確認。

---

### Task 2: react-patterns.md 完全刷新

**Files:**

- Read: `.claude/rules/react-patterns.md`
- Modify: `.claude/rules/react-patterns.md`
- Sync: `.claude/rules/react-patterns.md`

**Context（サブエージェントへ）:**
React 19.2.4 + React Compiler 1.0 を使用。`forwardRef` 禁止（React 19 では ref は通常のprop）。
`useCallback`/`useMemo` は React Compiler が自動化するため原則不要。
React Hook Form: `watch()` 禁止 → `useWatch()` 使用。

**Step 1: context7 でリサーチ**

```
context7: /facebook/react
Query: "React 19 useEffectEvent Activity component ref prop forwardRef removal React Compiler 2025"
```

```
WebSearch: "React 19.2 new features useEffectEvent useOptimistic server actions 2025 2026"
```

**Step 2: 現行ファイルを読む**

**Step 3: 以下の構成で書き直す**

```markdown
# React パターンルール

> React 19.2 / React Compiler 1.0 対応

## React 19 の破壊的変更

### forwardRef 廃止（必須対応）

[OK/NGコード例]

### ref は通常のprop

[コード例]

## React Compiler 互換ルール

### useCallback / useMemo（原則不要）

[何をすべきか / すべきでないか]

### useCallback + ref.current の衝突

[react-hooks/preserve-manual-memoization エラー回避パターン]

### React Hook Form

[watch() 禁止 → useWatch() — コード例]

## React 19.2 新機能

### useEffectEvent

[説明 + コード例 + ルール]

### Activity コンポーネント

[説明 + 使いどころ]

### useOptimistic

[楽観的更新パターン]

## Server Components / Server Actions

[パターンと制約]
```

**Step 4: .claude/rules/react-patterns.md に同期**

---

### Task 3: server-actions.md 完全刷新

**Files:**

- Read: `.claude/rules/server-actions.md`
- Modify: `.claude/rules/server-actions.md`
- Sync: `.claude/rules/server-actions.md`

**Context（サブエージェントへ）:**
Next.js 16.1.6 の `'use cache'` / `cacheLife` / `cacheTag` / `updateTag` が主要API。
`revalidateTag` は遅延OK の場合のみ。`updateTag` は Server Actions 内のみ使用可。
キャッシュタグは必ず `CACHE_TAGS.*` 定数使用（`@/shared/lib/constants/cache.ts`）。

**Step 1: context7 でリサーチ**

```
context7: /vercel/next.js
Query: "Next.js 16 use cache cacheLife cacheTag updateTag server actions PPR 2025"
```

```
WebSearch: "Next.js 16 cacheComponents use cache directive best practices 2025 2026"
```

**Step 2: 現行ファイルを読む**

**Step 3: 以下の構成で書き直す**

```markdown
# Server Actions ルール

> Next.js 16 / PPR / 'use cache' 対応

## 'use cache' パターン

### 基本キャッシュ（関数レベル）

### cacheTag でタグ付け

### cacheLife プリセット一覧

### カスタム有効期限

## キャッシュ無効化

### updateTag（即時失効 — read-your-own-writes）

### revalidateTag（非同期再検証）

### updateTag vs revalidateTag 比較表

## Server Action 実装パターン

### 基本構造（認証 → バリデーション → DB操作 → キャッシュ更新）

### ActionResult 型

### withPermission ラッパー

## 公開データ取得（'use cache' + safeFetch）

## キャッシュタグ命名規則

## 禁止事項
```

**Step 4: .claude/rules/server-actions.md に同期**

---

### Task 4: prisma-patterns.md 完全刷新

**Files:**

- Read: `.claude/rules/prisma-patterns.md`
- Modify: `.claude/rules/prisma-patterns.md`
- Sync: `.claude/rules/prisma-patterns.md`

**Context（サブエージェントへ）:**
Prisma 7.4.0 / WASM エンジン（`engineType = "client"` + `runtime = "bun"`）。
mapped enums: TypeScript側で `as const` オブジェクト生成。文字列リテラル禁止。
型ガードは `@/shared/lib/validations/enums.ts` に集約（`isValid*` / `getValid*`）。
`$extends` で全 Decimal フィールドを自動 `number` 変換済み。
React 19 シリアライゼーション: `toPlainObject()` / `toPlainArray()` 必須。
Lexical JSON Primary: 7モデルが `contentJson Json?` + `contentHtml String @map("content")` 構成。

**Step 1: context7 でリサーチ**

```
context7: /prisma/prisma
Query: "Prisma 7 client engine WASM mapped enums $extends JSON type safety 2025"
```

**Step 2: 現行ファイルを読む（重要: enums.ts の実際のパターンも確認）**

```bash
head -50 src/shared/lib/validations/enums.ts
head -30 src/shared/lib/prisma.ts
```

**Step 3: 以下の構成で書き直す**

```markdown
# Prisma パターンルール

> Prisma 7.4 / WASM エンジン / PostgreSQL

## Enum パターン（Prisma 7 mapped enums）

### Prisma enum 定数を使用（文字列リテラル禁止）

[OK/NGコード例]

### 型ガードは enums.ts に集約（Single Source of Truth）

[isValid* / getValid* の使い方]

### z.enum() との統合

[Zod 4 + Prisma enum]

### SelectItem 値にenum定数使用

## JSON フィールドの型安全化

### Zodスキーマによるランタイムバリデーション

### 複雑なJSON（parseBusinessHours 等）

### React 19 シリアライゼーション（toPlainObject）

## Decimal 自動変換（$extends）

## Lexical JSON Primary パターン

## クエリパターン

### Select句で型を限定

### Include vs Select

### N+1 クエリ禁止

## トランザクション

## 禁止事項
```

**Step 4: .claude/rules/prisma-patterns.md に同期**

---

### Task 5: zod-patterns.md 完全刷新

**Files:**

- Read: `.claude/rules/zod-patterns.md`
- Modify: `.claude/rules/zod-patterns.md`
- Sync: `.claude/rules/zod-patterns.md`

**Context（サブエージェントへ）:**
Zod 4.3.6 使用。`z.nativeEnum()` 禁止 → `z.enum(PrismaEnum)` 使用。
エラーメッセージは `{ error: 'msg' }` パラメータ（`message:` は非推奨）。
`z.flattenError(validated.error)` で ActionResult に変換。
Prisma enum の型ガードは `enums.ts` から import（ローカル定義禁止）。

**Step 1: context7 でリサーチ**

```
context7: /colinhacks/zod
Query: "Zod 4 z.enum nativeEnum migration error parameter safeParse flattenError 2025"
```

**Step 2: 現行ファイルを読む**

**Step 3: 以下の構成で書き直す**

```markdown
# Zod パターンルール

> Zod 4対応

## 基本パターン

### エラーメッセージ（error: パラメータ）

[OK/NGコード例]

### スキーマ定義

### 複合スキーマ

### Server Actions での使用

## Prisma Enum バリデーション

### z.enum() で Prisma enum を使用（nativeEnum 禁止）

### デフォルト値もenum定数で

## 共通スキーマの再利用

### SEOフィールド

### URLバリデーション

## 型ガードパターン

### Prisma Enum型ガード（enums.ts から import）

### ローカルEnum型ガード（Prisma enumが存在しない場合のみ）

## React Hook Form連携

## 禁止事項
```

**Step 4: .claude/rules/zod-patterns.md に同期**

---

## Phase 2: 新規ルール作成（3ファイル）

### Task 6: bun-patterns.md 新規作成

**Files:**

- Create: `.claude/rules/bun-patterns.md`
- Create: `.claude/rules/bun-patterns.md`

**Context（サブエージェントへ）:**
このプロジェクトは Bun 1.3.x をランタイム兼テストフレームワークとして使用。
Vitest は不使用。`import { test, expect, describe, mock, beforeAll, afterAll } from 'bun:test'`。
`mock.module()` でモジュールモック。`mockReset()` でリセット。
`vi.*` API は完全禁止。
テストファイル: `__tests__/unit/`, `__tests__/integration/`
セットアップ: `__tests__/setup.ts`、モック: `__tests__/mocks/`

**Step 1: context7 でリサーチ**

```
context7: /oven-sh/bun
Query: "Bun test mock module beforeAll afterAll describe expect 2025"
```

```
WebSearch: "Bun 1.3 test framework API mockReset mock.module best practices 2025 2026"
```

**Step 2: 実際のテストファイルを確認**

```bash
head -50 __tests__/mocks/auth.ts
head -50 __tests__/mocks/prisma.ts
head -30 __tests__/setup.ts
```

**Step 3: 以下の構成で新規作成**

````markdown
# Bun パターンルール

> Bun 1.3.x / Bun Test ランタイム対応

## テストフレームワーク（Bun Test）

### 基本インポート

```typescript
import {
  test,
  expect,
  describe,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
```
````

### モック

```typescript
// 関数モック
const mockFn = mock(() => "value");

// モジュールモック
mock.module("@/shared/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// リセット（afterEach で）
mockFn.mockReset();
```

### セッションモック（Better Auth）

[プロジェクト固有パターン — __tests__/mocks/auth.ts]

### Prisma モック

[プロジェクト固有パターン — __tests__/mocks/prisma.ts]

## Vitest API 禁止一覧

[vi.fn(), vi.mock(), vi.restoreAllMocks() 等 → Bun代替]

## 環境変数のモック

[beforeAll/afterAll パターン]

## Server Actions テスト

[モック → アクション呼び出し → アサーション]

## Bun ランタイム固有機能

### Bun.file / Bun.write

### Bun.env

## ファイル配置と命名規則

## コマンド

```bash
bun run test              # 全テスト
bun run test:unit         # 単体テスト
bun run test:integration  # 統合テスト
bun run test:watch        # 監視モード
```

````

---

### Task 7: error-handling.md 新規作成

**Files:**
- Create: `.claude/rules/error-handling.md`
- Create: `.claude/rules/error-handling.md`

**Context（サブエージェントへ）:**
プロジェクトには `src/shared/lib/errors/` に `logger.ts` / `safeFetch` が存在する。
`createSuccess` / `createFailure` は `@/shared/types/server-actions.ts` に定義。
`withPermission` ラッパーが Server Actions の認証+エラー処理を統一。
エラー握りつぶし禁止。console.log のみ禁止。必ず構造化ログ + ActionResult を返す。

**Step 1: 実際のファイルを確認**

```bash
cat src/shared/lib/errors/logger.ts
cat src/shared/types/server-actions.ts
head -30 src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts
````

**Step 2: 以下の構成で新規作成**

```markdown
# エラーハンドリングルール

## ActionResult 型

### createSuccess / createFailure

[コード例]

### ActionResult の型定義

[型定義とNG/OKパターン]

## Server Actions エラーパターン

### 認証エラー

### バリデーションエラー

### データベースエラー

### ビジネスロジックエラー

## safeFetch パターン

### 公開データ取得での使用

### ErrorCategory / ErrorSeverity

## logger の使用

### 構造化ログ

### console.log 禁止

## withPermission ラッパー

## エラー握りつぶし禁止

## ファイル配置
```

---

### Task 8: accessibility.md 新規作成

**Files:**

- Create: `.claude/rules/accessibility.md`
- Create: `.claude/rules/frontend/accessibility.md`

**Context（サブエージェントへ）:**
公開ページはアニメーションが多い（GSAP / Three.js / PixiJS）。
`prefers-reduced-motion` 対応は `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` で実施。
フォーカス管理はキーボードナビゲーションに必須。
管理画面の Lexical エディタも a11y 考慮が必要。

**Step 1: WebSearch でリサーチ**

```
WebSearch: "WCAG 2.2 Next.js React accessibility aria patterns 2025 2026"
WebSearch: "prefers-reduced-motion GSAP accessibility best practices 2025"
```

**Step 2: 以下の構成で新規作成**

````markdown
# アクセシビリティ（a11y）ルール

> WCAG 2.2 / React 19 / GSAP prefers-reduced-motion 対応

## セマンティックHTML

### 見出し階層

### ランドマーク

### ボタン vs リンク

## aria-\* 属性

### aria-label / aria-labelledby

### aria-describedby

### aria-expanded / aria-controls（アコーディオン）

### aria-live（動的コンテンツ）

## フォーカス管理

### フォーカストラップ（モーダル）

### フォーカスリング（キーボード操作）

## prefers-reduced-motion

### GSAP matchMedia パターン

```typescript
// OK: 必須パターン
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // アニメーション
    });
    // reduced-motion 時のフォールバック
    mm.add("(prefers-reduced-motion: reduce)", () => {
      // 静的表示
    });
  },
  { scope: containerRef },
);
```
````

### Three.js / PixiJS のフォールバック

## フォームa11y

### label と input の関連付け

### エラーメッセージの aria-describedby

### 必須フィールドの aria-required

## 画像 alt テキスト

## キーボードナビゲーション

```

---

## Phase 3: 残りルール更新（12ファイル）

### Task 9: auth-patterns.md 完全刷新

**Files:**
- Modify: `.claude/rules/auth-patterns.md`
- Sync: `.claude/rules/auth-patterns.md`

**Context（サブエージェントへ）:**
Better Auth 1.4.18 / RBAC 使用。権限階層: `SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER`。
`nextCookies` プラグイン必須（配列の最後に配置）。
Server Components: `verifySession()` / `verifyAdminSession()`（cache() でメモ化）。
Server Actions: `getSession()` / `getSessionUser()`（cache() 不使用）。
`checkPermission('resource', 'action')` が推奨パターン。

**Step 1: context7 でリサーチ**

```

context7: /better-auth/better-auth
Query: "Better Auth 1.4 RBAC nextCookies server actions Next.js session patterns 2025"

````

**Step 2: 現行ファイルを読む + 実際の実装確認**

```bash
head -50 src/shared/lib/auth.ts
head -50 src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts
````

**Step 3: 以下の構成で書き直す**

```markdown
# 認証パターンルール

> Better Auth 1.4 / RBAC 対応

## Better Auth 公式パターン

### nextCookies プラグイン（必須）

### Server Components でのセッション取得

### Server Actions でのセッション取得

## 権限階層

| ロール | 権限 |

## Server Action の認証パターン

### 基本認証（checkAdminAuth）

### 権限チェック（checkPermission）

### withPermission ラッパー（推奨）

### リソースアクセスチェック（EDITOR用）

## セッション取得パターン

### Server Components（cache()でメモ化）

### Server Actions（cache()不使用）

### オプショナル認証

## 型安全なRole取得

## 監査ログ

## 禁止事項
```

**Step 4: .claude/rules/auth-patterns.md に同期**

---

### Task 10: tailwind-patterns.md 完全刷新

**Files:**

- Modify: `.claude/rules/tailwind-patterns.md`
- Sync: `.claude/rules/tailwind-patterns.md`

**Context（サブエージェントへ）:**
Tailwind CSS 4.1.18 / CSS-first 設定。`tailwind.config.js` は存在しない。
`@theme` ディレクティブでカラー・フォント・アニメーション定義。OKLCH 形式必須。
`gray-*` / `blue-*` 等のデフォルトカラークラス禁止。セマンティックトークン使用。
admin.css と public.css が完全分離（globals.css は存在しない）。

**Step 1: context7 でリサーチ**

```
context7: /tailwindlabs/tailwindcss
Query: "Tailwind CSS 4 @theme OKLCH CSS-first configuration @plugin typography 2025"
```

**Step 2: 実際のCSSファイルを確認**

```bash
head -80 src/app/(admin)/_styles/admin.css
head -80 src/app/(public)/_styles/public.css
```

**Step 3: 以下の構成で書き直す（セマンティックカラーマッピングテーブルを含む）**

---

### Task 11: gsap-patterns.md 完全刷新

**Files:**

- Modify: `.claude/rules/gsap-patterns.md`
- Sync: `.claude/rules/frontend/gsap-patterns.md`

**Context（サブエージェントへ）:**
GSAP 3.14.2 / @gsap/react 2.1 / ScrollTrigger / Lenis 1.3.17 使用。
`useGSAP()` フックを使用（生の `useEffect` + `gsap.context()` は禁止）。
パターンA: `gsap.matchMedia()` 内でアニメーション（prefers-reduced-motion対応）。
パターンB: `gsap.matchMedia()` + レスポンシブブレークポイント。
パターンC: イベントハンドラでの `useCallback` 禁止（`ref.current` 問題）。
Lenis: `useLenis()` フック使用。

**Step 1: context7 でリサーチ**

```
context7: /gsap-community/gsap
Query: "GSAP 3.14 useGSAP ScrollTrigger matchMedia React 19 patterns 2025"
```

**Step 2: 既存の実際のアニメーションファイルを確認**

```bash
ls src/app/(public)/_shared/components/effects/
ls src/app/(public)/_shared/components/animations/
```

**Step 3: 以下の構成で書き直す**

```markdown
# GSAP パターンルール

> GSAP 3.14 / @gsap/react 2.1 / ScrollTrigger / Lenis 1.3.17 対応

## 基本ルール

### useGSAP() 使用（useEffect 禁止）

### scope 参照の必須化

## パターン A: matchMedia + prefers-reduced-motion（標準）

### パターン B: matchMedia + レスポンシブブレークポイント

### パターン C: イベントハンドラ（useCallback 禁止）

## ScrollTrigger パターン

### 基本スクロールアニメーション

### ピン留め

### スクラブ

## アニメーション定数

### DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX

## Lenis スムーススクロール

### useLenis() フック

## 禁止事項
```

---

### Task 12: lexical-patterns.md 更新確認・精度向上

**Files:**

- Read: `.claude/rules/lexical-patterns.md`
- Modify: `.claude/rules/lexical-patterns.md`（必要な箇所のみ）
- Sync: `docs/reference/codex-rules/lexical-patterns.md`

**Context（サブエージェントへ）:**
Lexical 0.40.0 / NodeState API 使用。
`$config` + `createState` + `$getState`/`$setState`/`$getStateChange` が新API。
禁止: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `SerializedXxxNode` interface, `$applyNodeReplacement`, `__property`, `getWritable()`, `getLatest()`, `new XxxNode()` constructor。
`mergeRegister` は本体に移動（`@lexical/utils` から `lexical` 本体へ）。

**Step 1: context7 でリサーチ**

```
context7: /facebook/lexical
Query: "Lexical 0.40 NodeState $config createState $getState $setState mergeRegister 2025"
```

**Step 2: 現行ファイルを読む（長いので最初の100行から）**

```bash
head -150 .claude/rules/lexical-patterns.md
```

**Step 3: 最新 API と整合していない箇所を特定して更新**

主な確認ポイント:

- `mergeRegister` の import が `lexical` 本体になっているか
- 禁止リストが最新か
- `$getStateChange` パターンが記載されているか

---

### Task 13: seo-patterns.md 完全刷新

**Files:**

- Modify: `.claude/rules/seo-patterns.md`
- Sync: `.claude/rules/frontend/seo-patterns.md`

**Context（サブエージェントへ）:**
JSON-LD `@graph` パターン（LocalBusiness + WebSite を1つのscriptタグに統合）。
`BreadcrumbList` / `Article` / `NewsArticle` は個別ページに配置。
NAP一貫性: DB（Settings）から一元取得。ハードコード禁止。
`generateArticleMetadata()` / `generatePageMetadata()` の使い分け。
`AggregateRating` 使用禁止（Google ポリシー）。

**Step 1: WebSearch でリサーチ**

```
WebSearch: "Google structured data LocalBusiness JSON-LD @graph 2025 2026 best practices"
WebSearch: "Next.js 16 SEO metadata generateMetadata openGraph 2025"
```

**Step 2: 実際のファイルを確認**

```bash
cat src/app/(public)/_shared/lib/seo/json-ld-config.ts | head -100
cat src/app/(public)/_shared/lib/page-metadata.ts | head -50
```

**Step 3: 構成を保ちながら、Google公式パターンに合わせて更新**

---

### Task 14: nuqs-patterns.md 更新

**Files:**

- Modify: `.claude/rules/nuqs-patterns.md`
- Sync: `.claude/rules/nuqs-patterns.md`

**Context（サブエージェントへ）:**
nuqs 2.8.8 使用。`createSearchParamsCache` / `parseAs*` / Zod 4 統合。
`useQueryState` / `useQueryStates` がクライアント向け。
`searchParamsCache.parse(searchParams)` がサーバー向け。
プロジェクト標準パーサーは `@/shared/lib/validations/params.ts` にある。

**Step 1: context7 でリサーチ**

```
context7: /47ng/nuqs
Query: "nuqs 2 createSearchParamsCache server components Zod 4 integration Next.js 16 2025"
```

**Step 2: 実際のファイルを確認**

```bash
cat src/shared/lib/validations/params.ts
```

---

### Task 15: threejs-patterns.md + pixijs-patterns.md + visual-effects-patterns.md 更新

**Files:**

- Modify: `.claude/rules/threejs-patterns.md`
- Modify: `.claude/rules/pixijs-patterns.md`
- Modify: `.claude/rules/visual-effects-patterns.md`
- Sync: `docs/reference/codex-rules/` の対応3ファイル

**Context（サブエージェントへ）:**
Three.js 0.182.0 + @react-three/fiber 9.5 + @react-three/drei 10.7 使用。
PixiJS 8.16.0 使用。
エフェクトレイヤー: L1 CSS → L2 GSAP → L3 Three.js → L4 PixiJS。
各レイヤーにフォールバック必須。GPU性能差対応。

**Step 1: context7 でリサーチ（並行）**

```
context7: /pmndrs/react-three-fiber
Query: "@react-three/fiber 9 hooks Canvas setup React 19 patterns 2025"

WebSearch: "PixiJS 8 React integration patterns 2025 2026"
```

**Step 2: 実際の実装を確認**

```bash
ls src/app/(public)/_shared/components/effects/
cat src/app/(public)/_shared/components/effects/pixi/PixiGrain.tsx | head -50
```

---

### Task 16: 残り5ファイル更新（implementation-quality, test-quality, deployment-patterns, turbopack-hmr, ui-ux-patterns）

**Files:**

- Modify: `.claude/rules/implementation-quality.md`
- Modify: `.claude/rules/test-quality.md`（Bun 最新に合わせて）
- Modify: `.claude/rules/deployment-patterns.md`
- Modify: `.claude/rules/turbopack-hmr.md`
- Modify: `.claude/rules/ui-ux-patterns.md`
- Sync: `docs/reference/codex-rules/` の対応5ファイル

**Context（サブエージェントへ）:**
`implementation-quality.md`: YAGNI / DRY / 形骸化実装禁止 / 後方互換ハック禁止。
`test-quality.md`: Bun Test ネイティブパターン。`vi.*` 完全禁止。E2E Playwright 対応。
`deployment-patterns.md`: Cloud Run Gen2 + Artifact Registry + Cloud Build。Prisma 7 WASM。3-stage Docker。
`turbopack-hmr.md`: `'use server'` → `'use client'` HMR 問題の対処。
`ui-ux-patterns.md`: ui-ux-pro-max スクリプト使用ガイド。

各ファイルを読んで、不正確・欠落・冗長な部分を特定し、改善する。

---

## Phase 4: CLAUDE.md / AGENTS.md / Agents / Skills 更新

### Task 17: CLAUDE.md 完全刷新

**Files:**

- Modify: `CLAUDE.md`

**Context（サブエージェントへ）:**
現行 CLAUDE.md の構造:

- 🔴 必須（禁止事項・検証コマンド・詳細ルール）
- 🟡 ワークフロー（superpowers自動発動・ツール使い分け）
- 🟢 プロジェクト情報（tech stack・構造・コマンド）

**更新事項:**

1. 条件付きロードに新規ルール追加: `bun-patterns.md`（`__tests__/**`）、`error-handling.md`（`src/**/*.ts`）、`accessibility.md`（`src/app/(public*)/**`）
2. tech stack の TypeScript を `6.0.0-beta` に明確化
3. Lexical 行に NodeState API 言及追加
4. コマンド表に `bun run test:unit` / `bun run test:integration` を追加
5. URL構造の `/spaces/[slug]` 追加（実装済みだが記載漏れ）

**Step 1: 現行ファイルを読む**

**Step 2: 上記更新事項を反映して書き直す**

---

### Task 18: AGENTS.md 完全刷新

**Files:**

- Modify: `AGENTS.md`

**Context（サブエージェントへ）:**
AGENTS.md は Codex（GPT Codex）向けの指示ファイル。Claude向けとは分離。
現行の構成: Project overview / Setup commands / Testing instructions / Additional instructions

**更新事項:**

1. Caching rules: `updateTag` は Server Actions 内のみ、`revalidateTag` は遅延OK の場合
2. Prisma パターン: WASM エンジン、mapped enums、型ガードは `enums.ts` から import
3. Better Auth パターン: `withPermission` ラッパーの使用
4. Bun テストパターン: `mock.module()` / `mockReset()` / Vitest API禁止
5. Lexical: NodeState API (`$config`, `createState`, `$getState`/`$setState`)
6. `docs/reference/` への参照を追加（detailは codex-rules/ から参照）

**Step 1: 現行ファイルを読む**

**Step 2: 更新事項を反映して書き直す**

---

### Task 19: agents/ 全4ファイル更新

**Files:**

- Modify: `.claude/agents/project-reviewer.md`
- Modify: `.claude/agents/verification.md`
- Modify: `.claude/agents/codebase-explorer.md`
- Modify: `.claude/agents/design-memory.md`

**Context（サブエージェントへ）:**

**project-reviewer.md 修正事項:**

- `TypeScript 5.9` → `TypeScript 6.0-beta` に修正（システムプロンプト内）
- 新規ルール（bun-patterns, error-handling, accessibility）のレビュー項目追加
- Bun テストパターン違反（`vi.*` 使用）のチェック追加

**verification.md 修正事項:**

- `bun run test:unit` / `bun run test:integration` コマンド追加
- Common project-specific patterns に Bun テストパターン追加

**codebase-explorer.md 修正事項:**

- 新規追加された公開ルート（/posts, /news, /about, /faq, /spaces, /terms, /privacy）を追加
- `src/shared/lib/validations/params.ts` / `src/shared/lib/bootstrap.ts` 等を記載

**design-memory.md 修正事項:**

- 現行確認（基本的に変更不要な可能性が高い）

---

### Task 20: skills/ 全スキルファイル更新

**Files:**

- Modify: `.claude/skills/frontend-design/SKILL.md`
- Modify: `.claude/skills/lexical-node/SKILL.md`（最小限の確認）
- Modify: `.claude/skills/lexical-plugin/SKILL.md`
- Modify: `.claude/skills/lexical-toolbar/SKILL.md`
- Modify: `.claude/skills/parallax-section/SKILL.md`
- Modify: `.claude/skills/ui-ux-pro-max/SKILL.md`

**Context（サブエージェントへ）:**

**frontend-design/SKILL.md:**

- Definition of Done に `bun run validate`（`bun run type-check` + `bun run lint` の両方）追加
- `accessibility.md` ルール参照を追加（a11y チェック）

**lexical-node/SKILL.md:**

- 最新 API 確認（`$getStateChange` が記載されているか確認）
- Definition of Done の確認

**lexical-plugin/SKILL.md + lexical-toolbar/SKILL.md:**

- 現行を読んで、Lexical 0.40 / `mergeRegister` が `lexical` 本体からの import になっているか確認

**parallax-section/SKILL.md:**

- GSAP 3.14 + `useGSAP` パターンに合っているか確認
- `prefers-reduced-motion` 対応が記載されているか確認

**ui-ux-pro-max/SKILL.md:**

- 現行確認・整合性チェック

---

## Phase 5: 最終同期とコミット

### Task 21: docs/reference/codex-rules/ 完全同期確認

**Files:**

- Read: `.claude/rules/*.md`（全22+3=25ファイル）
- Read: `docs/reference/codex-rules/*.md`（同期先）

**Step 1: 差分確認**

```bash
for f in .claude/rules/*.md; do
  base=$(basename "$f")
  if [ -f "docs/reference/codex-rules/$base" ]; then
    diff "$f" "docs/reference/codex-rules/$base" > /dev/null 2>&1 || echo "DIFF: $base"
  else
    echo "MISSING: $base"
  fi
done
```

**Step 2: 差分があるファイルを同期**

```bash
cp .claude/rules/bun-patterns.md .claude/rules/bun-patterns.md
cp .claude/rules/error-handling.md .claude/rules/error-handling.md
cp .claude/rules/accessibility.md .claude/rules/frontend/accessibility.md
# 更新したファイルも同期
```

**Step 3: AGENTS.md の docs/reference/ 参照が正しいか確認**

---

### Task 22: 最終検証とコミット

**Step 1: type-check**

```bash
bun run validate 2>&1
```

Expected: PASS（ルール/スキルファイルは TypeScript ではないので基本影響しないが確認）

**Step 2: 変更一覧確認**

```bash
git status
git diff --stat
```

**Step 3: コミット**

```bash
git add .claude/rules/ .claude/agents/ .claude/skills/
git add CLAUDE.md AGENTS.md
git add docs/reference/codex-rules/
git add docs/plans/2026-02-18-rules-skills-overhaul-design.md
git add docs/plans/2026-02-18-rules-skills-overhaul.md
git commit -m "$(cat <<'EOF'
docs: overhaul all rules, skills, agents, and CLAUDE.md to latest best practices

- Update 22 existing rule files with official latest patterns from context7/WebSearch
- Add 3 new rules: bun-patterns.md, error-handling.md, accessibility.md
- Fix project-reviewer agent TypeScript version (5.9 → 6.0-beta)
- Update all 4 agents with latest project patterns
- Update all 6 skills with latest API patterns
- Update CLAUDE.md: add new rules, fix conditional load paths
- Update AGENTS.md: latest Bun/Prisma/Better Auth/Lexical patterns
- Sync docs/reference/codex-rules/ with all .claude/rules/ changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## 参照

- 設計ドキュメント: `docs/plans/2026-02-18-rules-skills-overhaul-design.md`
- 現行ルール: `.claude/rules/`
- 現行スキル: `.claude/skills/`
- Codex向けルール: `docs/reference/codex-rules/`
