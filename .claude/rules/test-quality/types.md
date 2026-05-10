---
description: Bun Test 固有の型安全パターン（mock 型推論 / toContain / toEqual / toPlainObject 型嘘 / executeAdminMutationResult / MutationResult / unknown / import type）
paths:
  - __tests__/**
---

# Bun Test 型安全パターン

> `noUncheckedIndexedAccess` / `strict` 有効環境での Bun テスト固有の型制約と対処法。8 patterns。

## 1. `mock()` の空配列型推論

Bun の `mock()` は引数から戻り値型を推論する。空配列 `[]` は `never[]` と推論されるため、後から `mockResolvedValue([{ id: 'x' }])` を呼ぶと TS2322 になる。

```typescript
// NG: never[] 推論 → mockResolvedValue([{ pageId: 'x' }]) がエラー
const mockFindMany = mock(() => Promise.resolve([]));

// OK: 型引数で明示
const mockFindMany = mock<() => Promise<{ pageId: string }[]>>(() =>
  Promise.resolve([]),
);
```

## 2. `toContain` の要素型制約

`expect(arr).toContain(value)` は `arr` の要素型と `value` の型が一致している必要がある。`Object.values()` の戻り値（`SomeEnum[]`）に `string` を `toContain` すると型不一致になる。

```typescript
// NG: SectionType[] に string を toContain → TS2345
expect(Object.values(SectionType)).toContain("HERO");

// OK: string[] に変換してから
const sectionTypeValues: string[] = Object.values(SectionType);
expect(sectionTypeValues).toContain("HERO");
```

## 3. `toEqual` の型一致要件

`expect(a).toEqual(b)` も型が一致している必要がある。const 配列と型付き配列の比較では型注釈を付ける。

```typescript
// NG: string[] と CustomerStatus[] の比較 → TS2769
expect(CUSTOMER_STATUSES.sort()).toEqual(
  ["NEW", "REGULAR", "VIP", "INACTIVE", "BLACKLIST"].sort(),
);

// OK: 明示的な型注釈
const expectedStatuses: CustomerStatus[] = [
  "NEW",
  "REGULAR",
  "VIP",
  "INACTIVE",
  "BLACKLIST",
];
expect(CUSTOMER_STATUSES.sort()).toEqual(expectedStatuses.sort());
```

## 4. `toPlainObject<T>: T` の型 vs ランタイム不一致

`toPlainObject` の返り型は `T`（入力の型をそのまま保持）だが、ランタイムでは `Date → string` 変換・Symbol 除去・関数除去が行われる。型と実態が乖離するため `unknown` 経由でアクセス。

```typescript
// NG: result.createdAt の型は Date だが実行時は string → toBe('2024-...') で型エラー
const result = toPlainObject({
  createdAt: new Date("2024-01-15T10:30:00.000Z"),
});
expect(result.createdAt).toBe("2024-01-15T10:30:00.000Z");

// OK: unknown 経由でアクセス
const result = toPlainObject({
  createdAt: new Date("2024-01-15T10:30:00.000Z"),
});
const createdAt: unknown = result.createdAt;
expect(createdAt).toBe("2024-01-15T10:30:00.000Z");

// OK: Symbol プロパティ除去の検証
const plain: unknown = result;
expect(plain).toEqual({ id: 1 });
```

## 5. `executeAdminMutationResult` の型推論

`executeAdminMutationResult` はジェネリクスで戻り値型を推論する。`execute` コールバックの戻り値型が複雑な場合、TypeScript が `unknown` に推論することがある。明示的な型引数で解決する。

```typescript
// NG: 戻り値型が unknown に推論される
const result = await executeAdminMutationResult({
  resource: "space",
  action: "create",
  execute: async () => {
    return { name }; // 型が推論されない場合あり
  },
});

// OK: 型引数を明示 (execute callback の戻り値 T が MutationResult<T> の success path)
const result = await executeAdminMutationResult<{ name: string }>({
  resource: "space",
  action: "create",
  execute: async () => {
    return { name }; // execute callback は T を直接返す (ラッパー不要)
  },
});
```

## 6. `MutationResult<T>` の型判定

`MutationResult<T> = T | MutationError` では `isMutationError()` で failure path を判定する。明示的な型引数が必要な場合は `isMutationError` を使用する。

```typescript
// NG: MutationResult に success プロパティは存在しない
const result = await action();
expect(result.success).toBe(false); // TS18046 / プロパティなし

// OK: isMutationError で failure path 判定
const result = await action();
expect(isMutationError(result)).toBe(true);

// OK: void success path: MutationResult<null> = null | MutationError
return null; // null が success sentinel
```

## 7. `unknown` な戻り値の検証には `toMatchObject`

カリー化パターン等で戻り値が `unknown` 型になる場合、プロパティアクセスは TS18046 になる。`toMatchObject` は `unknown` を受け入れる。

```typescript
// NG: result が unknown 型でプロパティアクセスできない
const result = await action("arg");
expect(result.success).toBe(false); // TS18046

// OK: toMatchObject は unknown を受け入れる
expect(result).toMatchObject({ success: false });
expect(result).toMatchObject({
  success: false,
  error: expect.stringContaining("権限"),
});
```

## 8. `import type` と `mock.module()` の共存

`mock.module()` でモジュールを差し替えても、`import type` で型のみを import することは可能。型は コンパイル時に消去されるため、ランタイムのモックと干渉しない。

```typescript
// OK: 型のみのインポートはモックと共存可能
import type { MutationResult } from "@/shared/lib/mutation-result";
mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mockGetSession,
}));

// 型注釈に使用
const result: MutationResult<void> = await createPost(data);
```
