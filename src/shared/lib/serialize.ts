/**
 * シリアライゼーションユーティリティ
 *
 * React 19 / Next.js 16 では、Server Components から Client Components に
 * データを渡す際、シリアライズ可能なプレーンオブジェクトのみがサポートされます。
 *
 * Prisma オブジェクトには Symbol プロパティ（nodejs.util.inspect.custom など）が
 * 含まれており、そのままでは Client Components に渡せません。
 *
 * このユーティリティは Prisma オブジェクトをプレーンオブジェクト（POJO）に
 * 変換して、React のシリアライゼーション要件を満たします。
 *
 * @module serialize
 * @see https://react.dev/reference/rsc/use-server
 * @see https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns
 *
 * @example
 * ```typescript
 * // Server Component
 * import { toPlainObject, type Serialized } from '@/shared/lib/serialize'
 *
 * async function getData(): Promise<Serialized<User> | null> {
 *   const user = await prisma.user.findUnique({ where: { id } })
 *   return toPlainObject(user)
 * }
 * ```
 */

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * シリアライズ後の型を表現するユーティリティ型
 *
 * JSON.stringify/parse 後の型変換を正確に表現します。
 *
 * ## 型変換ルール
 *
 * | 入力型 | 出力型 | 備考 |
 * |--------|--------|------|
 * | `Date` | `string` | ISO 8601 形式 |
 * | `undefined` | 除去 | オブジェクトプロパティの場合 |
 * | `BigInt` | エラー | サポート外 |
 * | `Function` | 除去 | - |
 * | `Symbol` | 除去 | - |
 * | `Array<T>` | `Array<Serialized<T>>` | 再帰的に適用 |
 * | `object` | `{ [K]: Serialized<T[K]> }` | 再帰的に適用 |
 *
 * @typeParam T - シリアライズ前の型
 * @returns シリアライズ後の型
 *
 * @example
 * ```typescript
 * interface IconUser {
 *   id: string
 *   createdAt: Date
 *   deletedAt: Date | null
 * }
 *
 * type SerializedUser = Serialized<User>
 * // Result: { id: string; createdAt: string; deletedAt: string | null }
 * ```
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

/**
 * null 許容型のシリアライズ後の型
 *
 * `T | null` を適切に処理し、null の場合は null を保持します。
 *
 * @typeParam T - シリアライズ前の型（null 許容）
 * @returns シリアライズ後の型（null 許容）
 *
 * @example
 * ```typescript
 * type MaybeUser = SerializedNullable<User | null>
 * // Result: Serialized<User> | null
 * ```
 */
export type SerializedNullable<T> = T extends null ? null : Serialized<T>;

// =============================================================================
// Serialization Functions
// =============================================================================

/**
 * オブジェクトをプレーンオブジェクト（POJO）に変換
 *
 * Symbol プロパティ、関数、循環参照を除去し、
 * JSON シリアライズ可能な形式に変換します。
 *
 * ## パフォーマンス最適化
 *
 * - `null`/`undefined`: 即座に返却（変換不要）
 * - プリミティブ型（`string`/`number`/`boolean`）: 即座に返却
 * - オブジェクト/配列: `JSON.parse(JSON.stringify())` で変換
 *
 * ## エラーハンドリング
 *
 * 以下の場合にエラーをスローします:
 * - 循環参照を含むオブジェクト
 * - BigInt を含むオブジェクト
 * - その他シリアライズ不可能な値
 *
 * @typeParam T - 入力オブジェクトの型
 * @param obj - 変換するオブジェクト（Prisma の結果など）
 * @returns シリアライズ可能なプレーンオブジェクト
 * @throws {Error} シリアライズに失敗した場合
 *
 * @example
 * ```typescript
 * // Prisma の結果を変換
 * const prismaResult = await prisma.settings.findFirst()
 * const plainObject = toPlainObject(prismaResult)
 * // plainObject は Client Components に安全に渡せます
 *
 * // null の場合
 * const nullResult = toPlainObject(null)
 * // => null
 *
 * // プリミティブの場合（変換なし）
 * const primitive = toPlainObject('hello')
 * // => 'hello'
 * ```
 */
