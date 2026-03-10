# Lexical Accent Color System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lexical エディタの Steps・PullQuote・Tabs・Collapsible ブロックに統一アクセントカラー（10色プリセット）を追加する。

**Architecture:** `[data-color="X"]` 属性で `--accent` / `--accent-fg` CSS 変数を設定し、各ブロックが `var(--accent, var(--color-primary))` で継承する CSS-first パターン。Collapsible の旧 3-state 色システムを破壊的変更で削除。

**Tech Stack:** Lexical 0.40.0 NodeState API (`createState`, `$setState`, `$getState`, `$getStateChange`), Tailwind CSS 4.1 (OKLCH), React 19.2

**Base path:** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`

---

## Task 1: config/accent-colors.ts を作成する

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/accent-colors.ts`

**Step 1: ファイルを作成する**

```typescript
/**
 * Accent Color System
 *
 * @description 全ブロック共通のアクセントカラー定義
 * CSS: [data-color="X"] { --accent: ...; --accent-fg: ...; }
 */

import { createEnumGuard } from "./type-guards";

// =============================================================================
// Types
// =============================================================================

export type AccentColor =
  | "default"
  | "blue"
  | "teal"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "purple"
  | "slate";

export const ACCENT_COLORS: readonly AccentColor[] = [
  "default",
  "blue",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "slate",
] as const;

// =============================================================================
// Type Guard
// =============================================================================

export const isAccentColor = createEnumGuard<AccentColor>(ACCENT_COLORS);

// =============================================================================
// Swatch CSS values（ColorSwatchPicker で表示する実際の色値）
// =============================================================================

export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  default: "var(--color-primary)",
  blue: "oklch(0.55 0.20 255)",
  teal: "oklch(0.60 0.15 195)",
  green: "oklch(0.58 0.18 142)",
  yellow: "oklch(0.82 0.17 90)",
  orange: "oklch(0.72 0.18 55)",
  red: "oklch(0.55 0.22 25)",
  pink: "oklch(0.65 0.22 350)",
  purple: "oklch(0.55 0.20 300)",
  slate: "oklch(0.52 0.02 250)",
};
```

**Step 2: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/config/accent-colors.ts
git commit -m "feat(lexical): add AccentColor type, constants, and swatch values"
```

---

## Task 2: inspector/ColorSwatchPicker.tsx を作成する

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/ColorSwatchPicker.tsx`

**Step 1: ファイルを作成する**

```tsx
/**
 * Color Swatch Picker
 *
 * @description アクセントカラー選択用の10色スウォッチグリッド
 * 全インスペクタパネルで共有
 */

"use client";

import { Label } from "@/admin/components/ui";
import {
  ACCENT_COLORS,
  ACCENT_COLOR_SWATCHES,
  type AccentColor,
} from "../config/accent-colors";

type ColorSwatchPickerProps = {
  value: AccentColor;
  onChange: (color: AccentColor) => void;
  label?: string;
};

const COLOR_NAMES: Record<AccentColor, string> = {
  default: "デフォルト",
  blue: "ブルー",
  teal: "ティール",
  green: "グリーン",
  yellow: "イエロー",
  orange: "オレンジ",
  red: "レッド",
  pink: "ピンク",
  purple: "パープル",
  slate: "スレート",
};

export function ColorSwatchPicker({
  value,
  onChange,
  label = "アクセントカラー",
}: ColorSwatchPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-5 gap-1.5">
        {ACCENT_COLORS.map((color) => {
          const isSelected = value === color;
          const swatchColor = ACCENT_COLOR_SWATCHES[color];
          return (
            <button
              key={color}
              type="button"
              title={COLOR_NAMES[color]}
              onClick={() => onChange(color)}
              className={[
                "h-6 w-full rounded transition-shadow",
                isSelected
                  ? "ring-2 ring-ring ring-offset-1"
                  : "hover:ring-1 hover:ring-border",
              ].join(" ")}
              style={{ backgroundColor: swatchColor }}
              aria-label={COLOR_NAMES[color]}
              aria-pressed={isSelected}
            />
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/ColorSwatchPicker.tsx
git commit -m "feat(lexical): add shared ColorSwatchPicker component"
```

---

## Task 3: config/node-labels.ts を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/node-labels.ts`

**Step 1: import に AccentColor を追加し、COLLAPSIBLE_TITLE_COLOR_LABELS を ACCENT_COLOR_LABELS に置き換える**

ファイル先頭の import セクションを以下に変更する:

```typescript
import type { AccentColor } from "./accent-colors";
import type { CalloutType } from "../nodes/CalloutNode";
import type {
  ButtonVariant,
  ButtonSize,
  ButtonAlignment,
} from "../nodes/ButtonNode";
import type {
  CollapsibleStyle,
  CollapsibleRadius,
} from "../nodes/CollapsibleContainerNode";
import type { PullQuoteStyle } from "../nodes/PullQuoteNode";
import type {
  StepsStyle,
  StepsShape,
  StepsFill,
} from "../nodes/StepsContainerNode";
import type {
  TabsStyle,
  TabsSize,
  TabsFixedWidth,
} from "../nodes/TabsContainerNode";
```

