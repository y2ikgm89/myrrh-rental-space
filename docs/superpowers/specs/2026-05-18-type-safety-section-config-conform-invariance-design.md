# 型安全完全 A 化: §3 SectionConfig union widening と §6 conform FieldMetadata invariance のゼロ化

## 背景

`.claude/rules/type-safety/assertion-bans.md` で許可されている `as` cast 例外 7 種類のうち、本セッション時点でコード上に残存する 2 系統を破壊的変更最小で排除する。

### 残存 cast 一覧

- **§3 SectionConfig union widening**: 1 件
  - `src/shared/lib/validations/section.ts:251` の `result.data as SectionConfig`
- **§6 conform FieldMetadata 13 件** (`as unknown as FieldMetadata<...>` strict grep で実測、initial 21 件は overestimate):
  - `auto-section-form.tsx`: 5 件 (lines 709 / 749 / 805 / 843 / 885) — 色 / アイコン / span / block / text input
  - `auto-fields/AutoSelectField.tsx`: 1 件 (line 52)
  - `auto-fields/AutoBooleanField.tsx`: 1 件 (line 31)
  - `auto-fields/AutoArrayField.tsx`: 2 件 (lines 72, 148) — getFieldList + getFieldset
  - `auto-fields/AutoGroupField.tsx`: 1 件 (line 56) — getFieldset
  - `_shared/components/editor/inline/side-panel/LayoutFields.tsx`: 2 件 (lines 149, 154) — contentWidth / contentWidthCustom
  - `_shared/components/editor/inline/content-types/post.tsx`: 1 件 (line 92) — tagsField wrapper
- side-panel の `UnifiedPublishFields` / `SEOFields` 等 11 file は **`FieldMetadata<T>` 型を type-only import で使用**しており実 cast なし (spec 初稿の誤り)
- `customer-step.tsx` (public) も同様に type-only usage、cast なし

### 採用方針 (確定済)

- conform 維持 (PR #122 で `react-hook-form` 完全削除直後、現状全 form の SSoT)
- TanStack Form 移行 / 共存は不採用 (Bundle / Server Action 統合コスト / SSoT 違反)
- §3: `validateSectionConfig` の generic narrowing で cast を構造解消 (1 → 0 件)
- §6: `useInputControl` / `getFieldList()` / `getFieldset()` + Connected wrapper 配送 cast の boundary を 4 helper 内部の 1 line に閉じ込め (呼び出し側 13 件 → 0 件、helper 内部 4 件のみ、ledger §6 唯一許可場所として明文化)

## 設計

### §3: `validateSectionConfig` の generic 化

#### 現状 (NG)

```typescript
// src/shared/lib/validations/section.ts:238-254
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

#### 構造解消 (OK)

`registry.ts` の `definitions` を `Record<string, SectionDefinition>` 注釈から **`satisfies` 経由の concrete typed const** に変更し、key を `keyof typeof definitions` で narrow 可能にする。`validateSectionConfig` は string 型ガードで早期 narrowing し、 cast なしで union 戻り型を成立させる。

```typescript
// src/shared/lib/sections/registry.ts (after)
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
  // ... 全 22 entry
} as const satisfies Record<string, SectionDefinition>;

export type SectionDefinitionMap = typeof definitions;
export type SectionTypeKey = keyof SectionDefinitionMap;

const SECTION_TYPE_KEY_SET = new Set<string>(Object.keys(definitions));

export function isSectionTypeKey(type: string): type is SectionTypeKey {
  return SECTION_TYPE_KEY_SET.has(type);
}