export function toPlainObject<T>(obj: T): Serialized<T>;
export function toPlainObject(obj: unknown): unknown {
  // null/undefined はそのまま返す（パフォーマンス最適化）
  if (obj === null || obj === undefined) {
    return obj;
  }

  // プリミティブ型はそのまま返す（パフォーマンス最適化）
  const type = typeof obj;
  if (type === "string" || type === "number" || type === "boolean") {
    return obj;
  }

  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    // 循環参照や BigInt などでエラーが発生した場合
    // Server Component でのエラーをわかりやすくする
    throw new Error(
      `[serialize] Failed to convert object to plain object. ` +
        `Ensure the object does not contain circular references, BigInt, or other non-serializable values.`,
    );
  }
}

/**
 * 配列の各要素をプレーンオブジェクトに変換
 *
 * 配列全体を一度に変換することで、要素ごとの変換より効率的です。
 *
 * @typeParam T - 配列要素の型
 * @param arr - 変換する配列
 * @returns シリアライズ可能なプレーンオブジェクトの配列
 * @throws {Error} シリアライズに失敗した場合
 *
 * @example
 * ```typescript
 * const prismaResults = await prisma.user.findMany()
 * const plainArray = toPlainArray(prismaResults)
 * ```
 */
export function toPlainArray<T>(arr: T[]): Serialized<T>[];
export function toPlainArray(arr: null): null;
export function toPlainArray(arr: undefined): undefined;
export function toPlainArray(arr: unknown): unknown {
  // null/undefined/空配列はそのまま返す（パフォーマンス最適化 + 防御的入力対応）
  if (arr === null || arr === undefined) return arr;
  if (!Array.isArray(arr) || arr.length === 0) {
    return arr;
  }

  try {
    return JSON.parse(JSON.stringify(arr));
  } catch {
    throw new Error(
      `[serialize] Failed to convert array to plain array. ` +
        `Ensure elements do not contain circular references, BigInt, or other non-serializable values.`,
    );
  }
}

// =============================================================================
// Date Utilities
// =============================================================================

/**
 * シリアライズ後の日付値を ISO 文字列に変換
 *
 * `toPlainObject` 後、Date オブジェクトは ISO 文字列になります。
 * このヘルパーは両方の形式を統一的に処理します。
 *
 * ## 入力と出力
 *
 * | 入力 | 出力 |
 * |------|------|
 * | `Date` オブジェクト | ISO 文字列 |
 * | ISO 文字列 | そのまま返却 |
 * | `null` / `undefined` | `undefined` |
 *
 * @param value - 日付値（Date または ISO 文字列）
 * @returns ISO 8601 形式の文字列、または undefined
 *
 * @example
 * ```typescript
 * const data = toPlainObject(prismaResult)
 * // data.createdAt は ISO 文字列になっている
 *
 * const isoString = toISOString(data.createdAt)
 * // => "2024-01-15T10:30:00.000Z"
 *
 * // <time> 要素で使用
 * <time dateTime={toISOString(post.publishedAt)}>
 *   {formatSerializedDate(post.publishedAt)}
 * </time>
 * ```
 */
export function toISOString(
  value: Date | string | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  // シリアライズ済み（string）の場合はそのまま返す（パフォーマンス最適化）
  if (typeof value === "string") return value;
  return value.toISOString();
}

/**
 * シリアライズ後の日付値を表示用にフォーマット
 *
 * 日本語ロケールでの日付表示に最適化されています。
 *
 * ## デフォルトフォーマット
 *
 * `2024年1月15日` 形式で出力されます。
 *
 * ## カスタムフォーマット
 *
 * `Intl.DateTimeFormatOptions` でカスタマイズ可能です。
 *
 * @param value - 日付値（Date または ISO 文字列）
 * @param options - Intl.DateTimeFormatOptions（オプション）
 * @returns フォーマットされた日付文字列、無効な場合は空文字
 *
 * @example
 * ```typescript
 * // デフォルトフォーマット
 * formatSerializedDate(data.publishedAt)
 * // => "2024年1月15日"
 *
 * // カスタムフォーマット
 * formatSerializedDate(data.publishedAt, {
 *   year: 'numeric',
 *   month: 'short',
 *   day: 'numeric',
 *   hour: '2-digit',
 *   minute: '2-digit',
 * })
 * // => "2024年1月15日 10:30"
 *
 * // 無効な値
 * formatSerializedDate(null) // => ""
 * formatSerializedDate('invalid') // => ""
 * ```
 */
