---
description: noUncheckedIndexedAccess + TS 6.0 設定変更 + 配列 / ループ / Record アクセスの型安全パターン
paths:
  - src/**/*.ts
  - src/**/*.tsx
---

# noUncheckedIndexedAccess + TS 6.0 + アクセスパターン

> 配列・Record アクセスは `T | undefined` を返す前提のガード句・optional chain・分割代入デフォルト値パターン。TS 6.0 デフォルト変更（`strict: true` / `target: es2025` 等）と新組み込み型（Temporal / RegExp.escape / Map.upsert）。

## noUncheckedIndexedAccess（有効）

`tsconfig.json` で `noUncheckedIndexedAccess: true` を有効化済み。配列・オブジェクトのインデックスアクセスは `T | undefined` を返す（`strict` フラグには含まれないため明示的に有効化）。

## TypeScript 6 主な変更点

### デフォルト設定の変更

TypeScript 6 から以下のデフォルト値が変更された。本プロジェクトでは `tsconfig.json` に明示設定済み:

| オプション                     | 旧デフォルト       | 新デフォルト | 本プロジェクトの対応                                  |
| ------------------------------ | ------------------ | ------------ | ----------------------------------------------------- |
| `strict`                       | `false`            | **`true`**   | 明示 `true`（Next.js が注入するため）                 |
| `module`                       | `commonjs`         | `esnext`     | 明示 `esnext`（Next.js が上書き）                     |
| `target`                       | `es2020`           | `es2025`     | `ESNext`（常に最新）                                  |
| `types`                        | 自動（`@types/*`） | `[]`         | 明示 `["node"]`（`@types/node` のグローバル型に必要） |
| `noUncheckedSideEffectImports` | `false`            | `true`       | デフォルトに従う                                      |
| `libReplacement`               | `true`             | `false`      | デフォルトに従う（パフォーマンス改善）                |

### 非推奨・削除オプション（TS 6.0）

| オプション                          | ステータス           | 備考                                            |
| ----------------------------------- | -------------------- | ----------------------------------------------- |
| `esModuleInterop`                   | 常時有効（明示不要） | `false` は設定不可。`true` は冗長なので削除済み |
| `allowSyntheticDefaultImports`      | 常時有効（明示不要） | 同上                                            |
| `moduleResolution: "node"` (node10) | 非推奨               | `nodenext` か `bundler` を使う                  |
| `target: "es5"`                     | 非推奨               | `es2015` 以上を使う                             |
| `baseUrl`                           | 非推奨               | `paths` で相対パスを明示する                    |
| `outFile`                           | 削除                 | 外部バンドラーを使う                            |
| `import ... assert {}`              | 非推奨               | `import ... with {}` に移行                     |

> `"ignoreDeprecations": "6.0"` で非推奨警告を抑制可能だが、TS 7.0 で完全削除されるため使用しない。

### 新組み込み型（ES2025 / Stage 3 対応）

```typescript
// Temporal API（日時操作）— 組み込み型として利用可
const now = Temporal.Now.instant();
const yesterday = now.subtract({ hours: 24 });

// RegExp.escape（動的正規表現の文字エスケープ）
const pattern = new RegExp(RegExp.escape(userInput)); // 特殊文字を自動エスケープ

// Map/WeakMap の upsert メソッド
const map = new Map<string, number>();
map.getOrInsert("count", 0); // キーがなければ挿入
map.getOrInsertComputed("total", () => heavyCompute());
```

## 配列アクセス

```typescript
// NG: そのままアクセス（コンパイルエラー）
const first = items[0];
first.name; // Error: Object is possibly 'undefined'

// OK: ガード句でナローイング
const first = items[0];
if (!first) return;
first.name; // T（narrowed）

// OK: optional chain + nullish coalescing
const name = items[0]?.name ?? "default";

// OK: 分割代入デフォルト値
const [localPart = "", domain = ""] = email.split("@");
```

## ループパターン

インデックスループは `noUncheckedIndexedAccess` でエラーになる。`for...of` / `forEach` が推奨:

```typescript
// NG: インデックスループ（strs[i] が string | undefined）
for (let i = 0; i < strs.length; i++) {
  console.log(strs[i].toUpperCase()); // Error: Object is possibly 'undefined'
}

// OK: for...of（各要素は string 型）
for (const str of strs) {
  console.log(str.toUpperCase());
}

// OK: forEach
strs.forEach((str) => {
  console.log(str.toUpperCase());
});

// OK: インデックスが必要な場合はガード句
for (let i = 0; i < arr.length; i++) {
  const item = arr[i];
  if (!item) continue;
  // item は T 型
}
```

## Record 型のアクセス

`Record<string, V>` のプロパティアクセスも `V | undefined` を返す:

```typescript
// NG: Record アクセスをそのまま使用
const style = TYPE_STYLES[type]; // V | undefined
style.bg; // Error: Object is possibly 'undefined'

// OK: デフォルト定数をエクスポートして nullish coalescing
export const DEFAULT_TYPE_STYLE = { bg: "bg-muted", text: "text-foreground" };
const style = TYPE_STYLES[type] ?? DEFAULT_TYPE_STYLE;

// OK: ガード句
const style = TYPE_STYLES[type];
if (!style) return;
```

## Gotchas

- **`Object.fromEntries(arr.map(x => [k, v]))` は tuple 注釈なしで `any` に落ちる** — `.map(x => [k, v])` 戻り値は TS 仕様で `(K | V)[]` に推論。`Iterable<readonly any[]>` 第 2 オーバーロードにマッチし **全体が `any`** になる silent な型安全ホール。**必ず `.map((x): [string, V] => [k, v])` と tuple 注釈**する（2026-06-01 PAGE_TEMPLATES / section-metadata 他 7 箇所一括修正）
- **`exactOptionalPropertyTypes` 下で optional boolean prop に三項演算子禁止** — `disabled={cond ? !isDirty : undefined}` は型エラー（`boolean | undefined` は `boolean?` と非互換）。条件スプレッド `{...(cond && { disabled: !isDirty })}` を使用
- **`z.array(...).default([])` は `z.input` 型を optional 化する（Zod 4 公式挙動）** — conform `useForm` + `parseWithZod` は `z.output` を返すため `.default()` を schema に残したまま安全。React Hook Form は削除済
- **`__tests__/` は type-check 対象**（`tsconfig.test.json`）— `bun run type-check` が `tsc -p tsconfig.test.json` も実行し、テスト内型エラーを検出
