# Lexical Content Blocks — Editorial Magazine 化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lexical-content.css` のカスタムブロック出力スタイルを Editorial Magazine ��ザインに統一する

**Architecture:** 単一ファイル（`src/shared/styles/lexical-content.css`��の CSS プロパティ変更。構���（セレクタ・レイアウト）は維持し、装飾プロパティ（border-radius, box-shadow, font-weight, font-family, background gradient）のみ変更。Collapsible の radius プリ��ット CSS ルールは削除。

**Tech Stack:** CSS（unlayered）、CSS 変数（`var(--color-*)`, `var(--font-serif)`）

---

### Task 1: Steps ブロック — font-weight 600 化 + big style sharp edge

**Files:**

- Modify: `src/shared/styles/lexical-content.css:199-209` (numbered style)
- Modify: `src/shared/styles/lexical-content.css:257-289` (big style)
- Modify: `src/shared/styles/lexical-content.css:333-339` (square modifier)

- [ ] **Step 1: Steps numbered — font-weight 700→600**

```css
/* Line 206: font-weight を変更 */
/* 変更前 */
font-weight: 700;
/* 変更後 */
font-weight: 600;
```

- [ ] **Step 2: Steps big — border-radius 0.5rem→0 + font-weight 700→600**

```css
/* Line 262: border-radius を変更 */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;

/* Line 285: font-weight を変更 */
/* 変更前 */
font-weight: 700;
/* 変更後 */
font-weight: 600;
```

- [ ] **Step 3: Steps square modifier — border-radius 0.25rem→0**

```css
/* Line 338: border-radius を変更 */
/* 変更前 */
border-radius: 0.25rem;
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 4: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Steps ブロック font-weight 600 化 + sharp edge"
```

---

### Task 2: Collapsible ブロック — radius プリセット削除 + card shadow→border

**Files:**

- Modify: `src/shared/styles/lexical-content.css:370-382` (radius presets)
- Modify: `src/shared/styles/lexical-content.css:461-484` (card style)

- [ ] **Step 1: Collapsible radius プリセット 3 ルールを削除**

以下の CSS ルール（12行）を完全���除:

```css
/* 削除対象: Line 370-382 */
/* ---- Border Radius Presets ---- */

[data-collapsible-radius="sm"] {
  border-radius: 0.25rem;
}

[data-collapsible-radius="md"] {
  border-radius: 0.5rem;
}

[data-collapsible-radius="lg"] {
  border-radius: 0.75rem;
}
```

- [ ] **Step 2: Collapsible card — box-shadow→border + inherit 削除**

```css
/* 変更前 (Line 462-467) */
[data-collapsible-style="card"] {
  border: none;
  box-shadow:
    0 1px 3px 0 rgb(0 0 0 / 0.1),
    0 1px 2px -1px rgb(0 0 0 / 0.1);
}

/* 変更後 */
[data-collapsible-style="card"] {
  border: 1px solid var(--color-border);
}
```

```css
/* 削除対象 (Line 473-479): card title first-child の border-radius inherit */
[data-collapsible-style="card"]
  [data-collapsible-item]:first-child
  [data-collapsible-title] {
  border-radius: inherit;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
```

- [ ] **Step 3: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Collapsible radius プリセット削除 + card shadow→border"
```

---

### Task 3: Tabs ブロック — sharp edge + shadow 削除

**Files:**

- Modify: `src/shared/styles/lexical-content.css:516-522` (container)
- Modify: `src/shared/styles/lexical-content.css:578-598` (pills)
- Modify: `src/shared/styles/lexical-content.css:627-639` (boxed)

- [ ] **Step 1: Tabs container — border-radius 0.5rem→0**

```css
/* Line 520 */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 2: Tabs pills — border-radius→0 + box-shadow 削除**

