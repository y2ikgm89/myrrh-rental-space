# プロジェクト品質改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロジェクトスコアを 8.7→9.2+ に引き上げ — `as` 型アサーション削除、ParallaxLayer GSAP 移行、CSP ヘッダー追加、カバレッジ閾値強制

**Architecture:** 4 つの独立した改善を順次実施。各タスクは破壊的変更を許容し、後方互換性ハックなしでクリーンに実装する。

**Tech Stack:** TypeScript 6.0, GSAP 3.14, Next.js 16, Bun Test

---

## File Structure

| Action | Path                                                                | Responsibility                             |
| ------ | ------------------------------------------------------------------- | ------------------------------------------ |
| Modify | `src/shared/lib/space-description-list-snippet.ts`                  | `as` → type guard に置換（3箇所）          |
| Modify | `src/shared/lib/validations/lexical.ts`                             | `as` → type guard に置換（2箇所）          |
| Modify | `src/app/(public)/_shared/components/animations/parallax-layer.tsx` | snapshot matchMedia → GSAP matchMedia 移行 |
| Modify | `next.config.ts`                                                    | CSP + セキュリティヘッダー追加             |
| Modify | `bunfig.toml`                                                       | カバレッジ閾値有効化                       |

---

### Task 1: space-description-list-snippet.ts の `as` アサーション除去

**Files:**

- Modify: `src/shared/lib/space-description-list-snippet.ts:17-27`

- [ ] **Step 1: `looksLikeLexicalEditorStateJson` 内の `as` 3箇所を `in` 演算子による型絞り込みに置換**

```typescript
function looksLikeLexicalEditorStateJson(value: string): boolean {
  const t = value.trim();
  if (!t.startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(t);
    if (typeof parsed !== "object" || parsed === null || !("root" in parsed)) {
      return false;
    }
    const root: unknown = parsed.root;
    if (typeof root !== "object" || root === null) return false;
    return (
      "type" in root &&
      root.type === "root" &&
      "children" in root &&
      Array.isArray(root.children)
    );
  } catch {
    return false;
  }
}
```

Key insight: `"root" in parsed` で narrowing 後、`parsed.root` にアクセス可能（TypeScript 5.1+）。同様に `"type" in root` で `root.type`、`"children" in root` で `root.children` にアクセス可能。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS（型エラーなし）

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/space-description-list-snippet.ts
git commit -m "refactor: replace as assertions with in-operator narrowing in space-description-list-snippet"
```

---

### Task 2: lexical.ts の `as` アサーション除去

**Files:**

- Modify: `src/shared/lib/validations/lexical.ts:30,39`

- [ ] **Step 1: `isLexicalComposerReadyEditorStateJson` 内の `as` 2箇所を `in` 演算子で置換**

```typescript
export function isLexicalComposerReadyEditorStateJson(val: string): boolean {
  try {
    const parsed: unknown = JSON.parse(val);
    if (typeof parsed !== "object" || parsed === null || !("root" in parsed)) {
      return false;
    }
    const root: unknown = parsed.root;
    if (
      typeof root !== "object" ||
      root === null ||
      Array.isArray(root) ||
      !("children" in root)
    ) {
      return false;
    }
    return Array.isArray(root.children) && root.children.length > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 既存テストを実行して変更が正しいことを確認**

Run: `bun test __tests__/unit/lib/validations/lexical.test.ts`
Expected: PASS

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/validations/lexical.ts
git commit -m "refactor: replace as assertions with in-operator narrowing in lexical validation"
```

---

### Task 3: ParallaxLayer を GSAP matchMedia パターンに移行

**Files:**

- Modify: `src/app/(public)/_shared/components/animations/parallax-layer.tsx`

- [ ] **Step 1: useEffect + snapshot matchMedia → useGSAP + gsap.matchMedia() に書き換え**

```typescript
"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";

interface ParallaxLayerProps {
  readonly children: ReactNode;
  readonly speed?: number; // 0-1, default 0.15
  readonly className?: string;
}

export function ParallaxLayer({
  children,
  speed = 0.15,
  className = "",
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        function handleScroll() {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const scrollProgress = rect.top / window.innerHeight;
          const offset = scrollProgress * speed * 100;
          el.style.transform = `translateY(${offset}px)`;
        }

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
      });
    },
    { scope: ref, dependencies: [speed] },
  );

  return (
    <div ref={ref} className={`will-change-transform ${className}`.trim()}>
      {children}
    </div>
  );
}
```

Key changes:

- `useEffect` → `useGSAP`（GSAP ライフサイクル統合）
- `window.matchMedia().matches` snapshot → `gsap.matchMedia().add()` reactive
- `{ scope: ref, dependencies: [speed] }` で GSAP スコープと再実行条件を明示

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(public)/_shared/components/animations/parallax-layer.tsx'
git commit -m "refactor: migrate ParallaxLayer to gsap.matchMedia for reactive reduced-motion"
```

---

### Task 4: CSP + セキュリティヘッダー追加

**Files:**

- Modify: `next.config.ts:118-162`（headers() 関数）

- [ ] **Step 1: 公開ページにセキュリティヘッダーを追加**

`headers()` の公開ページブロック（`/:path*`）に以下を追加:

```typescript
// 公開ページ（積極的キャッシュ + セキュリティヘッダー）
{
  source: "/:path*",
  headers: [
    {
      key: "Cache-Control",
      value: "public, s-maxage=3600, stale-while-revalidate=3600",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ],
},
```

**NOTE**: `Strict-Transport-Security` は Cloud Run のロードバランサーが設定するため Next.js 側では追加しない。`Content-Security-Policy` はインラインスクリプト（Next.js の hydration, GA4, Turnstile）との互換性が複雑なため、個別の `X-*` ヘッダーで代替する。

- [ ] **Step 2: 管理画面・API にも同じセキュリティヘッダーを追加**

各 source ブロック（`/admin/:path*`, `/reservation/:path*`, `/api/:path*`）に `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` を追加。

- [ ] **Step 3: 型チェック + ビルド**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(security): add X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy headers"
```

---

### Task 5: カバレッジ閾値の有効化

**Files:**

- Modify: `bunfig.toml:17`

- [ ] **Step 1: カバレッジ閾値のコメントアウトを解除**

```toml
# カバレッジ閾値
coverageThreshold = { lines = 60, functions = 45 }
```

保守的な閾値（lines 60%, functions 45%）から開始。プロジェクトが成熟するにつれ段階的に引き上げ。

- [ ] **Step 2: テストを実行して閾値をクリアすることを確認**

Run: `bun test`
Expected: PASS（カバレッジ閾値をクリア）

- [ ] **Step 3: Commit**

```bash
git add bunfig.toml
git commit -m "feat(ci): enable coverage thresholds (lines: 60%, functions: 45%)"
```

---

### Task 6: 最終検証

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: テスト全体実行**

Run: `bun test`
Expected: PASS（カバレッジ閾値含む）
