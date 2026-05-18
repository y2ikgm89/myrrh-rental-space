# Type Safety §3/§6 Cast ゼロ化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `assertion-bans.md` §3 SectionConfig union widening (1 件) と §6 conform FieldMetadata invariance (13 件) をゼロ化し、許可例外 7 → 6 種類に縮減する。

**Architecture:**

- §3: `validateSectionConfig` の generic narrowing で cast 構造解消 (1 → 0 件)。`registry.ts` の `definitions` を `as const satisfies` で型付け、`isSectionTypeKey` 型ガード経由で safeParse 結果が SectionConfig union に subtype 包含される設計
- §6: 新規 SSoT `@/shared/lib/conform/typed-input-control` に 4 helper を作成し、boundary cast を helper 内部の 1 line に閉じ込め (呼び出し側 13 → 0 件、helper 内部 4 件のみ)
- `__tests__/unit/architecture-boundaries.test.ts` に §3 / §6 gate 追加で永続的に regression を遮断

**Tech Stack:** TypeScript 6.0 / Zod 4.3 / @conform-to/react / @conform-to/zod/v4 / Bun Test / Next.js 16.2

---

## File Structure

### 新規ファイル

- `src/shared/lib/conform/typed-input-control.ts` — 4 helper SSoT (useTypedInputControl / getTypedFieldList / getTypedFieldset / asTypedField)
- `__tests__/unit/lib/conform/typed-input-control.test.ts` — helper smoke test (戻り値が underlying conform API と互換であることの確認、cast 自体の構造的正しさは TypeScript 6.0 が保証)

### 既存ファイル修正

- `src/shared/lib/sections/registry.ts` — `definitions` を `Record<string, SectionDefinition>` から `as const satisfies` 化、`isSectionTypeKey` + 改修した `getSectionDefinition` 追加、`registerSectionDefinition` 削除
- `src/shared/lib/validations/section.ts` — `validateSectionConfig` の cast 削除 + `isSectionTypeKey` 経由 narrowing
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` — 5 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx` — 2 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx` — 2 件置換
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx` — 1 件置換
- `__tests__/unit/architecture-boundaries.test.ts` — §6 / §3 gate 2 件追加
- `.claude/rules/type-safety/assertion-bans.md` — §3 完全削除 + §6 改訂
- `CLAUDE.md` — 許可例外 7 → 6 種類
- `.claude/rules/ssot-singletons.md` — typed-input-control SSoT 追記

---

## Phase 1: §6 typed-input-control helper SSoT 作成

### Task 1: typed-input-control.ts helper 作成

**Files:**

- Create: `src/shared/lib/conform/typed-input-control.ts`
- Create: `__tests__/unit/lib/conform/typed-input-control.test.ts`

- [ ] **Step 1: helper ファイル作成**

`src/shared/lib/conform/typed-input-control.ts` を以下の内容で作成:

```typescript
import { useInputControl, type FieldMetadata } from "@conform-to/react";

/**
 * `useInputControl` の generic invariance 境界を helper 内に閉じ込めた typed wrapper。
 *
 * conform `FieldMetadata<T>` は TypeScript 仕様上 invariant のため、
 * 動的 schema (22 種類の Section type) や Pure Component 越境で
 * `FieldMetadata<unknown>` → `FieldMetadata<T>` の boundary cast が必要となる。
 * 本 helper は cast を 1 line に集約し、呼び出し側の cast を排除する。
 *
 * ledger §6 conform `FieldMetadata<T>` generic invariance の唯一の許可場所。
 * helper 外部で `as unknown as FieldMetadata<...>` を書くことは禁止。
 * 検知は `__tests__/unit/architecture-boundaries.test.ts` の grep gate。
 */
export function useTypedInputControl<T>(
  field: FieldMetadata<unknown>,
): ReturnType<typeof useInputControl<T>> {
  // §6 generic invariance — 唯一の境界 cast
  return useInputControl(field as unknown as FieldMetadata<T>);
}

/**
 * `FieldMetadata<T[]>.getFieldList()` の generic invariance 境界を helper 内に閉じ込める。
 *
 * 動的 schema (22 種の Section type の AutoArrayField) で配列要素を反復する際、
 * `FieldMetadata<unknown>` → `FieldMetadata<unknown[]>` の boundary cast が必要となる。
 */
export function getTypedFieldList<T>(
  field: FieldMetadata<unknown>,
): ReadonlyArray<FieldMetadata<T>> {
  // §6 generic invariance — 唯一の境界 cast
  return (field as unknown as FieldMetadata<T[]>).getFieldList();
}

/**
 * `FieldMetadata<Record<string, T>>.getFieldset()` の generic invariance 境界を helper 内に閉じ込める。
 *
 * 動的 schema (AutoGroupField / AutoArrayField の item fieldset) で object を分解する際、
 * `FieldMetadata<unknown>` → `FieldMetadata<Record<string, unknown>>` の boundary cast が必要となる。
 */
export function getTypedFieldset<T extends Record<string, unknown>>(
  field: FieldMetadata<unknown>,
): { readonly [K in keyof T]: FieldMetadata<T[K]> } {
  // §6 generic invariance — 唯一の境界 cast
  return (field as unknown as FieldMetadata<T>).getFieldset();
}

/**
 * Connected wrapper パターンで Pure Component に「型注釈付き FieldMetadata」を渡したいときの helper。
 * cast を helper 内に閉じ込めて呼び出し側の cast を排除する。
 *
 * 用途: `tagsField={asTypedField<string[]>(ctx.fields.tags)}` のような prop 配送境界。
 */
export function asTypedField<T>(
  field: FieldMetadata<unknown>,
): FieldMetadata<T> {
  // §6 generic invariance — 唯一の境界 cast
  return field as unknown as FieldMetadata<T>;
}
```