```css
/* Line 581: tablist border-radius */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;

/* Line 589: tab border-radius */
/* 変更前 */
border-radius: 0.375rem;
/* 変更後 */
border-radius: 0;

/* Line 596-597: active tab box-shadow を削除 */
/* 変更前 */
box-shadow: 0 1px 3px
  color-mix(in oklch, var(--accent, var(--color-accent)) 35%, transparent);
/* 変更後: この2行を完全削除 */
```

- [ ] **Step 3: Tabs boxed — border-radius→0 + box-shadow→border-top**

```css
/* Line 629: tab border-radius */
/* 変更前 */
border-radius: 0.375rem 0.375rem 0 0;
/* 変更後 */
border-radius: 0;

/* Line 639: active tab box-shadow→border-top */
/* 変更前 */
box-shadow: inset 0 2px 0 var(--accent, var(--color-accent));
/* 変更後 */
border-top: 2px solid var(--accent, var(--color-accent));
```

- [ ] **Step 4: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Tabs sharp edge + shadow 削除"
```

---

### Task 4: Callout + PullQuote — sharp edge + serif italic

**Files:**

- Modify: `src/shared/styles/lexical-content.css:744-752` (callout)
- Modify: `src/shared/styles/lexical-content.css:795-806` (pullquote modern)
- Modify: `src/shared/styles/lexical-content.css:818-830` (pullquote text)

- [ ] **Step 1: Callout — border-radius 0.5rem→0**

```css
/* Line 749 */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 2: PullQuote text — serif italic + font-weight 400**

```css
/* Line 818-830: font-family と font-weight を変更 */
/* 変更前 */
[data-pull-quote-text] {
  font-size: 1.25rem;
  font-weight: 500;
  font-style: italic;
  color: var(--color-foreground);
  line-height: 1.625;
  /* Prose reset: override @tailwindcss/typography blockquote styles */
  border-left: none;
  padding-left: 0;
  margin-top: 0;
  margin-bottom: 0;
  quotes: none;
}

/* 変更後 */
[data-pull-quote-text] {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  font-weight: 400;
  font-style: italic;
  color: var(--color-foreground);
  line-height: 1.625;
  /* Prose reset: override @tailwindcss/typography blockquote styles */
  border-left: none;
  padding-left: 0;
  margin-top: 0;
  margin-bottom: 0;
  quotes: none;
}
```

- [ ] **Step 3: PullQuote modern — gradient 削除**

```css
/* Line 795-806: background gradient を削除 */
/* 変更前 */
[data-pull-quote-style="modern"] {
  border-top: 2px solid
    color-mix(in oklch, var(--accent, var(--color-accent)) 50%, transparent);
  border-bottom: 2px solid
    color-mix(in oklch, var(--accent, var(--color-accent)) 50%, transparent);
  background: linear-gradient(
    to right,
    color-mix(in oklch, var(--accent, var(--color-accent)) 5%, transparent),
    transparent
  );
  padding: 2rem;
}

/* 変更後 */
[data-pull-quote-style="modern"] {
  border-top: 2px solid
    color-mix(in oklch, var(--accent, var(--color-accent)) 50%, transparent);
  border-bottom: 2px solid
    color-mix(in oklch, var(--accent, var(--color-accent)) 50%, transparent);
  padding: 2rem;
}
```

- [ ] **Step 4: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Callout sharp edge + PullQuote serif italic"
```

---

### Task 5: Button — variant 別 border-radius + outline editorial 化

**Files:**

- Modify: `src/shared/styles/lexical-content.css:900-937` (button)

- [ ] **Step 1: Button 共通 — border-radius を削���（variant 別に移動）**

```css
/* Line 900-910 */
/* 変更前 */
[data-button-alignment] > a {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  border-radius: 0.375rem;
  transition:
    color 0.15s,
    background-color 0.15s,
    opacity 0.15s;
  text-decoration: none;
}