変更点:

- `CollapsibleTitleColor` の import を削除（`CollapsibleContainerNode` から）
- `AccentColor` を `./accent-colors` から import に追加

**Step 2: Collapsible セクションを更新する**

```typescript
// =============================================================================
// Collapsible
// =============================================================================

export const COLLAPSIBLE_STYLE_LABELS: Record<CollapsibleStyle, string> = {
  default: "デフォルト",
  minimal: "ミニマル",
  card: "カード",
  filled: "塗りつぶし",
};

export const COLLAPSIBLE_RADIUS_LABELS: Record<CollapsibleRadius, string> = {
  none: "なし",
  sm: "小（0.25rem）",
  md: "中（0.5rem）",
  lg: "大（0.75rem）",
};

// COLLAPSIBLE_TITLE_COLOR_LABELS は削除（AccentColor 統一化により廃止）
```

**Step 3: ファイル末尾（Tabs セクションの後）に追加する**

```typescript
// =============================================================================
// Accent Color（全ブロック共通）
// =============================================================================

export const ACCENT_COLOR_LABELS: Record<AccentColor, string> = {
  default: "デフォルト",
  blue: "ブルー",
  teal: "ティール",
  green: "グリーン",
  yellow: "イエロー",
  orange: "オレンジ",
  red: "レッド",
  pink: "ピンク",
  purple: "パープル",
  slate: "スレート",
};
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/config/node-labels.ts
git commit -m "feat(lexical): add ACCENT_COLOR_LABELS, remove COLLAPSIBLE_TITLE_COLOR_LABELS"
```

---

## Task 4: StepsContainerNode.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/StepsContainerNode.tsx`

**Step 1: import と型定義を追加する**

ファイル先頭の import の直後に以下を追加:

```typescript
import { isAccentColor, type AccentColor } from "../config/accent-colors";
```

Types セクションに追加（`STEPS_FILLS` の後）:

```typescript
export type AccentColor = import("../config/accent-colors").AccentColor;
```

**注意**: 上記は re-export ではなく、既に `accent-colors.ts` の型をそのまま使用するため import のみでよい。

**Step 2: stepsColorState を追加する（State セクション末尾）**

`stepsFillState` の後に追加:

```typescript
export const stepsColorState = createState("stepsColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});
```

**Step 3: `$config()` の stateConfigs に stepsColorState を追加する**

```typescript
override $config() {
  return this.config('steps-container', {
    extends: ElementNode,
    stateConfigs: [
      { flat: true, stateConfig: stepsStyleState },
      { flat: true, stateConfig: stepsLabelState },
      { flat: true, stateConfig: stepsShapeState },
      { flat: true, stateConfig: startNumberState },
      { flat: true, stateConfig: stepsFillState },
      { flat: true, stateConfig: stepsColorState },
    ],
  })
}
```

**Step 4: importDOM の `$convertStepsContainerElement` を更新する**

```typescript
function $convertStepsContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const styleAttr = element.getAttribute("data-steps-style");
  const style = styleAttr && isStepsStyle(styleAttr) ? styleAttr : "numbered";
  const labelAttr = element.getAttribute("data-steps-label");
  const shapeAttr = element.getAttribute("data-steps-shape");
  const startAttr = element.getAttribute("data-steps-start");
  const fillAttr = element.getAttribute("data-steps-fill");
  const colorAttr = element.getAttribute("data-color");

  const node = $createStepsContainerNode({
    style,
    label: labelAttr ?? "STEP",
    shape: shapeAttr && isStepsShape(shapeAttr) ? shapeAttr : "circle",
    startNumber: startAttr ? parseInt(startAttr, 10) || 1 : 1,
    fill: fillAttr && isStepsFill(fillAttr) ? fillAttr : "filled",
    color: colorAttr && isAccentColor(colorAttr) ? colorAttr : "default",
  });
  return { node };
}
```

**Step 5: exportDOM を更新する**

```typescript
override exportDOM(): DOMExportOutput {
  const style = $getState(this, stepsStyleState)
  const label = $getState(this, stepsLabelState)
  const shape = $getState(this, stepsShapeState)
  const startNumber = $getState(this, startNumberState)
  const fill = $getState(this, stepsFillState)
  const color = $getState(this, stepsColorState)

  const element = document.createElement('div')
  element.setAttribute('data-steps', 'true')
  element.setAttribute('data-steps-style', style)
  element.setAttribute('data-steps-label', label)
  element.setAttribute('data-steps-shape', shape)
  element.setAttribute('data-steps-start', String(startNumber))
  element.setAttribute('data-steps-fill', fill)
  element.setAttribute('data-color', color)
  element.style.setProperty('--step-label', `"${label}"`)

  return { element }
}
```

**Step 6: createDOM を更新する**（exportDOM と同じ属性セット）