- [ ] **Step 2: smoke test 作成**

`__tests__/unit/lib/conform/typed-input-control.test.ts` を以下の内容で作成:

```typescript
import { describe, test, expect } from "bun:test";
import {
  useTypedInputControl,
  getTypedFieldList,
  getTypedFieldset,
  asTypedField,
} from "@/shared/lib/conform/typed-input-control";

describe("typed-input-control helper SSoT", () => {
  test("4 helper が全て関数として export されている", () => {
    expect(typeof useTypedInputControl).toBe("function");
    expect(typeof getTypedFieldList).toBe("function");
    expect(typeof getTypedFieldset).toBe("function");
    expect(typeof asTypedField).toBe("function");
  });

  test("asTypedField は同じ参照を返す (型注釈のみ変換、ランタイム no-op)", () => {
    const field = { name: "test", value: "x" } as unknown as Parameters<
      typeof asTypedField
    >[0];
    expect(asTypedField(field)).toBe(field);
  });

  test("getTypedFieldList は underlying field.getFieldList() を委譲する", () => {
    const expected = [{ id: "1" }];
    const field = {
      getFieldList: () => expected,
    } as unknown as Parameters<typeof getTypedFieldList>[0];
    expect(getTypedFieldList(field)).toBe(expected);
  });

  test("getTypedFieldset は underlying field.getFieldset() を委譲する", () => {
    const expected = { a: { id: "1" }, b: { id: "2" } };
    const field = {
      getFieldset: () => expected,
    } as unknown as Parameters<typeof getTypedFieldset>[0];
    expect(getTypedFieldset(field)).toBe(expected);
  });
});
```

- [ ] **Step 3: test を実行して PASS 確認**

Run: `bun test __tests__/unit/lib/conform/typed-input-control.test.ts`

Expected output:

```text
 4 pass
 0 fail
```

- [ ] **Step 4: type-check 確認**

Run: `bun run type-check`

Expected: exit 0 (`.next/dev/types` 内のノイズは無視、source の error 0)

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/conform/typed-input-control.ts \
        __tests__/unit/lib/conform/typed-input-control.test.ts
git commit -m "$(cat <<'EOF'
feat(type-safety): typed-input-control helper SSoT 追加 (§6 cast 集約用)