/* 変更後 */
[data-button-alignment] > a {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  transition:
    color 0.15s,
    background-color 0.15s,
    opacity 0.15s;
  text-decoration: none;
}
```

- [ ] **Step 2: Button primary/secondary — rounded-full**

```css
/* 変更前 */
[data-button-variant="primary"] > a {
  background-color: var(--color-accent);
  color: var(--color-accent-foreground);
}

/* 変更後 */
[data-button-variant="primary"] > a {
  background-color: var(--color-accent);
  color: var(--color-accent-foreground);
  border-radius: 9999px;
}

/* 変更前 */
[data-button-variant="secondary"] > a {
  background-color: var(--color-secondary, var(--color-muted));
  color: var(--color-secondary-foreground, var(--color-foreground));
}

/* 変更後 */
[data-button-variant="secondary"] > a {
  background-color: var(--color-secondary, var(--color-muted));
  color: var(--color-secondary-foreground, var(--color-foreground));
  border-radius: 9999px;
}
```

- [ ] **Step 3: Button outline — sharp editorial**

```css
/* 変更前 */
[data-button-variant="outline"] > a {
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-foreground);
}
[data-button-variant="outline"] > a:hover {
  background-color: var(--color-muted);
}

/* 変更後 */
[data-button-variant="outline"] > a {
  border: 1px solid var(--color-foreground);
  background-color: var(--color-background);
  color: var(--color-foreground);
  border-radius: 0;
}
[data-button-variant="outline"] > a:hover {
  background-color: var(--color-accent);
  color: var(--color-accent-foreground);
  border-color: var(--color-accent);
}
```

- [ ] **Step 4: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Button variant 別 border-radius + outline editorial 化"
```

---

### Task 6: Bookmark + Image + Embeds + TOC — sharp edge 統一

**Files:**

- Modify: `src/shared/styles/lexical-content.css:976` (bookmark)
- Modify: `src/shared/styles/lexical-content.css:1075` (image)
- Modify: `src/shared/styles/lexical-content.css:1107-1189` (embeds)
- Modify: `src/shared/styles/lexical-content.css:1203` (toc)

- [ ] **Step 1: Bookmark — border-radius���0**

```css
/* Line 976 */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 2: Image — border-radius→0**

```css
/* Line 1075 */
/* 変更前 */
border-radius: 0.5rem;
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 3: Embeds — 全 iframe の border-radius→0**

YouTube (line 1107), X (line 1123), Instagram (line 1139), Spotify (line 1154), Vimeo (line 1187):

```css
/* 各 iframe ルールの border-radius を変更 */
/* 変更��（各箇所） */
border-radius: 0.5rem; /* or 12px for Spotify */
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 4: TOC — border-radius→0**

```css
/* Line 1203 */
/* 変更前 */
border-radius: var(--radius-lg);
/* 変更後 */
border-radius: 0;
```

- [ ] **Step 5: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Bookmark/Image/Embeds/TOC sharp edge 統一"
```

---

### Task 7: Timeline shadow 対応 + 最終ビルド検証

**Files:**

- Modify: `src/shared/styles/lexical-content.css:240-245` (timeline dot)

- [ ] **Step 1: Timeline dot — box-shadow→border に置換**

Timeline ドットの `box-shadow` はリング表現に使用。Editorial では `border` に置換:

```css
/* Line 240-245 */
/* 変更前 */
[data-steps-style="timeline"] > [data-step]::before {
  background-color: var(--accent, var(--color-accent));
  box-shadow: 0 0 0 3px
    color-mix(in oklch, var(--accent, var(--color-accent)) 15%, transparent);
  margin-top: var(--step-dot-offset);
}

/* 変更後 */
[data-steps-style="timeline"] > [data-step]::before {
  background-color: var(--accent, var(--color-accent));
  border: 3px solid
    color-mix(in oklch, var(--accent, var(--color-accent)) 15%, transparent);
  margin-top: var(--step-dot-offset);
}
```

- [ ] **Step 2: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "style: Editorial Magazine — Timeline dot border 化 + 最終検証"
```