```typescript
override createDOM(_config: EditorConfig): HTMLElement {
  const style = $getState(this, stepsStyleState)
  const label = $getState(this, stepsLabelState)
  const shape = $getState(this, stepsShapeState)
  const startNumber = $getState(this, startNumberState)
  const fill = $getState(this, stepsFillState)
  const color = $getState(this, stepsColorState)

  const element = document.createElement('div')
  element.setAttribute('data-steps', 'true')
  element.setAttribute('data-steps-style', style)
  element.setAttribute('data-steps-label', label)
  element.setAttribute('data-steps-shape', shape)
  element.setAttribute('data-steps-start', String(startNumber))
  element.setAttribute('data-steps-fill', fill)
  element.setAttribute('data-color', color)
  element.style.setProperty('--step-label', `"${label}"`)

  return element
}
```

**Step 7: updateDOM に color 変化検知を追加する**

`fillChange` の if ブロックの後に追加:

```typescript
const colorChange = $getStateChange(this, prevNode, stepsColorState);
if (colorChange) {
  const [newColor] = colorChange;
  dom.setAttribute("data-color", newColor);
}
```

**Step 8: `$createStepsContainerNode` のオプション型と実装を更新する**

```typescript
type StepsContainerOptions = {
  style?: StepsStyle;
  label?: string;
  shape?: StepsShape;
  startNumber?: number;
  fill?: StepsFill;
  color?: AccentColor;
};

export function $createStepsContainerNode(
  options: StepsContainerOptions = {},
): StepsContainerNode {
  const {
    style = "numbered",
    label = "STEP",
    shape = "circle",
    startNumber = 1,
    fill = "filled",
    color = "default",
  } = options;

  const node = $create(StepsContainerNode);
  $setState(node, stepsStyleState, style);
  $setState(node, stepsLabelState, label);
  $setState(node, stepsShapeState, shape);
  $setState(node, startNumberState, startNumber);
  $setState(node, stepsFillState, fill);
  $setState(node, stepsColorState, color);
  return node;
}
```

**Step 9: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/StepsContainerNode.tsx
git commit -m "feat(lexical): add stepsColorState (AccentColor) to StepsContainerNode"
```

---

## Task 5: PullQuoteNode.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PullQuoteNode.tsx`

**Step 1: import を追加する**

```typescript
import { isAccentColor, type AccentColor } from "../config/accent-colors";
```

**Step 2: pullQuoteColorState を追加する（State セクション末尾）**

```typescript
export const pullQuoteColorState = createState("pullQuoteColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});
```

**Step 3: `$config()` の stateConfigs を更新する**

```typescript
override $config() {
  return this.config('pull-quote', {
    extends: ElementNode,
    stateConfigs: [
      { flat: true, stateConfig: quoteStyleState },
      { flat: true, stateConfig: pullQuoteColorState },
    ],
  })
}
```

**Step 4: `$convertPullQuoteElement` を更新する**

```typescript
function $convertPullQuoteElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const styleAttr = element.getAttribute("data-pull-quote-style");
  const style =
    styleAttr && isPullQuoteStyle(styleAttr) ? styleAttr : "classic";
  const colorAttr = element.getAttribute("data-color");
  const color = colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";
  const node = $createPullQuoteNode(style, color);
  return { node };
}
```

**Step 5: exportDOM を更新する**

```typescript
override exportDOM(): DOMExportOutput {
  const quoteStyle = $getState(this, quoteStyleState)
  const color = $getState(this, pullQuoteColorState)
  const element = document.createElement('figure')
  element.setAttribute('data-pull-quote', 'true')
  element.setAttribute('data-pull-quote-style', quoteStyle)
  element.setAttribute('data-color', color)
  return { element }
}
```

**Step 6: createDOM を更新する**

```typescript
override createDOM(_config: EditorConfig): HTMLElement {
  const quoteStyle = $getState(this, quoteStyleState)
  const color = $getState(this, pullQuoteColorState)
  const element = document.createElement('figure')
  element.setAttribute('data-pull-quote', 'true')
  element.setAttribute('data-pull-quote-style', quoteStyle)
  element.setAttribute('data-color', color)
  return element
}
```

**Step 7: updateDOM に color 変化検知を追加する**

```typescript
override updateDOM(prevNode: PullQuoteNode, dom: HTMLElement): boolean {
  const change = $getStateChange(this, prevNode, quoteStyleState)
  if (change) {
    const [newStyle] = change
    dom.setAttribute('data-pull-quote-style', newStyle)
  }
  const colorChange = $getStateChange(this, prevNode, pullQuoteColorState)
  if (colorChange) {
    const [newColor] = colorChange
    dom.setAttribute('data-color', newColor)
  }
  return false
}
```

**Step 8: `$createPullQuoteNode` を更新する**

```typescript
export function $createPullQuoteNode(
  quoteStyle: PullQuoteStyle = "classic",
  color: AccentColor = "default",
): PullQuoteNode {
  return $setState(
    $setState($create(PullQuoteNode), quoteStyleState, quoteStyle),
    pullQuoteColorState,
    color,
  );
}
```

