# Rules / Skills / CLAUDE.md 全面刷新 設計ドキュメント

**日付**: 2026-02-18
**方針**: 完全リサーチ + 全ファイル再構築。公式ベストプラクティス最優先、後方互換ハックなし。

---

## 目的

`.claude/rules/`（22ファイル）、`.claude/skills/`（9ファイル）、`.claude/agents/`（4ファイル）、`CLAUDE.md`、`AGENTS.md`、`docs/reference/codex-rules/` を、context7 + 公式ドキュメント + WebSearch によるリサーチに基づいて最高品質に再構築する。

---

## リサーチ対象

| ライブラリ | context7 ID | 確認事項 |
|-----------|------------|---------|
| Next.js 16 | `/vercel/next.js` | `'use cache'` / `cacheLife` / `cacheTag` / `updateTag` / PPR |
| React 19.2 | `/facebook/react` | `useEffectEvent` / `Activity` / Server Actions / Compiler |
| TypeScript 6.0 | `/microsoft/typescript` | `noUncheckedIndexedAccess` / `stableTypeOrdering` / 新エラー |
| Prisma 7 | `/prisma/prisma` | WASM / `$extends` / mapped enums / JSON型安全 |
| Zod 4 | `/colinhacks/zod` | `z.enum()` / `error:` / `safeParse` / Prisma統合 |
| Better Auth 1.4 | `/better-auth/better-auth` | RBAC / nextCookies / Server Action パターン |
| Lexical 0.40 | `/facebook/lexical` | NodeState API / `$config` / `createState` |
| Bun 1.3 | `/oven-sh/bun` | テスト API / `mock` / `mock.module` / `mockReset` |
| Tailwind CSS 4 | `/tailwindlabs/tailwindcss` | `@theme` / OKLCH / CSS-first |
| GSAP 3.14 | `/greensock/gsap` | `useGSAP` / `ScrollTrigger` / `matchMedia` |
| nuqs 2 | `/47ng/nuqs` | `createSearchParamsCache` / Zod統合 |

---

## ファイルアーキテクチャ

### 新規作成（3ファイル）

| ファイル | 内容 |
|---------|------|
| `.claude/rules/bun-patterns.md` | Bun テスト API・ランタイム・Bun.SQL |
| `.claude/rules/error-handling.md` | `safeFetch` / `logger` / エラー分類 |
| `.claude/rules/accessibility.md` | `aria-*` / フォーカス管理 / reduced-motion |

### 更新（全22ファイル + agents/skills）

- **Core**: `type-safety.md`, `implementation-quality.md`, `test-quality.md`
- **Framework**: `react-patterns.md`, `server-actions.md`, `auth-patterns.md`
- **Data**: `prisma-patterns.md`, `zod-patterns.md`, `nuqs-patterns.md`
- **UI/Design**: `tailwind-patterns.md`, `gsap-patterns.md`, `threejs-patterns.md`, `pixijs-patterns.md`, `anti-ai-design.md`, `visual-effects-patterns.md`, `seo-patterns.md`, `ui-ux-patterns.md`
- **Editor**: `lexical-patterns.md`
- **Infra**: `deployment-patterns.md`, `turbopack-hmr.md`
- **Config**: `project-design-config.md`, `design-system-memory.md`
- **Agents**: 全4ファイル（project-reviewer TS 5.9→6.0修正を含む）
- **Skills**: 全6スキル

### CLAUDE.md / AGENTS.md

- tech stack バージョン更新（TypeScript 6.0-beta 等）
- 新規ルール追加（bun-patterns, error-handling, accessibility）
- Codex向けパターン最新化

### docs/reference/codex-rules/ 同期

`.claude/rules/` の更新を全反映。

---

## 品質基準

1. **リサーチベース**: context7公式ドキュメントから引用
2. **OK/NGコード例**: 必ず両方記載
3. **禁止理由明記**: なぜNGかを説明
4. **相互参照**: 関連ファイルリンクを末尾に統一
5. **実際パスと整合**: プロジェクト実際のパスを正確に記載

---

## 実装フェーズ

```
Phase 1: 並行リサーチ（全ライブラリ同時・context7 + WebSearch）
Phase 2: Core rules 更新（type-safety, react, server-actions, prisma, zod）
Phase 3: 新規ルール作成（bun-patterns, error-handling, accessibility）
Phase 4: 残りルール更新（gsap, threejs, pixijs, tailwind, seo, lexical, etc.）
Phase 5: CLAUDE.md / AGENTS.md / agents / skills 更新
Phase 6: docs/reference/codex-rules/ 同期 + コミット
```
