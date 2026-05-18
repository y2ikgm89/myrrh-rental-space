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

## 4. `toPlainObject<T>` / `toPlainArray<T>` は `Serialized<T>` 戻り値型で実態と一致 (旧 `: unknown` 経由は dead code)

`toPlainObject<T>(obj: T): Serialized<T>` / `toPlainArray<T>(arr: T[]): Serialized<T>[]` の戻り値型は `Serialized<T>` で **Date → string 変換 / function プロパティ除去 / Symbol key 除去**を型レベルで正確に表現する。test で `: unknown` 経由 access する必要はなく、property を直接 access する canonical pattern を使う。

```typescript
// OK: Serialized<T> が Date → string を narrow するため直接 access 可能
const result = toPlainObject({
  createdAt: new Date("2024-01-15T10:30:00.000Z"),
});
expect(result.createdAt).toBe("2024-01-15T10:30:00.000Z"); // result.createdAt は string

// OK: Symbol key / function 除去も型レベルで narrow される
const symbol = Symbol("hidden");
const result = toPlainObject({ id: 1, [symbol]: "removed", method() {} });
expect(result).toEqual({ id: 1 }); // result は { id: number }、symbol/method 除外済

// OK: null/undefined overload で narrow 済
const nullResult = toPlainArray(null); // 戻り値型は null
const undefResult = toPlainArray(undefined); // 戻り値型は undefined
```

**禁止**: `const x: unknown = result.createdAt` の widening 注釈、`const plain: unknown = result; expect(plain).toEqual(...)` パターン。`Serialized<T>` 戻り値型が型と実態を一致させているため、過剰防御の `: unknown` 経由は dead code。

旧 `toPlainObject<T>(obj: T): T` 時代の `: unknown` 経由パターンは 2026-05-18 PR #135 で `Serialized<T>` 戻り値型 + 型レベル Symbol/function 除外への移行で全削除済。新規 test 作成時は本パターン踏襲必須。

## 4-2. Lexical Node test の discriminated union type guard pattern (`as` cast 不要)

`editor.getEditorState().toJSON()` の `root.children[0]` の型は `SerializedLexicalNode` で `type: string` (literal でない) のため、`type === "X"` で narrow 不能。test 内で **literal-typed variant** を定義 + `assertSerialized*Node` type guard helper で discriminated union narrow を成立させ、`as` cast / `: unknown` 注釈なしで property 直接 access を実現する。

```typescript
// OK: 各 Node の $config() type 文字列をリテラル型として SerializedElementNode を拡張
import type { SerializedElementNode, SerializedLexicalNode } from "lexical";

type SerializedCoverNode = SerializedElementNode<SerializedLexicalNode> & {
  type: "cover";
  backgroundImageUrl?: string;
  overlayColor?: string;
  // ... NodeState の flat: true 展開で default 省略されるため optional
};

function assertSerializedCoverNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedCoverNode {
  if (node?.type !== "cover") {
    throw new Error(`Expected SerializedCoverNode, got ${String(node?.type)}`);
  }
}

// caller — cast 不要 + type-safe property access (property name typo を TS が検出)
const nodeJson = json.root.children[0];
assertSerializedCoverNode(nodeJson);
expect(nodeJson.backgroundImageUrl).toBe("https://example.com/bg.jpg");
```

### ParagraphNode 親越え narrow

lexical の `SerializedElementNode` は `type: string` (literal でない) のため `node.type === "paragraph"` で narrow 不能。test 内に literal-typed variant を定義:

```typescript
type SerializedParagraphLike = Omit<
  SerializedElementNode<SerializedLexicalNode>,
  "type"
> & {
  type: "paragraph";
};

function assertSerializedParagraphLike(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedParagraphLike {
  if (node?.type !== "paragraph") throw new Error(...);
}
```

**禁止**: `(json.root.children[0] as any).children[0]` / `const x: unknown = json.root.children[0]` 経由 access (PR #134/#135 で全 4 Lexical test file から削除済)。新規 Lexical Node test 作成時は本 discriminated union pattern を必ず踏襲する。参照実装: `__tests__/unit/components/editor/lexical/{Cover,FeatureIconList,InlineImage,Testimonial}Node.test.ts`。

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