**Step 9: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/PullQuoteNode.tsx
git commit -m "feat(lexical): add pullQuoteColorState (AccentColor) to PullQuoteNode"
```

---

## Task 6: TabsContainerNode.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TabsContainerNode.tsx`

**Step 1: import を追加する**

```typescript
import { isAccentColor, type AccentColor } from "../config/accent-colors";
```

**Step 2: tabsColorState を追加する（State セクション末尾）**

```typescript
export const tabsColorState = createState("tabsColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});
```

**Step 3: `$config()` の stateConfigs を更新する**

```typescript
override $config() {
  return this.config('tabs-container', {
    extends: ElementNode,
    stateConfigs: [
      { flat: true, stateConfig: activeIndexState },
      { flat: true, stateConfig: tabsStyleState },
      { flat: true, stateConfig: tabsSizeState },
      { flat: true, stateConfig: tabsFixedWidthState },
      { flat: true, stateConfig: tabsColorState },
    ],
  })
}
```

**Step 4: `$convertTabsContainerElement` を更新する**

```typescript
function $convertTabsContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const activeAttr = element.getAttribute("data-tabs-active");
  const activeIndex = activeAttr ? parseInt(activeAttr, 10) : 0;
  const styleAttr = element.getAttribute("data-tabs-style");
  const style = styleAttr && isTabsStyle(styleAttr) ? styleAttr : "underline";
  const sizeAttr = element.getAttribute("data-tabs-size");
  const size = sizeAttr && isTabsSize(sizeAttr) ? sizeAttr : "auto";
  const fixedWidthAttr = element.getAttribute("data-tabs-fixed-width");
  const fixedWidth =
    fixedWidthAttr && isTabsFixedWidth(fixedWidthAttr) ? fixedWidthAttr : "120";
  const colorAttr = element.getAttribute("data-color");
  const color = colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";
  const node = $createTabsContainerNode(
    activeIndex,
    style,
    size,
    fixedWidth,
    color,
  );
  return { node };
}
```

**Step 5: exportDOM を更新する**

```typescript
override exportDOM(): DOMExportOutput {
  const activeIndex = $getState(this, activeIndexState)
  const tabsStyle = $getState(this, tabsStyleState)
  const tabsSize = $getState(this, tabsSizeState)
  const fixedWidth = $getState(this, tabsFixedWidthState)
  const color = $getState(this, tabsColorState)
  const element = document.createElement('div')
  element.setAttribute('data-tabs-container', 'true')
  element.setAttribute('data-tabs-active', String(activeIndex))
  element.setAttribute('data-tabs-style', tabsStyle)
  element.setAttribute('data-tabs-size', tabsSize)
  element.setAttribute('data-tabs-fixed-width', fixedWidth)
  element.setAttribute('data-color', color)
  return { element }
}
```

**Step 6: createDOM を更新する**（exportDOM と同じ属性セット）

```typescript
override createDOM(_config: EditorConfig): HTMLElement {
  const activeIndex = $getState(this, activeIndexState)
  const tabsStyle = $getState(this, tabsStyleState)
  const tabsSize = $getState(this, tabsSizeState)
  const fixedWidth = $getState(this, tabsFixedWidthState)
  const color = $getState(this, tabsColorState)
  const element = document.createElement('div')
  element.setAttribute('data-tabs-container', 'true')
  element.setAttribute('data-tabs-active', String(activeIndex))
  element.setAttribute('data-tabs-style', tabsStyle)
  element.setAttribute('data-tabs-size', tabsSize)
  element.setAttribute('data-tabs-fixed-width', fixedWidth)
  element.setAttribute('data-color', color)
  return element
}
```

**Step 7: updateDOM に color 変化検知を追加する**

`fixedWidthChange` の if ブロックの後に追加:

```typescript
const colorChange = $getStateChange(this, prevNode, tabsColorState);
if (colorChange) {
  const [newColor] = colorChange;
  dom.setAttribute("data-color", newColor);
}
```

**Step 8: `$createTabsContainerNode` の引数と実装を更新する**

```typescript
export function $createTabsContainerNode(
  activeIndex: number = 0,
  tabsStyle: TabsStyle = "underline",
  tabsSize: TabsSize = "auto",
  tabsFixedWidth: TabsFixedWidth = "120",
  color: AccentColor = "default",
): TabsContainerNode {
  return $setState(
    $setState(
      $setState(
        $setState(
          $setState($create(TabsContainerNode), activeIndexState, activeIndex),
          tabsStyleState,
          tabsStyle,
        ),
        tabsSizeState,
        tabsSize,
      ),
      tabsFixedWidthState,
      tabsFixedWidth,
    ),
    tabsColorState,
    color,
  );
}
```

**Step 9: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/TabsContainerNode.tsx
git commit -m "feat(lexical): add tabsColorState (AccentColor) to TabsContainerNode"
```

---

## Task 7: CollapsibleContainerNode.tsx を更新する（破壊的変更）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CollapsibleContainerNode.tsx`