export function getSectionDefinition(
  type: string,
): SectionDefinition | undefined {
  return isSectionTypeKey(type) ? definitions[type] : undefined;
}
```

```typescript
// src/shared/lib/validations/section.ts (after)
export function validateSectionConfig(
  type: string,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  if (!isSectionTypeKey(type)) {
    return { success: false, error: new z.ZodError([]) };
  }
  const def = definitions[type];
  const result = def.configSchema.safeParse(config);
  if (result.success) {
    // result.data: union of all 22 schemas' output = SectionConfig
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
```

**型レベルでの根拠**:

- `definitions` を `as const satisfies` で型付けすると、`definitions[type]` の戻り型は `SectionDefinitionMap[T]`
- `T = "hero"` なら `configSchema` は `typeof heroConfigSchema`、`.safeParse().data` は `HeroConfig`
- `T = SectionTypeKey` (全 union) なら `data` は全 22 schema の output union = `SectionConfig`
- TS は subtype 関係を automatic に解決するため `as SectionConfig` 不要

#### 影響範囲

- `registry.ts` の `definitions` 型定義変更 (`Record<string, SectionDefinition>` → `as const satisfies`)
- `registry.ts` の `getSectionDefinition` を `isSectionTypeKey` 経由に変更
- `registerSectionDefinition` 関数の扱い:
  - 現状 `definitions[def.type] = def` で動的拡張可能だが、`as const satisfies` 化で書き込み不可になる
  - 実体は CLI 拡張ポイントとして残されているのみ、実 caller なし → **削除を提案** (確認後実施)
  - もしくは `additionalDefinitions: Map<string, SectionDefinition>` を別途持ち、`getSectionDefinition` が両方を走査する fallback pattern にする
- `validations/section.ts` の `validateSectionConfig` 内 cast 削除
- `__tests__/unit/domain/sections/registry.test.ts` の `SectionTypeKey` 型 export 検証追加

#### 検証 grep

```bash
# §3 cast 完全消滅
grep -rnE 'as\s+SectionConfig\b' src/
# 期待: 0 件
```

### §6: `typed-input-control` helper SSoT に集約

#### 現状の構造

3 種類のメソッド呼び出しで cast が頻発 (実測 13 件):

1. `useInputControl(field as unknown as FieldMetadata<T>)` — 単一値 controlled binding (9 件)
   - `FieldMetadata<string>` × 7 (auto-section-form ×5 + AutoSelectField + AutoBooleanField)
   - `FieldMetadata<string \| null \| undefined>` × 1 (LayoutFields contentWidth)
   - `FieldMetadata<number \| null \| undefined>` × 1 (LayoutFields contentWidthCustom)
2. `(field as unknown as FieldMetadata<T[]>).getFieldList()` — array iteration (1 件: AutoArrayField line 72)
3. `(field as unknown as FieldMetadata<Record<string, unknown>>).getFieldset()` — object decomposition (2 件: AutoArrayField line 148 + AutoGroupField line 56)
4. 値配送目的の wrapper cast (1 件: post.tsx line 92, `tagsField={ctx.fields.tags as unknown as FieldMetadata<string[]>}`)

#### 構造解消: 4 helper SSoT

新規ファイル `src/shared/lib/conform/typed-input-control.ts` を作成し、cast を 4 helper 内部に閉じ込める。

```typescript
// src/shared/lib/conform/typed-input-control.ts
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
```

**型 export 補助**:

```typescript
// src/shared/lib/conform/typed-input-control.ts (追加)

/**
 * Connected wrapper パターンで Pure Component に「型注釈付き FieldMetadata」を渡したいときの helper。
 * cast を helper 内に閉じ込めて呼び出し側の cast を排除する。
 *
 * 例: tagsField={ctx.fields.tags as unknown as FieldMetadata<string[]>}
 *  → tagsField={asTypedField<string[]>(ctx.fields.tags)}
 */
export function asTypedField<T>(
  field: FieldMetadata<unknown>,
): FieldMetadata<T> {
  // §6 generic invariance — 唯一の境界 cast
  return field as unknown as FieldMetadata<T>;
}
```

合計 **4 helper × 各 1 line cast = 4 件**を helper 内部に集約。呼び出し側は 0 件。

#### Migration マップ

| Before                                                                            | After                                                      | 件数 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `useInputControl(field as unknown as FieldMetadata<string>)`                      | `useTypedInputControl<string>(field)`                      | 7    |
| `useInputControl(field as unknown as FieldMetadata<string \| null \| undefined>)` | `useTypedInputControl<string \| null \| undefined>(field)` | 1    |
| `useInputControl(field as unknown as FieldMetadata<number \| null \| undefined>)` | `useTypedInputControl<number \| null \| undefined>(field)` | 1    |
| `(field as unknown as FieldMetadata<unknown[]>).getFieldList()`                   | `getTypedFieldList(field)`                                 | 1    |
| `(field as unknown as FieldMetadata<Record<string, unknown>>).getFieldset()`      | `getTypedFieldset(field)`                                  | 2    |
| `ctx.fields.tags as unknown as FieldMetadata<string[]>`                           | `asTypedField<string[]>(ctx.fields.tags)`                  | 1    |

合計 13 件の boundary cast → helper 呼び出し置換完了で **呼び出し側 cast 0 件**。

#### ledger / docs 更新

- `type-safety/assertion-bans.md` §6 を改訂:
  - 「21 件、library 仕様による本質制約」→ 「`@/shared/lib/conform/typed-input-control` の 4 helper 内部のみに閉じ込め済 (helper 内部 4 件のみ、呼び出し側 0 件)、helper 外部での cast 禁止」
  - 検出 grep を追加: `grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/` は `src/shared/lib/conform/typed-input-control.ts` の 4 件のみ hit
- `type-safety/assertion-bans.md` §3 を **完全削除** (cast 0 件達成、許可例外 7 → 6 種類に縮減)
- `CLAUDE.md` §クリティカルルール の許可例外列挙を更新 (7 → 6 種類)
- `ssot-singletons.md` の管理画面 SSoT に `typed-input-control` を追記

#### Architecture boundaries test

`__tests__/unit/architecture-boundaries.test.ts` に新規 gate を追加:

```typescript
it("§6 FieldMetadata cast は typed-input-control helper 内部のみ許可", async () => {
  const violations = await grepInSrc(
    String.raw`as\s+unknown\s+as\s+FieldMetadata`,
  );
  const allowedFile = "src/shared/lib/conform/typed-input-control.ts";
  const offenders = violations.filter((v) => !v.startsWith(allowedFile));
  expect(offenders).toEqual([]);
});

it("§3 SectionConfig union widening cast 禁止 (構造解消済)", async () => {
  const violations = await grepInSrc(String.raw`as\s+SectionConfig\b`);
  expect(violations).toEqual([]);
});
```

### Out of scope

- TanStack Form 移行 / 共存検討 (本セッションで結論済、不採用)
- conform 以外の form library 検討
- AutoSectionForm の per-section Pure Component 分解 (cast 0 の代償として 22 component 分解は cost/benefit 不合理)
- 動的 schema (Section / AutoArrayField / AutoGroupField) の根本再設計
- React Hook Form 系の dead reference 確認 (PR #122 で完全削除済)

## 検証手順

```bash
# Type / lint / build gate
bun run validate && bun run build

# §3 cast 完全消滅
grep -rnE 'as\s+SectionConfig\b' src/
# 期待: 0 件

# §6 cast は helper 内部のみ
grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/
# 期待: src/shared/lib/conform/typed-input-control.ts のみ hit (4 件)

# architecture-boundaries test
bun test __tests__/unit/architecture-boundaries.test.ts

# 関連 unit / integration
bun run test:unit
bun run test:integration

# Section form / inline editor の動作確認
# - /admin/pages/[slug]/sections で各 Section type の form 編集
# - /admin/posts/new + /admin/news/new + /admin/terms/new で side panel form 編集
# - 公開予約フォーム /reservation の customer step
```

## ファイル変更一覧

### 新規ファイル

- `src/shared/lib/conform/typed-input-control.ts` (4 helper)
- (テスト) `__tests__/unit/architecture-boundaries.test.ts` に 2 it block 追加

### 既存ファイル変更

- `src/shared/lib/sections/registry.ts` — `definitions` 型定義変更 + `isSectionTypeKey` / `getSectionDefinition` 改修 (+ `registerSectionDefinition` 削除検討)
- `src/shared/lib/validations/section.ts` — `validateSectionConfig` の cast 削除
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` — 5 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx` — 2 件置換
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx` — 1 件置換
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/LayoutFields.tsx` — 2 件置換
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx` — 1 件置換 (`asTypedField<string[]>` 経由)
- side-panel 配下の他 11 file (`UnifiedPublishFields` / `SEOFields` / `TagFields` 等) は cast 不在のため変更なし
- `customer-step.tsx` (public) も cast 不在のため変更なし
- `.claude/rules/type-safety/assertion-bans.md` — §3 削除 + §6 改訂 (検出 grep 追加)
- `CLAUDE.md` — 許可例外 7 → 6 種類
- `.claude/rules/ssot-singletons.md` — typed-input-control SSoT 追記

### 削除候補 (確認後)

- `src/shared/lib/sections/registry.ts` の `registerSectionDefinition` 関数 (CLI 拡張ポイントだが caller 0 件)

## 完成判定基準

- `bun run validate && bun run build` exit 0
- `grep -rnE 'as\s+SectionConfig\b' src/` → 0 件
- `grep -rnE 'as\s+unknown\s+as\s+FieldMetadata' src/` → `src/shared/lib/conform/typed-input-control.ts` の 4 件のみ
- `bun test __tests__/unit/architecture-boundaries.test.ts` PASS (新規 gate 含む)
- `bun run test:unit` / `bun run test:integration` PASS
- ledger §3 完全削除 / §6 改訂が `.claude/rules/type-safety/assertion-bans.md` と `CLAUDE.md` で整合
- `type-safety/assertion-bans.md` の許可例外が 7 → 6 種類に縮減
