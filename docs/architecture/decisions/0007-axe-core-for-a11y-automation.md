# 0007. axe-core/playwright による WCAG 2.1 AA 自動検証

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: accessibility, testing, quality

## Context and Problem Statement

プロジェクトは Editorial Magazine テーマの公開ページ + Swiss Industrial Admin テーマの管理画面を持つ。`.claude/rules/frontend/accessibility.md` で WCAG 2.2 AA 準拠を明記しているが、以下の問題があった:

- 手動の a11y テストは `e2e/a11y/keyboard-navigation.spec.ts` のみで範囲が限定的
- 色コントラスト / ARIA 属性 / form labels 等の自動検証がない
- GSAP / Lenis アニメーション追加時に a11y 逆行リスク
- Lighthouse CI の accessibility score だけでは **どこに問題があるか** が見えづらい
- 管理画面の Lexical editor / Recharts 等の複雑ウィジェットで false positive が多い

## Decision Drivers

- WCAG 2.1 Level A/AA 自動検証
- 違反箇所（CSS selector）を明示してデバッグ可能
- サードパーティ embed（Google Maps / Instagram / YouTube）を除外可能
- 管理画面の既知 false positive（Lexical contenteditable 等）を除外可能
- Playwright の既存 E2E 基盤に統合

## Considered Options

1. **Option A: Lighthouse CI の accessibility score のみに依存**
2. **Option B: `@axe-core/playwright` 統合**
3. **Option C: Pa11y CI 統合**
4. **Option D: 手動 a11y テストを継続**

## Decision Outcome

**Chosen option**: "Option B — `@axe-core/playwright`"

`bun add -d @axe-core/playwright` + 2 新規 spec:

### 1. `e2e/a11y/axe-public-pages.spec.ts` (8 tests)

厳格設定 — **critical + serious 違反 0 を assertion**:

```ts
new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  .exclude('iframe[src*="google.com/maps"]')
  .exclude('iframe[src*="youtube.com"]')
  .exclude('iframe[src*="instagram.com"]');
```

対象: home / spaces / reservation / journal / contact / faq / events / login

### 2. `e2e/authenticated/admin/axe-admin-pages.spec.ts` (6 tests)

業務ツール特性を考慮した**緩和設定** — **critical 違反のみを assertion**（serious は warning）:

```ts
new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  .exclude('[contenteditable="true"]') // Lexical
  .exclude('[class*="recharts" i]')
  .exclude('[data-testid="lexical-editor"]');
```

対象: dashboard / reservations / spaces / faq / blog/new / settings

**型安全化**: `import type { Result } from "axe-core"` で `impact` が optional string の制約を型レベルで解決。`Set<string>` + `isBlocking()` 型ガード helper で assertion filter を明示化。

### Consequences

**良い点**:

- WCAG 2.1 AA 準拠を 14 test で自動検証
- 違反時に `[impact] id: help (N node(s))` + `helpUrl` + CSS selector target の詳細報告
- 新機能追加時の a11y 逆行を PR で即検出
- `chromium-admin` project で管理画面認証済み state でスキャン
- サードパーティ iframe 除外で false positive ゼロ

**悪い点 / トレードオフ**:

- Lexical editor の contenteditable false positive 除外（手動カバレッジ維持必要）
- Recharts SVG の a11y は別途対応が必要
- E2E 実行時間が ~14 test 分増加

### Compliance / Validation

- `e2e/a11y/axe-public-pages.spec.ts` で公開ページ 8 pages × WCAG 2.1 AA
- `e2e/authenticated/admin/axe-admin-pages.spec.ts` で管理画面 6 pages × critical
- Lighthouse CI の `categories:accessibility: ["error", { minScore: 0.9 }]` と相補的に動作
- CI の `e2e-tests` job で毎 PR 実行
- `.claude/rules/frontend/accessibility.md` のルール文書と連携

## Pros and Cons of the Options

### Option A: Lighthouse CI score のみ

- ✅ 既に統合済み
- ❌ 違反箇所が不明確、デバッグ困難
- ❌ page-level score のみ

### Option B: `@axe-core/playwright` ✅ 採用

- ✅ 違反箇所を CSS selector で特定可能
- ✅ 既存 Playwright 基盤に統合
- ✅ tag-based rule filter で WCAG 2.1 AA 明確化
- ⚠️ false positive 除外設定が必要

### Option C: Pa11y CI

- ✅ CLI で実行可能
- ❌ Playwright 基盤との統合が二重管理
- ❌ 認証済み state のサポートが弱い

### Option D: 手動継続

- ❌ カバレッジ不十分
- ❌ 回帰検出不可

## Links / References

- [axe-core API 公式](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- [axe-core rule tags](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#axe-core-rule-tags)
- [WCAG 2.1 公式](https://www.w3.org/TR/WCAG21/)
- [`.claude/rules/frontend/accessibility.md`](../../../.claude/rules/frontend/accessibility.md)
- 実装: `e2e/a11y/axe-public-pages.spec.ts`, `e2e/authenticated/admin/axe-admin-pages.spec.ts`