**Step 1: import を追加する**

```typescript
import { isAccentColor, type AccentColor } from "../config/accent-colors";
```

**Step 2: Types セクションから CollapsibleTitleColor を完全削除する**

削除対象:

```typescript
// 削除
export type CollapsibleTitleColor = 'default' | 'primary' | 'muted' | 'info' | 'warning' | 'success' | 'error' | 'custom'
export const COLLAPSIBLE_TITLE_COLORS: readonly CollapsibleTitleColor[] = [...]
```

**Step 3: Type Guards セクションから isCollapsibleTitleColor を削除する**

```typescript
// 削除
export const isCollapsibleTitleColor = createEnumGuard<CollapsibleTitleColor>(
  COLLAPSIBLE_TITLE_COLORS,
);
```

**Step 4: State セクションの titleColor 関連 3 state を削除し collapsibleColorState を追加する**

削除対象:

```typescript
// 削除
export const titleColorState = createState('titleColor', { ... })
export const titleCustomColorState = createState('titleCustomColor', { ... })
export const titleCustomLightState = createState('titleCustomLight', { ... })
```

追加:

```typescript
export const collapsibleColorState = createState("collapsibleColor", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});
```

**Step 5: DOM Conversion の `$convertCollapsibleContainerElement` を更新する**

```typescript
function $convertCollapsibleContainerElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const rawStyle = element.getAttribute("data-collapsible-style");
  const style = rawStyle && isCollapsibleStyle(rawStyle) ? rawStyle : "default";
  const rawRadius = element.getAttribute("data-collapsible-radius");
  const radius = rawRadius && isCollapsibleRadius(rawRadius) ? rawRadius : "md";
  const colorAttr = element.getAttribute("data-color");
  const color = colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";

  const node = $createCollapsibleContainerNode(style, radius, color);
  return { node };
}
```

**Step 6: DOM Helpers セクションの `applyTitleColorToDOM` 関数を完全削除する**

**Step 7: `$config()` の stateConfigs を更新する**

```typescript
override $config() {
  return this.config('collapsible-container', {
    extends: ElementNode,
    stateConfigs: [
      { flat: true, stateConfig: collapsibleStyleState },
      { flat: true, stateConfig: borderRadiusState },
      { flat: true, stateConfig: collapsibleColorState },
    ],
  })
}
```

**Step 8: exportDOM を更新する**

```typescript
override exportDOM(): DOMExportOutput {
  const style = $getState(this, collapsibleStyleState)
  const radius = $getState(this, borderRadiusState)
  const color = $getState(this, collapsibleColorState)
  const element = document.createElement('div')
  element.setAttribute('data-collapsible-container', 'true')
  element.setAttribute('data-collapsible-style', style)
  element.setAttribute('data-collapsible-radius', radius)
  element.setAttribute('data-color', color)
  return { element }
}
```

**Step 9: createDOM を更新する**

```typescript
override createDOM(_config: EditorConfig): HTMLElement {
  const style = $getState(this, collapsibleStyleState)
  const radius = $getState(this, borderRadiusState)
  const color = $getState(this, collapsibleColorState)
  const element = document.createElement('div')
  element.setAttribute('data-collapsible-container', 'true')
  element.setAttribute('data-collapsible-style', style)
  element.setAttribute('data-collapsible-radius', radius)
  element.setAttribute('data-color', color)
  return element
}
```

**Step 10: updateDOM を更新する**

```typescript
override updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLElement): boolean {
  const styleChange = $getStateChange(this, prevNode, collapsibleStyleState)
  if (styleChange) {
    const [newStyle] = styleChange
    dom.setAttribute('data-collapsible-style', newStyle)
  }
  const radiusChange = $getStateChange(this, prevNode, borderRadiusState)
  if (radiusChange) {
    const [newRadius] = radiusChange
    dom.setAttribute('data-collapsible-radius', newRadius)
  }
  const colorChange = $getStateChange(this, prevNode, collapsibleColorState)
  if (colorChange) {
    const [newColor] = colorChange
    dom.setAttribute('data-color', newColor)
  }
  return false
}
```

**Step 11: Factory Functions を更新する**

```typescript
export function $createCollapsibleContainerNode(
  style: CollapsibleStyle = "default",
  radius: CollapsibleRadius = "md",
  color: AccentColor = "default",
): CollapsibleContainerNode {
  const node = $create(CollapsibleContainerNode);
  $setState(node, collapsibleStyleState, style);
  $setState(node, borderRadiusState, radius);
  $setState(node, collapsibleColorState, color);
  return node;
}
```

**Step 12: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/nodes/CollapsibleContainerNode.tsx
git commit -m "feat(lexical)!: replace titleColor 3-state with collapsibleColorState (AccentColor) in CollapsibleContainerNode"
```

---

## Task 8: StepsInspectorPanel.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/StepsInspectorPanel.tsx`

**Step 1: import に stepsColorState と isAccentColor を追加する**