export function formatSerializedDate(
  value: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined) return "";

  // Date オブジェクトまたは ISO 文字列を統一的に処理
  const date = typeof value === "string" ? new Date(value) : value;

  // Invalid Date チェック
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(
    "ja-JP",
    options ?? {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
}

/**
 * 日付をYYYY-MM-DD形式の文字列に変換
 *
 * input type="date" やクエリパラメータで使用される形式です。
 *
 * @param date - 変換する日付
 * @returns YYYY-MM-DD 形式の文字列
 *
 * @example
 * ```typescript
 * toDateString(new Date('2024-01-15T10:30:00Z'))
 * // => "2024-01-15"
 *
 * // input[type="date"] で使用
 * <input type="date" value={toDateString(selectedDate)} />
 * ```
 */
export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

/** `input[type="date"]` の value として許容される YYYY-MM-DD 形式かどうか */
const DATE_INPUT_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * シリアライズ済みの日付文字列（ISO 8601 日時や YYYY-MM-DD）を、HTML `input[type="date"]`
 * の `value` に使える **YYYY-MM-DD** へ正規化する。
 *
 * React のレンダー純粋性（`@eslint-react/purity`）を満たすため、`Date` を介さず文字列だけで解釈する。
 * Prisma / `JSON.stringify` 経由の典型形（例: `2024-01-15T00:00:00.000Z`）を想定する。
 *
 * @param value - API・DB から渡された日付文字列、または null / undefined
 * @returns フォーム向け日付。空・解釈不能なら `""`
 */
export function dateInputValueFromSerialized(
  value: string | null | undefined,
): string {
  if (value == null || value === "") {
    return "";
  }
  if (DATE_INPUT_VALUE_PATTERN.test(value)) {
    return value;
  }
  if (value.length >= 10 && value[4] === "-" && value[7] === "-") {
    const head = value.slice(0, 10);
    if (DATE_INPUT_VALUE_PATTERN.test(head)) {
      return head;
    }
  }
  return "";
}

// =============================================================================
// Safe Access Utilities
// =============================================================================

/**
 * カンマ区切り文字列の最初の要素を安全に取得
 *
 * X-Forwarded-For などのヘッダー値から最初のIPアドレスを取得する際に使用します。
 *
 * @param value - カンマ区切り文字列
 * @returns 最初の要素（トリム済み）、または null
 *
 * @example
 * ```typescript
 * extractFirstFromCommaList('192.168.1.1, 10.0.0.1')
 * // => "192.168.1.1"
 *
 * extractFirstFromCommaList(null)
 * // => null
 * ```
 */
export function extractFirstFromCommaList(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const first = value.split(",")[0];
  return first ? first.trim() : null;
}

// =============================================================================
// Type-safe Object Utilities
// =============================================================================

/**
 * 型安全な Object.keys
 *
 * Object.keys() は string[] を返すため、キーの型情報が失われます。
 * この関数はオブジェクトのキーを型安全に取得します。
 *
 * @typeParam T - オブジェクトの型
 * @param obj - キーを取得するオブジェクト
 * @returns キーの配列（型安全）
 *
 * @example
 * ```typescript
 * const config = { primary: '#000', secondary: '#fff' } as const
 * const keys = keysOf(config) // readonly ('primary' | 'secondary')[]
 * ```
 */
export function keysOf<T extends object>(obj: T): (keyof T)[] {
  // Object.keys() は string[] を返す（TypeScript の構造的型付けの制約）。
  // keyof T も実行時には文字列キーのため、この as は型安全。
  return Object.keys(obj) as (keyof T)[];
}

/**
 * 型安全な Object.entries
 *
 * @typeParam T - オブジェクトの型
 * @param obj - エントリを取得するオブジェクト
 * @returns [key, value] ペアの配列（型安全）
 */
export function entriesOf<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  // Object.entries() は [string, T[keyof T]][] を返す（TypeScript の構造的型付けの制約）。
  // keyof T も実行時には文字列キーのため、この as は型安全。
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/**
 * 型安全な filter(Boolean) の代替
 *
 * `arr.filter(Boolean) as T[]` パターンを型安全に置き換えます。
 * falsy値（false, null, undefined）を除去し、適切な型を推論します。
 *
 * @example
 * ```typescript
 * const items = [
 *   condition1 && { id: 1 },
 *   condition2 && { id: 2 },
 * ]
 * // Before: items.filter(Boolean) as Item[]
 * // After:  filterTruthy(items)
 * ```
 */
export function filterTruthy<T>(
  arr: readonly (T | false | null | undefined)[],
): T[] {
  return arr.filter((x): x is T => Boolean(x));
}

// =============================================================================
// exactOptionalPropertyTypes Utilities
// =============================================================================

/**
 * オブジェクトから `undefined` 値のプロパティを除去する型
 *
 * `exactOptionalPropertyTypes: true` 環境で、Zod の `.optional()` が生成する
 * `T | undefined` を `?: Exclude<T, undefined>` に変換します。
 *
 * @example
 * ```typescript
 * type Input = { title: string; ogpTitle?: string | null | undefined }
 * type Result = OmitUndefined<Input>
 * // = { title: string; ogpTitle?: string | null }
 * ```
 */
export type OmitUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

/**
 * オブジェクトから `undefined` 値のプロパティを実行時に除去
 *
 * `{ field: undefined }` → `{}` に変換し、`exactOptionalPropertyTypes` で
 * `field?: T | null` に代入可能にします。
 *
 * Zod の `.optional()` / `.nullable().optional()` の出力を
 * ドメインコマンド型に渡す境界で使用します。
 *
 * @example
 * ```typescript
 * const zodOutput = schema.parse(input);
 * // { title: "Hello", ogpTitle: undefined }
 *
 * const clean = omitUndefined(zodOutput);
 * // { title: "Hello" } — ogpTitle プロパティが除去される
 *
 * await createPost(clean); // exactOptionalPropertyTypes で型安全
 * ```
 */
export function omitUndefined<T extends object>(obj: T): OmitUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as OmitUndefined<T>;
}