useTypedInputControl / getTypedFieldList / getTypedFieldset / asTypedField の
4 helper を新設。各 helper 内部の 1 line に boundary cast を閉じ込めることで
呼び出し側の `as unknown as FieldMetadata<...>` を排除する準備。
EOF
)"
```

---

### Task 2: architecture-boundaries.test.ts に §6 / §3 gate 追加 (RED)

**Files:**

- Modify: `__tests__/unit/architecture-boundaries.test.ts` (末尾に describe block 追加)

- [ ] **Step 1: 既存 test ファイル末尾に gate 追加**

`__tests__/unit/architecture-boundaries.test.ts` の最後に以下の describe を追加 (既存 describe の閉じ `});` の後に挿入):

```typescript
describe("assertion-bans §6 conform FieldMetadata generic invariance gate", () => {
  test("§6 FieldMetadata cast は typed-input-control helper 内部のみ許可", () => {
    const SRC_GLOB = new Bun.Glob("**/*.{ts,tsx}");
    const ALLOWED_FILE = join(
      SRC_ROOT,
      "shared",
      "lib",
      "conform",
      "typed-input-control.ts",
    );
    const PATTERN = /as\s+unknown\s+as\s+FieldMetadata\b/;
    const offenders: string[] = [];
    for (const rel of SRC_GLOB.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      if (abs === ALLOWED_FILE) continue;
      const content = readFileSync(abs, "utf-8");
      if (PATTERN.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);
});

describe("assertion-bans §3 SectionConfig union widening cast (構造解消済)", () => {
  test("`as SectionConfig` cast は src/ 全体で 0 件", () => {
    const SRC_GLOB = new Bun.Glob("**/*.{ts,tsx}");
    const PATTERN = /\bas\s+SectionConfig\b/;
    const offenders: string[] = [];
    for (const rel of SRC_GLOB.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      const content = readFileSync(abs, "utf-8");
      if (PATTERN.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);
});
```

- [ ] **Step 2: gate を実行して RED 確認 (まだ実装してないので fail 期待)**

Run: `bun test __tests__/unit/architecture-boundaries.test.ts`

Expected: §6 gate と §3 gate 両方が FAIL (offenders は src 内 13 + 1 = 14 件)。failing output 例:

```text
expect(received).toEqual(expected)
- Expected  - 0
+ Received  + 14
[
+   "src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx",
...
]
```

これは想定通り。実装後に PASS する。

- [ ] **Step 3: commit (RED 状態のまま、後続 task で GREEN にする)**

```bash
git add __tests__/unit/architecture-boundaries.test.ts
git commit -m "$(cat <<'EOF'
test(architecture): §6 FieldMetadata / §3 SectionConfig cast gate 追加 (RED)

helper 集約 + generic narrowing 後に GREEN になる予定。
本 commit 時点では Phase 2-4 未完のため当該 2 gate は FAIL。
EOF
)"
```

---

## Phase 2: §6 cast 13 件 → helper 呼び出し置換

### Task 3: auto-section-form.tsx の 5 件置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` (lines 709 / 749 / 805 / 843 / 885)

- [ ] **Step 1: helper import 追加**

`auto-section-form.tsx` の import 群に以下を追加 (既存 conform import の近くに):

```typescript
import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";
```

`useInputControl` の direct import を削除 (まだ使用箇所が残っているなら別途残す — 本 file では 5 件全て置換するため削除可)。

- [ ] **Step 2: 5 件全てを replace_all で置換**

Edit tool の `replace_all: true` で:

- 旧: `const control = useInputControl(field as unknown as FieldMetadata<string>);`
- 新: `const control = useTypedInputControl<string>(field);`

- [ ] **Step 3: type-check 確認**

Run: `bun run type-check`

Expected: exit 0

- [ ] **Step 4: §6 gate 進捗確認 (8 件残存)**

Run: `bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"`

Expected: まだ FAIL だが offenders 件数が 14 → 9 件 (auto-section-form 5 件減)

- [ ] **Step 5: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx
git commit -m "$(cat <<'EOF'
refactor(type-safety): auto-section-form 5 件の FieldMetadata cast を useTypedInputControl に置換

§6 generic invariance cast を helper SSoT 経由化 (5 件 → 0 件)。
EOF
)"
```

---

### Task 4: AutoSelectField + AutoBooleanField の 2 件置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx` (line 52)
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx` (line 31)

- [ ] **Step 1: AutoSelectField.tsx を編集**

import に追加 + `useInputControl` direct import を削除:

```typescript
import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";
```

line 52 を変更:

- 旧: `const control = useInputControl(field as unknown as FieldMetadata<string>);`
- 新: `const control = useTypedInputControl<string>(field);`

- [ ] **Step 2: AutoBooleanField.tsx を編集**

同じパターンで import 変更 + line 31 を変更:

- 旧: `const control = useInputControl(field as unknown as FieldMetadata<string>);`
- 新: `const control = useTypedInputControl<string>(field);`

`AutoBooleanField.tsx` の line 29-30 にあるコメント (「conform useInputControl は string ベースの FieldMetadata を要求するため境界変換」「(型 ledger §5/§7 と同列の generic invariance 対応、動的 schema 用)」) は削除する (helper 内 docstring に集約済のため不要)。

- [ ] **Step 3: type-check + gate 確認**

Run:

```bash
bun run type-check
bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"
```

Expected: type-check exit 0、gate は offenders 9 → 7 件

- [ ] **Step 4: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx \
        src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx
git commit -m "$(cat <<'EOF'
refactor(type-safety): Auto{Select,Boolean}Field の FieldMetadata cast を useTypedInputControl に置換 (2 件)

§6 generic invariance cast を helper SSoT 経由化。
EOF
)"
```

---

### Task 5: AutoArrayField + AutoGroupField の 3 件置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx` (lines 72, 148)
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx` (line 56)

- [ ] **Step 1: AutoArrayField.tsx を編集**

import に追加:

```typescript
import {
  getTypedFieldList,
  getTypedFieldset,
} from "@/shared/lib/conform/typed-input-control";
```

line 71-73 を変更:

- 旧:

  ```typescript
  // 動的 schema 用の境界変換（getFieldList は FieldMetadata<T[]> 必須）
  const items: ReadonlyArray<FieldMetadata<unknown>> = (
    field as unknown as FieldMetadata<unknown[]>
  ).getFieldList();
  ```

- 新:

  ```typescript
  const items = getTypedFieldList(field);
  ```

line 147-149 を変更:

- 旧:

  ```typescript
  const itemFieldset = (
    itemField as unknown as FieldMetadata<Record<string, unknown>>
  ).getFieldset();
  ```

- 新:

  ```typescript
  const itemFieldset = getTypedFieldset(itemField);
  ```

- [ ] **Step 2: AutoGroupField.tsx を編集**

import に追加:

```typescript
import { getTypedFieldset } from "@/shared/lib/conform/typed-input-control";
```

line 54-57 を変更:

- 旧:

  ```typescript
  // 動的 schema 用の境界変換（getFieldset は FieldMetadata<Record<string, T>> 必須）
  const fieldset = (
    field as unknown as FieldMetadata<Record<string, unknown>>
  ).getFieldset();
  ```

- 新:

  ```typescript
  const fieldset = getTypedFieldset(field);
  ```

- [ ] **Step 3: type-check + gate 確認**

Run:

```bash
bun run type-check
bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"
```

Expected: type-check exit 0、gate offenders 7 → 4 件

- [ ] **Step 4: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx \
        src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx
git commit -m "$(cat <<'EOF'
refactor(type-safety): Auto{Array,Group}Field の FieldMetadata cast を helper に置換 (3 件)

§6 generic invariance cast を getTypedFieldList / getTypedFieldset 経由化。
EOF
)"
```

---

### Task 6: LayoutFields.tsx の 2 件置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx` (lines 149, 154)

- [ ] **Step 1: import 変更**

`useInputControl` の direct import を削除し、`useTypedInputControl` に置換:

```typescript
import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";
```

`FieldMetadata` type import は他箇所 (lines 11, 138 のコメント / Pure Component の prop 型) で残っているため、type-only import は維持。

- [ ] **Step 2: line 149-154 を置換**

- 旧:

  ```typescript
  // generic invariance 境界 cast (§5 conform generic invariance、ledger 登録済)
  const contentWidthField = fields["contentWidth"] as unknown as FieldMetadata<
    string | null | undefined
  >;
  const contentWidthCustomField = fields[
    "contentWidthCustom"
  ] as unknown as FieldMetadata<number | null | undefined>;

  const contentWidthControl = useInputControl(contentWidthField);
  ```

- 新:

  ```typescript
  const contentWidthControl = useTypedInputControl<string | null | undefined>(
    fields["contentWidth"],
  );
  const contentWidthCustomControl = useTypedInputControl<
    number | null | undefined
  >(fields["contentWidthCustom"]);
  ```

注: 既存コードに `const contentWidthCustomControl = useInputControl(contentWidthCustomField);` の行が別途存在する場合、それも統合する。Read で確認してから Edit。

- [ ] **Step 3: コメント整理**

line 9-13 と line 134-140 の JSDoc 内「`as FieldMetadata<...>` cast は assertion-bans.md §5 conform generic invariance の例外区分」は更新する:

- 旧: `... の例外区分。`
- 新: `... の境界 cast を useTypedInputControl helper 内に閉じ込め済 (assertion-bans.md §6)。`

- [ ] **Step 4: type-check + gate 確認**

Run:

```bash
bun run type-check
bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"
```

Expected: type-check exit 0、gate offenders 4 → 2 件

- [ ] **Step 5: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx
git commit -m "$(cat <<'EOF'
refactor(type-safety): LayoutFields の FieldMetadata cast 2 件を useTypedInputControl に置換

contentWidth / contentWidthCustom の境界 cast を helper SSoT 経由化。
JSDoc も §6 cast 集約後の最新状態に追従。
EOF
)"
```

---

### Task 7: content-types/post.tsx の 1 件置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx` (line 92)

- [ ] **Step 1: import 追加**

```typescript
import { asTypedField } from "@/shared/lib/conform/typed-input-control";
```

- [ ] **Step 2: line 89-93 を置換**

- 旧:

  ```tsx
  {
    /* documented exception §5 conform generic invariance:
            // tags は preprocess input 型が unknown のため境界 cast。 */
  }
  tagsField={ctx.fields.tags as unknown as FieldMetadata<string[]>}
  ```

- 新:

  ```tsx
  tagsField={asTypedField<string[]>(ctx.fields.tags)}
  ```

旧コメント 2 行は削除 (helper 内 docstring + ledger §6 に集約済)。

- [ ] **Step 3: type-check + gate 確認**

Run:

```bash
bun run type-check
bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"
```

Expected: type-check exit 0、**gate offenders 2 → 0 件で PASS**

```text
 1 pass
 0 fail
```

- [ ] **Step 4: commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx
git commit -m "$(cat <<'EOF'
refactor(type-safety): post.tsx の tagsField cast を asTypedField に置換 (§6 完遂)

ctx.fields.tags の Pure Component 越境 cast を asTypedField<string[]> 経由化。
§6 gate が呼び出し側 cast 0 件で GREEN になる (helper 内部 4 件のみ残存)。
EOF
)"
```

---

## Phase 3: §6 全体検証

### Task 8: §6 gate GREEN 最終確認

- [ ] **Step 1: §6 cast strict grep で 0 件 (helper 内除外)**

Run:

```bash
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'src/shared/lib/conform/typed-input-control.ts'
```

Expected: 0 件 (helper 以外で hit なし)

- [ ] **Step 2: §6 gate test 単独 PASS 確認**

Run:

```bash
bun test __tests__/unit/architecture-boundaries.test.ts -t "§6 FieldMetadata cast"
```

Expected:

```text
 1 pass
 0 fail
```

- [ ] **Step 3: commit 不要 (検証のみ)**

---

## Phase 4: §3 SectionConfig union widening 構造解消

### Task 9: registry.ts の definitions を as const satisfies 化

**Files:**

- Modify: `src/shared/lib/sections/registry.ts`

- [ ] **Step 1: registerSectionDefinition の caller 確認**

Run:

```bash
grep -rn 'registerSectionDefinition' src/ __tests__/
```

Expected: `src/shared/lib/sections/registry.ts` 内 (定義のみ) と spec 内のみ。caller 0 件であれば安全に削除可能。caller がある場合は本 task を中断して spec を更新。

- [ ] **Step 2: definitions の型定義変更 + isSectionTypeKey 追加 + registerSectionDefinition 削除**

`registry.ts` の以下の差分:

- 旧 (line 60):

  ```typescript
  const definitions: Record<string, SectionDefinition> = {
    "page-hero": {
      /* ... */
    },
    // ... 22 entry
  };
  ```

- 新:

  ```typescript
  const definitions = {
    "page-hero": {
      type: "page-hero",
      configSchema: pageHeroConfigSchema,
      metadata: pageHeroMetadata,
    },
    hero: {
      type: "hero",
      configSchema: heroConfigSchema,
      metadata: heroMetadata,
    },
    // ... 既存 22 entry をそのまま (型注釈のみ変更)
  } as const satisfies Record<string, SectionDefinition>;

  /** 全 section type の定義 map (typeof definitions 経由で literal key 保持) */
  export type SectionDefinitionMap = typeof definitions;

  /** 既存 section type の literal union (`"hero" | "hero-parallax" | ...`) */
  export type SectionTypeKey = keyof SectionDefinitionMap;

  const SECTION_TYPE_KEY_SET = new Set<string>(Object.keys(definitions));

  /**
   * type 文字列が登録済みの section type かを判定する型ガード。
   * `validateSectionConfig` で SectionConfig union への narrowing に使用。
   */
  export function isSectionTypeKey(type: string): type is SectionTypeKey {
    return SECTION_TYPE_KEY_SET.has(type);
  }
  ```

- 既存 `getSectionDefinition` (line 181-185) を以下に置換:

  ```typescript
  export function getSectionDefinition(
    type: string,
  ): SectionDefinition | undefined {
    return isSectionTypeKey(type) ? definitions[type] : undefined;
  }
  ```

- 既存 `registerSectionDefinition` (line 263-265) を **削除**:

  ```typescript
  // 削除対象:
  // export function registerSectionDefinition(def: SectionDefinition): void {
  //   definitions[def.type] = def;
  // }
  ```

- [ ] **Step 3: definitions を validations/section.ts から import できるよう export**

`registry.ts` の export 末尾に追加 (definitions 自体を export):

```typescript
export { definitions as sectionDefinitions };
```

`validateSectionConfig` 内で直接 lookup できるようにする。

- [ ] **Step 4: type-check 確認**

Run: `bun run type-check`

Expected: exit 0 (no caller 削除済 + as const satisfies の compile 成功確認)

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/sections/registry.ts
git commit -m "$(cat <<'EOF'
refactor(type-safety): sections/registry definitions を as const satisfies + isSectionTypeKey 型ガード化

§3 SectionConfig union widening cast 排除の前段。
- definitions を `Record<string, SectionDefinition>` 注釈 → `as const satisfies` 化
- SectionDefinitionMap / SectionTypeKey 型 export
- isSectionTypeKey 型ガード追加 (Set-based)
- getSectionDefinition を型ガード経由に改修
- registerSectionDefinition は caller 0 件のため削除 (dead code)
EOF
)"
```

---

### Task 10: validations/section.ts の validateSectionConfig cast 削除

**Files:**

- Modify: `src/shared/lib/validations/section.ts` (lines 238-254)

- [ ] **Step 1: import 追加**

`section.ts` の import 群に以下を追加:

```typescript
import {
  isSectionTypeKey,
  sectionDefinitions,
} from "@/shared/lib/sections/registry";
```

既存の `getSectionDefinition` import は維持 (他で使われている可能性のため Read で確認後判断)。

- [ ] **Step 2: validateSectionConfig を rewrite**

- 旧 (line 238-254):

  ```typescript
  export function validateSectionConfig(
    type: string,
    config: unknown,
  ):
    | { success: true; data: SectionConfig }
    | { success: false; error: z.ZodError } {
    const def = getSectionDefinition(type);
    if (!def) {
      return { success: false, error: new z.ZodError([]) };
    }
    const result = def.configSchema.safeParse(config);
    if (result.success) {
      return { success: true, data: result.data as SectionConfig };
    }
    return { success: false, error: result.error };
  }
  ```

- 新:

  ```typescript
  /**
   * type に応じた config を canonical schema で検証する。
   *
   * isSectionTypeKey で string を SectionTypeKey に narrowing することで、
   * `sectionDefinitions[type].configSchema.safeParse()` の戻り値型が全 22 schema の
   * output union (= SectionConfig) に推論される。as cast 不要。
   */
  export function validateSectionConfig(
    type: string,
    config: unknown,
  ):
    | { success: true; data: SectionConfig }
    | { success: false; error: z.ZodError } {
    if (!isSectionTypeKey(type)) {
      return { success: false, error: new z.ZodError([]) };
    }
    const def = sectionDefinitions[type];
    const result = def.configSchema.safeParse(config);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }
  ```

- [ ] **Step 3: type-check 確認**

Run: `bun run type-check`

Expected: exit 0 (型 narrowing が成功して cast なしで SectionConfig 型に推論される)

失敗時の対処: `sectionDefinitions[type]` で union member の `configSchema` 型が `SectionDefinition["configSchema"]` (wider) になる場合、`as SectionConfig` 排除が成立しない。その場合は `SectionDefinitionMap[T extends SectionTypeKey]` の concrete schema 型を保持するため、`validateSectionConfig` 自体を generic 化する fallback パターンに切替:

```typescript
function validateForType<T extends SectionTypeKey>(
  type: T,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  const def = sectionDefinitions[type];
  const result = def.configSchema.safeParse(config);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}

export function validateSectionConfig(
  type: string,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  if (!isSectionTypeKey(type)) {
    return { success: false, error: new z.ZodError([]) };
  }
  return validateForType(type, config);
}
```

このパターンで generic constraint が SectionConfig union への subtype 包含を成立させる。

- [ ] **Step 4: §3 gate 確認**

Run:

```bash
bun test __tests__/unit/architecture-boundaries.test.ts -t "§3 SectionConfig"
```

Expected: PASS (`as SectionConfig` cast が src/ 全体で 0 件)

- [ ] **Step 5: commit**

```bash
git add src/shared/lib/validations/section.ts
git commit -m "$(cat <<'EOF'
refactor(type-safety): validateSectionConfig の `as SectionConfig` cast 排除 (§3 完遂)

isSectionTypeKey 型ガードで string を SectionTypeKey に narrowing し、
sectionDefinitions[type].configSchema.safeParse() の戻り値が
全 22 schema の output union (SectionConfig) に推論される構造に。
許可例外 §3 が 1 件 → 0 件達成。
EOF
)"
```

---

## Phase 5: ledger / docs 更新

### Task 11: type-safety/assertion-bans.md §3 削除 + §6 改訂

**Files:**

- Modify: `.claude/rules/type-safety/assertion-bans.md`

- [ ] **Step 1: §3 セクションを完全削除**

`assertion-bans.md` の `### 3. SectionConfig union widening` セクション (おそらく `### 3.` で始まり次の `### 4.` の直前まで) を削除。

その後の例外番号 (§4 / §5 / §6 / §7) を `### 3. / ### 4. / ### 5. / ### 6.` に renumber する (置換例: `### 4. keysOf` → `### 3. keysOf`)。本 doc 内の `§5 SDK 境界 Zod` / `§6 conform FieldMetadata` / `§7 JSX defensive narrowing` の cross-reference も renumber する。

- [ ] **Step 2: §6 (renumber 後の §5) を改訂**

旧:

```markdown
### 6. conform `FieldMetadata<T>` generic invariance 境界

conform の `FieldMetadata<T, FormShape, FormError>` は **invariant** な type parameter を持つため、複数フォーム型で 1 つの connected component を共有する場合や、動的 schema（22 種の Section type に対応する `AutoSectionForm` 等）で渡す場合に、TS の generic 制約だけで型情報を維持できない（公式仕様の限界）。**Pure Component + Connected wrapper パターン**で cast を境界 1 箇所に閉じ込める:

(コード例)

**ルール**: `as FieldMetadata<...>` cast は ① **動的 schema を Pure Component 越境で渡す Connected wrapper の内部** ② **`AutoSectionForm` / `AutoArrayField` / `Auto*Field` 系の auto-fields registry** に限定。Section / 単一フォーム型 Component 内では concrete schema 型を直接使い cast を発生させない。

参照実装: `LayoutFields.tsx` の `LayoutFieldsConnected`、`auto-section-form.tsx` の `DefaultValue<>` widening、`AutoArrayField.tsx` の `getFieldList()` / `getFieldset()` メソッド narrow、`Auto{Boolean,Select,Group}Field.tsx` の `useInputControl` 境界。
```

新 (renumber 済の §5):

```markdown
### 5. conform `FieldMetadata<T>` generic invariance 境界

conform の `FieldMetadata<T, FormShape, FormError>` は **invariant** な type parameter を持つため、動的 schema (22 種の Section type に対応する `AutoSectionForm` 等) や Pure Component 越境で `FieldMetadata<unknown>` → `FieldMetadata<T>` の boundary cast が必要になる (公式仕様の限界、library 側 semver-major 対応待ち)。

**`@/shared/lib/conform/typed-input-control` の 4 helper 内部のみ許可** (`useTypedInputControl` / `getTypedFieldList` / `getTypedFieldset` / `asTypedField`)、呼び出し側 cast 0 件。helper 外部での `as unknown as FieldMetadata<...>` 記述は禁止。

\`\`\`typescript
// OK: helper 経由 (呼び出し側 cast 0 件)
import { useTypedInputControl, getTypedFieldset, asTypedField } from "@/shared/lib/conform/typed-input-control";

const control = useTypedInputControl<string>(field);
const fieldset = getTypedFieldset<{ name: string }>(field);
<TagFields tagsField={asTypedField<string[]>(ctx.fields.tags)} />

// NG: 呼び出し側で cast (gate test で fail)
const control = useInputControl(field as unknown as FieldMetadata<string>);
\`\`\`

検出 grep:
\`\`\`bash

# helper 内部以外で hit したら違反

grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'src/shared/lib/conform/typed-input-control.ts'

# 期待: 0 件

\`\`\`

検知 gate: `__tests__/unit/architecture-boundaries.test.ts` の §6 gate が src/ 全体を grep し、`typed-input-control.ts` 以外で hit したら fail。

参照実装: `@/shared/lib/conform/typed-input-control` の 4 helper、消費者は `auto-section-form.tsx` / `Auto{Boolean,Select,Array,Group}Field.tsx` / `LayoutFields.tsx` / `content-types/post.tsx`。
```

- [ ] **Step 3: 「禁止パターンと代替手段」表の §3 行を削除**

`### 禁止パターンと代替手段` の表から `value as SectionConfig` 行があれば削除。

- [ ] **Step 4: 監査 grep セクション更新**

`## 監査 grep` の `§3` 関連の grep を削除、`§6` を helper 内部除外パターンに更新:

\`\`\`bash

# §6 helper 外部での cast 禁止

grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/ | grep -v 'src/shared/lib/conform/typed-input-control.ts'

# 期待: 0 件

\`\`\`

- [ ] **Step 5: commit**

```bash
git add .claude/rules/type-safety/assertion-bans.md
git commit -m "$(cat <<'EOF'
docs(rules): assertion-bans §3 削除 + §6 を typed-input-control SSoT に改訂

許可例外 7 → 6 種類に縮減 (§3 SectionConfig union widening 構造解消、
§6 conform FieldMetadata invariance を helper SSoT 経由に改訂)。
renumber: 旧 §4-7 → §3-6。
EOF
)"
```

---

### Task 12: CLAUDE.md 許可例外 7 → 6 種類更新

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: §クリティカルルール §型・コード品質 の許可例外列挙更新**

旧:

> **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う。許可例外 7 種類（DOM event target / Prisma helper 経由 / SectionConfig union widening / serialize helper / Zod `z.custom<T>` SDK 境界 (`asPrismaInputJsonValue` / `toAppRoute` / `LocationSchema.parse` / `CreateEmailOptionsSchema.parse`) / conform `FieldMetadata<T>` generic invariance / JSX defensive narrowing）のみ、新規 cast 追加禁止。詳細 → `type-safety/assertion-bans.md`

新:

> **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う。許可例外 6 種類（DOM event target / Prisma helper 経由 / serialize helper / Zod `z.custom<T>` SDK 境界 (`asPrismaInputJsonValue` / `toAppRoute` / `LocationSchema.parse` / `CreateEmailOptionsSchema.parse`) / conform `FieldMetadata<T>` invariance を `typed-input-control` helper SSoT に集約 / JSX defensive narrowing）のみ、新規 cast 追加禁止。詳細 → `type-safety/assertion-bans.md`

(削除: `SectionConfig union widening`、追記: §6 が helper SSoT 経路を明示)

- [ ] **Step 2: commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude-md): 許可例外 7 → 6 種類に縮減 (§3 SectionConfig union widening 削除、§6 を helper SSoT 表記)
EOF
)"
```

---

### Task 13: ssot-singletons.md typed-input-control 追記

**Files:**

- Modify: `.claude/rules/ssot-singletons.md`

- [ ] **Step 1: 管理画面 共通コンポーネント セクションに追記**

`## 管理画面 共通コンポーネント` テーブルに新規行追加 (alphabetical 位置 or 末尾):

```markdown
| `useTypedInputControl` / `getTypedFieldList` / `getTypedFieldset` / `asTypedField` | `@/shared/lib/conform/typed-input-control` | conform `FieldMetadata<T>` generic invariance 境界 cast を helper 内部 (4 helper × 1 line cast) に集約した SSoT。動的 schema (22 種 Section type の AutoSectionForm 系) / Pure Component 越境の Connected wrapper / Auto{Array,Group}Field の `getFieldList()` / `getFieldset()` で利用。**禁止**: 呼び出し側 (Auto\*Field / side-panel / content-types 等) で `as unknown as FieldMetadata<...>` を書くこと、`useInputControl` を直接 import すること (helper 経由必須)。検知: `__tests__/unit/architecture-boundaries.test.ts` §6 gate (helper 外部 hit で fail)。ledger §6 唯一許可場所。 |
```

- [ ] **Step 2: commit**

```bash
git add .claude/rules/ssot-singletons.md
git commit -m "$(cat <<'EOF'
docs(rules): typed-input-control 4 helper SSoT を ssot-singletons に登録

conform FieldMetadata<T> invariance の boundary cast 集約先として明文化。
EOF
)"
```

---

## Phase 6: 最終検証 + PR

### Task 14: 統合検証 (validate + build + test:unit + test:integration)

- [ ] **Step 1: validate + build 完全実行**

Run:

```bash
bun run validate && bun run build
```

Expected: 全体 exit 0、`.next/dev/types/**` のノイズのみ (source error 0)

- [ ] **Step 2: §3 / §6 gate 単独 PASS 確認**

Run:

```bash
bun test __tests__/unit/architecture-boundaries.test.ts
```

Expected: 全 test PASS (§3 / §6 gate 含む)

- [ ] **Step 3: 関連 unit テスト走行 (per-file isolation runner)**

Run:

```bash
bun run test:unit
```

Expected: `[run-tests] done: X passed, 0 failed`

- [ ] **Step 4: integration テスト走行**

Run:

```bash
bun run test:integration
```

Expected: `[run-tests] done: X passed, 0 failed`

- [ ] **Step 5: 最終 grep 検証**

Run:

```bash
echo "=== §3 cast (期待 0) ==="
grep -rnE '\bas\s+SectionConfig\b' src/ || echo "0 件"
echo
echo "=== §6 cast (期待: helper 内 4 件のみ) ==="
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/
```

Expected:

```text
=== §3 cast (期待 0) ===
0 件

=== §6 cast (期待: helper 内 4 件のみ) ===
src/shared/lib/conform/typed-input-control.ts:<line>:  return useInputControl(field as unknown as FieldMetadata<T>);
src/shared/lib/conform/typed-input-control.ts:<line>:  return (field as unknown as FieldMetadata<T[]>).getFieldList();
src/shared/lib/conform/typed-input-control.ts:<line>:  return (field as unknown as FieldMetadata<T>).getFieldset();
src/shared/lib/conform/typed-input-control.ts:<line>:  return field as unknown as FieldMetadata<T>;
```

- [ ] **Step 6: 失敗時の対処**

`test:integration` で pre-existing fail がある場合は `git stash && bun test <file> && git stash pop` で本 PR 由来か切り分け。本 PR 由来なら原因究明、pre-existing なら handoff memo 化して別 PR で対処。

---

### Task 15: push + PR 作成

- [ ] **Step 1: branch を push**

Run:

```bash
git push -u origin refactor/type-safety-section-conform-invariance
```

Expected: lefthook pre-push hook (type-check + architecture-boundaries) 成功 + push 成功

- [ ] **Step 2: gh pr create**

Run:

```bash
gh pr create --base main --title "refactor(type-safety): §3/§6 cast ゼロ化 + conform invariance を helper SSoT 集約 (許可例外 7→6)" --body "$(cat <<'EOF'
## Summary

- §3 SectionConfig union widening (1 件) を `validateSectionConfig` の generic narrowing で構造解消 (cast 0 件)
- §6 conform `FieldMetadata<T>` invariance (13 件) を `@/shared/lib/conform/typed-input-control` の 4 helper SSoT に集約 (呼び出し側 cast 0 件、helper 内部 4 件のみ)
- `assertion-bans.md` 許可例外を 7 → 6 種類に縮減
- `architecture-boundaries.test.ts` に §3 / §6 gate を追加し、helper 外部での cast 復活を永続的に遮断

## Design Doc

`docs/superpowers/specs/2026-05-18-type-safety-section-config-conform-invariance-design.md`

## Test Plan

- [x] `bun run validate && bun run build` exit 0
- [x] `bun run test:unit` 全 PASS (§3 / §6 gate 含む)
- [x] `bun run test:integration` 全 PASS
- [x] `grep -rnE '\\bas\\s+SectionConfig\\b' src/` → 0 件
- [x] `grep -rnE 'as\\s+unknown\\s+as\\s+FieldMetadata' src/` → `src/shared/lib/conform/typed-input-control.ts` の 4 件のみ
- [x] Section 編集 UI (管理画面 `/admin/pages/[slug]/sections`) の form binding 動作確認 (Auto\*Field / LayoutFields / post.tsx タグ選択)

## Architecture Notes

- conform 維持 (PR #122 で react-hook-form 完全撤廃直後、現状全 form の SSoT)
- TanStack Form 移行 / 共存は不採用 (bundle / Server Action 統合コスト / SSoT 違反)
- 残る invariance 制約は library 仕様、解除待ち以外に手なし → helper 4 件に閉じ込めて検知可能化

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: PR URL を保存 + CI watch**

Run:

```bash
gh pr checks --watch --interval 30
```

Expected: 全 required check PASS

- [ ] **Step 4: CI green 後 squash merge**

Run:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: ローカル sync**

Run:

```bash
git checkout main && git pull --ff-only
```

Expected: fast-forward 成功、`refactor/type-safety-section-conform-invariance` branch は --delete-branch で消滅、`/commit-commands:clean_gone` 不要

---

## 完成判定基準 (spec §完成判定基準 と整合)

- [x] `bun run validate && bun run build` exit 0
- [x] `grep -rnE 'as\s+SectionConfig\b' src/` → 0 件
- [x] `grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/` → `src/shared/lib/conform/typed-input-control.ts` の 4 件のみ
- [x] `bun test __tests__/unit/architecture-boundaries.test.ts` PASS (新規 §3 / §6 gate 含む)
- [x] `bun run test:unit` / `bun run test:integration` PASS
- [x] ledger §3 完全削除 / §6 改訂が `.claude/rules/type-safety/assertion-bans.md` と `CLAUDE.md` で整合
- [x] `type-safety/assertion-bans.md` の許可例外が 7 → 6 種類に縮減