```typescript
import {
  $isStepsContainerNode,
  type StepsContainerNode,
  STEPS_STYLES,
  STEPS_SHAPES,
  STEPS_FILLS,
  stepsStyleState,
  stepsLabelState,
  stepsShapeState,
  startNumberState,
  stepsFillState,
  stepsColorState,
  isStepsStyle,
  isStepsShape,
  isStepsFill,
} from "../../nodes/StepsContainerNode";
import { isAccentColor, type AccentColor } from "../../config/accent-colors";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
```

**Step 2: editor.getEditorState().read() の read 内に color 読み取りを追加する**

既存の read ブロック内の return 文を更新して `currentColor` を追加:

```typescript
const {
  currentStyle,
  currentLabel,
  currentShape,
  currentStartNumber,
  currentFill,
  currentColor,
  stepItems,
} = editor.getEditorState().read(() => {
  // ...（既存コード）...
  const color = $getState(node, stepsColorState);
  return {
    // ...（既存フィールド）...
    currentColor: color,
    stepItems: items,
  };
});
```

**Step 3: handleColorChange ハンドラを追加する**

既存のハンドラ群の後に追加:

```typescript
const handleColorChange = (color: AccentColor) => {
  updateNode((n) => {
    $setState(n, stepsColorState, color);
  });
};
```

**Step 4: JSX の「スタイル」セクションに ColorSwatchPicker を追加する**

ステップスタイルの Select コントロールの後（または前）に追加:

```tsx
<ColorSwatchPicker value={currentColor} onChange={handleColorChange} />
```

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/StepsInspectorPanel.tsx
git commit -m "feat(lexical): add ColorSwatchPicker to StepsInspectorPanel"
```

---

## Task 9: PullQuoteInspectorPanel.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/PullQuoteInspectorPanel.tsx`

**Step 1: import に pullQuoteColorState と ColorSwatchPicker を追加する**

```typescript
import {
  $isPullQuoteNode,
  type PullQuoteNode,
  PULL_QUOTE_STYLES,
  quoteStyleState,
  pullQuoteColorState,
  isPullQuoteStyle,
} from "../../nodes/PullQuoteNode";
import { isAccentColor, type AccentColor } from "../../config/accent-colors";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
```

**Step 2: read ブロックに color を追加する**

```typescript
const { currentStyle, currentColor } = editor.getEditorState().read(() => {
  const style = $getState(node, quoteStyleState);
  const color = $getState(node, pullQuoteColorState);
  return { currentStyle: style, currentColor: color };
});
```

**Step 3: handleColorChange を追加する**

```typescript
const handleColorChange = (color: AccentColor) => {
  updateNode((n) => {
    $setState(n, pullQuoteColorState, color);
  });
};
```

**Step 4: JSX に ColorSwatchPicker を追加する**

スタイル Select の後に追加:

```tsx
<ColorSwatchPicker value={currentColor} onChange={handleColorChange} />
```

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/PullQuoteInspectorPanel.tsx
git commit -m "feat(lexical): add ColorSwatchPicker to PullQuoteInspectorPanel"
```

---

## Task 10: TabsInspectorPanel.tsx を更新する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/TabsInspectorPanel.tsx`

**Step 1: import に tabsColorState と ColorSwatchPicker を追加する**

```typescript
import {
  $isTabsContainerNode,
  type TabsContainerNode,
  activeIndexState,
  TABS_STYLES,
  TABS_SIZES,
  TABS_FIXED_WIDTHS,
  isTabsStyle,
  isTabsSize,
  isTabsFixedWidth,
  tabsStyleState,
  tabsSizeState,
  tabsFixedWidthState,
  tabsColorState,
} from "../../nodes/TabsContainerNode";
import { isAccentColor, type AccentColor } from "../../config/accent-colors";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
```

**Step 2: read ブロックに tabsColor を追加する**

```typescript
const {
  activeIndex,
  tabsStyle,
  tabsSize,
  tabsFixedWidth,
  tabsColor,
  tabItems,
} = editor.getEditorState().read(() => {
  // ...（既存コード）...
  const color = $getState(node, tabsColorState);
  return {
    // ...（既存フィールド）...
    tabsColor: color,
    tabItems: items,
  };
});
```

**Step 3: handleColorChange を追加する**

```typescript
const handleColorChange = (color: AccentColor) => {
  updateNode((n) => {
    $setState(n, tabsColorState, color);
  });
};
```

**Step 4: JSX の「スタイル」セクションに ColorSwatchPicker を追加する**

`{tabsSize === 'fixed' && ...}` ブロックの後に追加:

```tsx
<ColorSwatchPicker value={tabsColor} onChange={handleColorChange} />
```

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/TabsInspectorPanel.tsx
git commit -m "feat(lexical): add ColorSwatchPicker to TabsInspectorPanel"
```

---

## Task 11: CollapsibleInspectorPanel.tsx を更新する（破壊的変更）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/inspector/panels/CollapsibleInspectorPanel.tsx`

**Step 1: import を全面的に更新する**

旧 import:

