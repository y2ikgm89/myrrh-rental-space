---
name: audit-a11y
description: 公開ページの hero / image overlay / archive list / 配色 token 編集後に Playwright MCP axe-core scan で violations + incomplete を実機検証する。CI broad E2E flake (bgGradient / bgOverlap incomplete → production violation 昇格 / image load timing 偽陽性) を編集セッション内で発見する canonical pattern。
when_to_use: 公開ページ (`src/app/(public*)/**`) の hero / image overlay / archive list / 配色 token (`public.css` の `--color-*`) を編集した後、commit 前に Playwright MCP で a11y 実機検証したいとき。CI broad E2E は opt-in (1h20m+) のため、a11y flake が main merge 後の別 PR でしか発覚しないリスクを未然に防ぐ。
paths:
  - src/app/(public*)/**/*.tsx
  - src/app/(public*)/_styles/public*.css
  - src/app/(public)/_shared/components/page-hero/**
---

# a11y 実機検証監査 (Playwright MCP axe-core)

## 用語定義

| 概念            | 説明                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `violations`    | axe-core が確定的に WCAG 不達と判定した違反。CI test を fail させる                                                                   |
| `incomplete`    | axe-core が「判定不能」とした項目 (gradient ancestor / image overlap 等)。dev では非 fail、**production で violation 昇格リスク**あり |
| `bgGradient`    | 親要素に `background: linear-gradient(...)` がある → axe が text contrast を確定計算できない                                          |
| `bgOverlap`     | 別の absolute / fixed 要素が text element に重なる → 同上                                                                             |
| HMR fresh fetch | `fetch('/path?cb='+ts, {cache:'no-store'})` で SSR HTML を直接取得し client bundle HMR stale を回避                                   |

## ワークフロー

### Step 1: dev server 起動確認

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

200 が返らなければ user に dev server 起動を依頼する (manual 管理ポリシー)。

### Step 2: 対象 URL に navigate

編集した component の reachable URL を `urls` fixture (`e2e/fixtures.ts`) から確認:

- 公開トップ: `/`
- archive: `/news`, `/posts`, `/events`, `/spaces`, `/faq`
- detail: `/news/[slug]`, `/posts/[slug]` 等

Playwright MCP `browser_navigate` で対象 URL を開く。

### Step 3: axe-core CDN inject + 実機 scan

```javascript
// browser_evaluate で実行
async () => {
  // axe-core を CDN から動的 inject
  await new Promise((resolve, reject) => {
    if (window.axe) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  // image load 完了待ち (photo credit flake 回避)
  await Promise.all(
    Array.from(document.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          }),
    ),
  );
  await new Promise((r) => setTimeout(r, 800)); // GSAP entrance animation 完了待ち

  // 実 spec と同一 config で scan
  const results = await window.axe.run(document, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
    exclude: [
      ['iframe[src*="google.com/maps"]'],
      ['iframe[src*="youtube.com"]'],
      ['iframe[src*="instagram.com"]'],
      ['[class*="google-maps"]'],
    ],
  });

  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  return {
    blockingCount: blocking.length,
    blocking: blocking.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target,
        html: n.html.slice(0, 300),
        msg: n.any?.[0]?.message,
      })),
    })),
    incompleteCount: results.incomplete.length,
    incomplete: results.incomplete.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target,
        msg: n.any?.[0]?.message,
        bgKey: n.any?.[0]?.data?.messageKey, // bgGradient / bgOverlap / etc.
      })),
    })),
  };
};
```

### Step 4: incomplete → production violation 昇格リスク判定

`incomplete` の `messageKey` を確認し以下に該当すれば **production safety のため修正必須** として報告:

| messageKey   | 原因                                           | 修正策                                                                                                 |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bgGradient` | 親要素に `linear-gradient` / `radial-gradient` | solid bg-token に置換 (`bg-gradient-to-b from-surface via-background to-background` → `bg-background`) |
| `bgOverlap`  | 別 absolute 要素が text に物理的に重なる       | clear zone に移動 + 必要なら `aria-hidden` + `pointer-events-none`                                     |
| `bgImage`    | 背景画像があり axe が pixel sampling 不能      | solid scrim 追加 (`bg-foreground` + `text-background` の image attribution overlay pattern)            |

実例: 2026-05-15 PR #31/#32 で `bgGradient` incomplete (StandardHeroSection minimal の gradient bg) + `bgOverlap` incomplete (AnnouncementBar indicator overlap) + `bgImage` incomplete (photo credit text-background/80) が production build で全て violation に昇格した実観測。

### Step 5: HMR stale 疑い → fresh fetch 独立検証

`browser_evaluate` で取得した element.className が編集した値を含まない場合、Turbopack HMR が止まっている。SSR HTML を直接 fetch して disk state を独立検証:

```javascript
async () => {
  const res = await fetch("/news?cb=" + Date.now(), { cache: "no-store" });
  const html = await res.text();
  const m = html.match(/data-hero=""[^>]*class="([^"]+)"/);
  return m
    ? { className: m[1], hasNewClass: m[1].includes("bg-background") }
    : { error: "pattern not matched" };
};
```

fresh fetch HTML が新コードを含むのに `getComputedStyle()` が古い値を返すなら **client bundle 単独の HMR fail**。dev server restart は user manual のため、commit + CI で disk state 検証に切替えるのが最速。

### Step 6: 報告フォーマット

```markdown
## a11y 実機検証監査結果 (audit-a11y skill)

**対象 URL**: <url>
**axe-core 設定**: WCAG 2.1 AA (wcag2a / wcag2aa / wcag21a / wcag21aa)

### Blocking violations (CI fail)

N 件 — [list each]

### Incomplete → production 昇格リスク

N 件 — bgGradient / bgOverlap / bgImage [list each + 修正策]

### HMR 状態

- `browser_evaluate` DOM className: <value>
- fresh fetch SSR className: <value>
- 一致状態: ✓ 反映 / ✘ stale (commit + CI 検証推奨)

### 修正推奨

[concrete diff or pointer to rule docs]
```

## 検出パターンチェックリスト

実機 scan に加え、以下の **static pattern** も同時に確認:

1. **image overlay text の alpha scrim** — `bg-foreground/[0-9]+` または `text-background/[0-9]+` + `absolute` + image 親要素 → solid scrim に置換 (`bg-foreground` / `text-background`)
2. **hero / section の gradient bg** — `bg-gradient-*` + 配下 text element → solid bg に置換 (`bg-background` + `border-b border-border`)
3. **隣接 absolute button overlap** — 同 parent 内 `absolute right-N` が複数あり N の差が 44px (`h-11 w-11`) 未満で重なる
4. **ScrollReveal 内の archive list** — 長い `.map` + text-muted-foreground 多用 → static layout に降格推奨
5. **token computed contrast 不達** — `--color-muted-foreground` / `--color-accent` 等の oklch L 値が WCAG AA 達成ラインを下回る

## 関連 SSoT

- `.claude/rules/frontend/accessibility/images-text.md` §image overlay text の axe-definitive contrast (solid scrim パターン)
- `.claude/rules/frontend/design-config/foundations.md` §カラーパレット (WCAG AA 達成ライン)
- `.claude/rules/claude-code-patterns.md` §Playwright MCP の HMR キャッシュ罠 + §HMR が完全に止まった場合の disk state 独立検証
- `.claude/rules/test-quality/e2e.md` §公開ページ UI 編集後の a11y 事前検証
- `e2e/a11y/axe-public-pages.spec.ts` — CI 本番の axe-core spec (同一 config で実機検証)

## 関連 subagent

- `accessibility-reviewer` — static pattern を grep ベースで検出 (実機 scan は本 skill 経由)

## 歴史

2026-05-15 導入。PR #31/#32 で photo credit flake / muted-foreground WCAG 不達 / hero gradient bgGradient incomplete を CI でしか発覚できず、main merge 後に別 PR で対応した反省から。編集セッション内で同種 flake を発見する canonical workflow として整備。