// =============================================================================
// Type Guard Generators
// =============================================================================

/**
 * unknown を Record<string, unknown> に絞り込む型ガード
 *
 * JSON値やPrismaのJSONフィールドを型安全に扱う際に使用します。
 * `typeof x === 'object' && x !== null` の後の `as Record<string, unknown>`
 * パターンを置き換えます。
 *
 * @example
 * ```typescript
 * // Before: as Record<string, unknown> が必要
 * if (typeof value !== 'object' || value === null) return false
 * const obj = value as Record<string, unknown>
 *
 * // After: 型ガードで安全に絞り込み
 * if (!isRecord(value)) return false
 * // value は Record<string, unknown> として扱える
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 型ガード関数を生成する
 *
 * const配列から型ガード関数を作成し、`as`アサーションを排除します。
 * Set-based O(1) lookupを使用して高速に検証します。
 *
 * @example
 * ```typescript
 * const TABS = ['posts', 'categories', 'tags'] as const
 * type Tab = typeof TABS[number]
 *
 * const isTab = createTypeGuard(TABS)
 * // isTab(value) returns value is Tab
 *
 * // Usage:
 * if (isTab(tab)) {
 *   // tab is now typed as Tab
 * }
 * ```
 */
export function createTypeGuard<T extends string>(
  allowedValues: readonly T[],
): (value: unknown) => value is T {
  const validSet = new Set<string>(allowedValues);
  return (value: unknown): value is T => {
    return typeof value === "string" && validSet.has(value);
  };
}