```typescript
import {
  $isCollapsibleContainerNode,
  type CollapsibleContainerNode,
  COLLAPSIBLE_STYLES,
  COLLAPSIBLE_RADII,
  COLLAPSIBLE_TITLE_COLORS,
  collapsibleStyleState,
  borderRadiusState,
  titleColorState,
  titleCustomColorState,
  titleCustomLightState,
  isCollapsibleStyle,
  isCollapsibleRadius,
  isCollapsibleTitleColor,
} from "../../nodes/CollapsibleContainerNode";
import {
  COLLAPSIBLE_STYLE_LABELS,
  COLLAPSIBLE_RADIUS_LABELS,
  COLLAPSIBLE_TITLE_COLOR_LABELS,
} from "../../config/node-labels";
import { Label, Input, Switch } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
```

新 import:

```typescript
import {
  $isCollapsibleContainerNode,
  type CollapsibleContainerNode,
  COLLAPSIBLE_STYLES,
  COLLAPSIBLE_RADII,
  collapsibleStyleState,
  borderRadiusState,
  collapsibleColorState,
  isCollapsibleStyle,
  isCollapsibleRadius,
} from "../../nodes/CollapsibleContainerNode";
import {
  COLLAPSIBLE_STYLE_LABELS,
  COLLAPSIBLE_RADIUS_LABELS,
} from "../../config/node-labels";
import { isAccentColor, type AccentColor } from "../../config/accent-colors";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
```

**Step 2: read ブロックを更新する**

```typescript
const { currentStyle, currentRadius, currentColor, collapsibleItems } = editor
  .getEditorState()
  .read(() => {
    const style = $getState(node, collapsibleStyleState);
    const radius = $getState(node, borderRadiusState);
    const color = $getState(node, collapsibleColorState);
    const items: CollapsibleItemInfo[] = [];
    const children = node.getChildren();

    for (const child of children) {
      if ($isCollapsibleItemNode(child)) {
        const titleNode = child.getChildren().find($isCollapsibleTitleNode);
        items.push({
          key: child.getKey(),
          titleText: titleNode ? titleNode.getTextContent() : "",
        });
      }
    }

    return {
      currentStyle: style,
      currentRadius: radius,
      currentColor: color,
      collapsibleItems: items,
    };
  });
```

**Step 3: ハンドラを更新する**

削除するハンドラ: `handleTitleColorChange`, `handleCustomColorChange`, `handleCustomLightChange`

追加するハンドラ:

```typescript
const handleColorChange = (color: AccentColor) => {
  updateNode((n) => {
    $setState(n, collapsibleColorState, color);
  });
};
```

**Step 4: JSX の「スタイル」セクションを更新する**

旧 JSX（タイトル背景色 Select + カスタムカラー input + Switch）を削除し、ColorSwatchPicker に置き換える:

```tsx
<InspectorSection title="スタイル">
  <div className="space-y-3">
    <div className="space-y-2">
      <Label className="text-xs">種類</Label>
      <Select value={currentStyle} onValueChange={handleStyleChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COLLAPSIBLE_STYLES.map((style) => (
            <SelectItem key={style} value={style}>
              {COLLAPSIBLE_STYLE_LABELS[style]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label className="text-xs">角丸</Label>
      <Select value={currentRadius} onValueChange={handleRadiusChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COLLAPSIBLE_RADII.map((radius) => (
            <SelectItem key={radius} value={radius}>
              {COLLAPSIBLE_RADIUS_LABELS[radius]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <ColorSwatchPicker
      value={currentColor}
      onChange={handleColorChange}
      label="タイトル背景色"
    />
  </div>
</InspectorSection>
```

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/lexical/inspector/panels/CollapsibleInspectorPanel.tsx
git commit -m "feat(lexical)!: replace title color controls with ColorSwatchPicker in CollapsibleInspectorPanel"
```

---

## Task 12: lexical-content.css を更新する

**Files:**

- Modify: `src/shared/styles/lexical-content.css`

### Step 1: [data-color] トークン定義をファイル先頭付近に追加する

`@import "tailwindcss";` の後、ブロックスタイルの前に追加（Steps セクションの直前）:

```css
/* =============================================================================
   Accent Color Tokens
   data-color 属性を持つ任意のブロックに適用。
   --accent / --accent-fg を子要素が継承して使用する。
   ============================================================================= */

[data-color="default"] {
  --accent: var(--color-primary);
  --accent-fg: var(--color-primary-foreground);
}
[data-color="blue"] {
  --accent: oklch(0.55 0.2 255);
  --accent-fg: oklch(1 0 0);
}
[data-color="teal"] {
  --accent: oklch(0.6 0.15 195);
  --accent-fg: oklch(1 0 0);
}
[data-color="green"] {
  --accent: oklch(0.58 0.18 142);
  --accent-fg: oklch(1 0 0);
}
[data-color="yellow"] {
  --accent: oklch(0.82 0.17 90);
  --accent-fg: oklch(0.15 0 0);
}
[data-color="orange"] {
  --accent: oklch(0.72 0.18 55);
  --accent-fg: oklch(1 0 0);
}
[data-color="red"] {
  --accent: oklch(0.55 0.22 25);
  --accent-fg: oklch(1 0 0);
}
[data-color="pink"] {
  --accent: oklch(0.65 0.22 350);
  --accent-fg: oklch(1 0 0);
}
[data-color="purple"] {
  --accent: oklch(0.55 0.2 300);
  --accent-fg: oklch(1 0 0);
}
[data-color="slate"] {
  --accent: oklch(0.52 0.02 250);
  --accent-fg: oklch(1 0 0);
}
```

### Step 2: Steps ブロックの var(--color-primary) を var(--accent, ...) に一括置換する

以下の置換を行う（Steps セクション内のみ、`[data-steps` セレクターが含まれる箇所）:

| 置換前                                                       | 置換後                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `background-color: var(--color-primary);` （Steps 内）       | `background-color: var(--accent, var(--color-primary));`                    |
| `color: var(--color-primary-foreground);` （Steps 内）       | `color: var(--accent-fg, var(--color-primary-foreground));`                 |
| `color: var(--color-primary)` （Steps 内 icon/outline）      | `color: var(--accent, var(--color-primary))`                                |
| `border: 2px solid var(--color-primary)`                     | `border: 2px solid var(--accent, var(--color-primary))`                     |
| `color-mix(in oklch, var(--color-primary) 20%, transparent)` | `color-mix(in oklch, var(--accent, var(--color-primary)) 20%, transparent)` |
| `color-mix(in oklch, var(--color-primary) 15%, transparent)` | `color-mix(in oklch, var(--accent, var(--color-primary)) 15%, transparent)` |
| `color-mix(in oklch, var(--color-primary) 10%, transparent)` | `color-mix(in oklch, var(--accent, var(--color-primary)) 10%, transparent)` |
| `color-mix(in oklch, var(--color-primary) 8%, transparent)`  | `color-mix(in oklch, var(--accent, var(--color-primary)) 8%, transparent)`  |

### Step 3: Collapsible ブロックの [data-collapsible-title-color] ルール群を削除し filled スタイルに accent を追加する

1. `[data-collapsible-title-color=...]` セレクターを含む全ルールブロックを削除する
2. `[data-collapsible-container][data-collapsible-style="filled"]` ルールの `var(--color-primary)` を `var(--accent, var(--color-primary))` に置換する

### Step 4: Tabs ブロックの underline スタイルに accent を追加する

```css
/* 置換前 */
[data-tabs-container][data-tabs-style="underline"]
  [data-tab-title][aria-selected="true"] {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
}

/* 置換後 */
[data-tabs-container][data-tabs-style="underline"]
  [data-tab-title][aria-selected="true"] {
  border-bottom-color: var(--accent, var(--color-primary));
  color: var(--accent, var(--color-primary));
}
```

### Step 5: PullQuote ブロックに accent を追加する

```css
/* classic style - border-left */
/* 置換前 */
[data-pull-quote][data-pull-quote-style="classic"] {
  border-left-color: var(--color-primary);
}
/* 置換後 */
[data-pull-quote][data-pull-quote-style="classic"] {
  border-left-color: var(--accent, var(--color-primary));
}

/* modern style - borders と gradient */
/* var(--color-primary) → var(--accent, var(--color-primary)) に置換 */
```

**Step 6: コミット**

```bash
git add src/shared/styles/lexical-content.css
git commit -m "feat(lexical): add [data-color] accent tokens, update all blocks to use var(--accent)"
```

---

## Task 13: 型チェックと Lint 検証を実行する

**Step 1: validate を実行する**

```bash
bun run validate
```

Expected: 型エラーなし、lint エラーなし

**Step 2: エラーがある場合は修正する**

よくあるエラー:

- `CollapsibleTitleColor` が他ファイルで import されている場合 → `AccentColor` に変更
- `isCollapsibleTitleColor` が他ファイルで使われている場合 → `isAccentColor` に変更
- `titleColorState` / `titleCustomColorState` / `titleCustomLightState` が他ファイルで参照されている場合 → 削除または `collapsibleColorState` に変更

**Step 3: 修正後に再度 validate**

```bash
bun run validate
```

Expected: all pass

**Step 4: コミット**

```bash
git add -A
git commit -m "fix(lexical): resolve type errors from CollapsibleTitleColor removal"
```

---

## 実装完了後の確認事項

- [ ] Steps ブロック: インスペクタパネルでカラー選択後、プレビューのバッジ色が変わる
- [ ] PullQuote ブロック: インスペクタパネルでカラー選択後、ボーダー/グラデーション色が変わる
- [ ] Tabs ブロック（underline スタイル）: インスペクタパネルでカラー選択後、アクティブタブのアンダーライン色が変わる
- [ ] Collapsible ブロック（filled スタイル）: インスペクタパネルでカラー選択後、タイトルバー色が変わる
- [ ] `default` を選択すると CSS テーマのプライマリカラーが適用される
- [ ] `bun run validate` がエラーなしで完了する
