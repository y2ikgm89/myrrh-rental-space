import { describe, test, expect } from "bun:test";
import {
  toPlainObject,
  toPlainArray,
  toISOString,
  formatSerializedDate,
  toDateString,
  extractFirstFromCommaList,
  keysOf,
  entriesOf,
  filterTruthy,
  isRecord,
  createTypeGuard,
} from "@/shared/lib/serialize";

describe("serialize", () => {
  describe("toPlainObject", () => {
    test("null を返す", () => {
      expect(toPlainObject(null)).toBe(null);
    });

    test("undefined を返す", () => {
      expect(toPlainObject(undefined)).toBe(undefined);
    });

    test("文字列をそのまま返す", () => {
      expect(toPlainObject("hello")).toBe("hello");
    });

    test("数値をそのまま返す", () => {
      expect(toPlainObject(42)).toBe(42);
    });

    test("真偽値をそのまま返す", () => {
      expect(toPlainObject(true)).toBe(true);
      expect(toPlainObject(false)).toBe(false);
    });

    test("プレーンオブジェクトを変換する", () => {
      const input = { id: 1, name: "test" };
      const result = toPlainObject(input);
      expect(result).toEqual(input);
    });

    test("Date を ISO 文字列に変換する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = toPlainObject({ createdAt: date });
      // toPlainObject<T> の返り型は T のまま（Date型）だが、実行時は string に変換される
      // unknown 経由で型制約を回避
      const createdAt: unknown = result.createdAt;
      expect(createdAt).toBe("2024-01-15T10:30:00.000Z");
    });

    test("ネストされたオブジェクトを変換する", () => {
      const input = {
        user: {
          id: 1,
          profile: {
            name: "test",
            age: 25,
          },
        },
      };
      const result = toPlainObject(input);
      expect(result).toEqual(input);
    });

    test("配列を含むオブジェクトを変換する", () => {
      const input = {
        items: [{ id: 1 }, { id: 2 }],
        tags: ["a", "b"],
      };
      const result = toPlainObject(input);
      expect(result).toEqual(input);
    });

    test("Symbol プロパティを除去する", () => {
      const symbol = Symbol("test");
      const input = { id: 1, [symbol]: "removed" };
      const result = toPlainObject(input);
      // TS型には Symbol プロパティが含まれるため unknown 経由で比較
      const plain: unknown = result;
      expect(plain).toEqual({ id: 1 });
      expect(symbol in result).toBe(false);
    });

    test("循環参照でエラーをスローする", () => {
      const circular: any = { id: 1 };
      circular.self = circular;

      expect(() => toPlainObject(circular)).toThrow(
        "[serialize] Failed to convert object to plain object",
      );
    });

    test("BigInt でエラーをスローする", () => {
      const input = { id: BigInt(123) };

      expect(() => toPlainObject(input)).toThrow(
        "[serialize] Failed to convert object to plain object",
      );
    });

    test("関数を除去する", () => {
      const input = {
        id: 1,
        method() {
          return "test";
        },
      };
      const result = toPlainObject(input);
      // TS型には method プロパティが含まれるため unknown 経由で比較
      const plain: unknown = result;
      expect(plain).toEqual({ id: 1 });
    });
  });

  describe("toPlainArray", () => {
    test("空配列をそのまま返す", () => {
      const input: any[] = [];
      const result = toPlainArray(input);
      expect(result).toBe(input);
    });

    test("null をそのまま返す", () => {
      // toPlainArray の型は T[] だが null/undefined をそのまま返す実装
      // unknown 経由で型制約を回避
      const result: unknown = toPlainArray(null as any);
      expect(result).toBe(null);
    });

    test("undefined をそのまま返す", () => {
      const result: unknown = toPlainArray(undefined as any);
      expect(result).toBe(undefined);
    });

    test("プレーンオブジェクトの配列を変換する", () => {
      const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = toPlainArray(input);
      expect(result).toEqual(input);
    });

    test("Date を含む配列を変換する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const input = [
        { id: 1, createdAt: date },
        { id: 2, createdAt: date },
      ];
      const result = toPlainArray(input);
      // toPlainArray<T> の返り型は T[] のまま（Date型）だが、実行時は string に変換される
      const createdAt0: unknown = result[0]?.createdAt;
      const createdAt1: unknown = result[1]?.createdAt;
      expect(createdAt0).toBe("2024-01-15T10:30:00.000Z");
      expect(createdAt1).toBe("2024-01-15T10:30:00.000Z");
    });

    test("ネストされたオブジェクトの配列を変換する", () => {
      const input = [
        {
          user: { id: 1, profile: { name: "test1" } },
        },
        {
          user: { id: 2, profile: { name: "test2" } },
        },
      ];
      const result = toPlainArray(input);
      expect(result).toEqual(input);
    });

    test("循環参照でエラーをスローする", () => {
      const circular: any = { id: 1 };
      circular.self = circular;

      expect(() => toPlainArray([circular])).toThrow(
        "[serialize] Failed to convert array to plain array",
      );
    });
  });

  describe("toISOString", () => {
    test("Date オブジェクトを ISO 文字列に変換する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      expect(toISOString(date)).toBe("2024-01-15T10:30:00.000Z");
    });

    test("ISO 文字列をそのまま返す", () => {
      const isoString = "2024-01-15T10:30:00.000Z";
      expect(toISOString(isoString)).toBe(isoString);
    });

    test("null を undefined に変換する", () => {
      expect(toISOString(null)).toBe(undefined);
    });

    test("undefined を undefined に変換する", () => {
      expect(toISOString(undefined)).toBe(undefined);
    });
  });

  describe("formatSerializedDate", () => {
    test("Date オブジェクトを日本語形式にフォーマットする", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = formatSerializedDate(date);
      expect(result).toMatch(/2024年1月15日/);
    });

    test("ISO 文字列を日本語形式にフォーマットする", () => {
      const isoString = "2024-01-15T10:30:00.000Z";
      const result = formatSerializedDate(isoString);
      expect(result).toMatch(/2024年1月15日/);
    });

    test("null の場合は空文字を返す", () => {
      expect(formatSerializedDate(null)).toBe("");
    });

    test("undefined の場合は空文字を返す", () => {
      expect(formatSerializedDate(undefined)).toBe("");
    });

    test("無効な日付文字列の場合は空文字を返す", () => {
      expect(formatSerializedDate("invalid-date")).toBe("");
    });

    test("カスタムフォーマットオプションを適用する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = formatSerializedDate(date, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      expect(result).toMatch(/2024\/01\/15/);
    });

    test("時刻を含むフォーマットオプションを適用する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = formatSerializedDate(date, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      expect(result).toMatch(/2024\/01\/15/);
    });
  });

  describe("toDateString", () => {
    test("Date を YYYY-MM-DD 形式に変換する", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      expect(toDateString(date)).toBe("2024-01-15");
    });

    test("異なる日付を正しく変換する", () => {
      const date = new Date("2023-12-31T23:59:59.999Z");
      expect(toDateString(date)).toBe("2023-12-31");
    });
  });

  describe("extractFirstFromCommaList", () => {
    test("カンマ区切り文字列の最初の要素を取得する", () => {
      expect(extractFirstFromCommaList("192.168.1.1, 10.0.0.1")).toBe(
        "192.168.1.1",
      );
    });

    test("単一要素の場合はそのまま返す", () => {
      expect(extractFirstFromCommaList("192.168.1.1")).toBe("192.168.1.1");
    });

    test("空白をトリムする", () => {
      expect(extractFirstFromCommaList("  192.168.1.1  , 10.0.0.1")).toBe(
        "192.168.1.1",
      );
    });

    test("null の場合は null を返す", () => {
      expect(extractFirstFromCommaList(null)).toBe(null);
    });

    test("undefined の場合は null を返す", () => {
      expect(extractFirstFromCommaList(undefined)).toBe(null);
    });

    test("空文字列の場合は null を返す", () => {
      expect(extractFirstFromCommaList("")).toBe(null);
    });

    test("カンマのみの場合は null を返す", () => {
      expect(extractFirstFromCommaList(",")).toBe(null);
    });
  });

  describe("keysOf", () => {
    test("オブジェクトのキーを型安全に取得する", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const keys = keysOf(obj);
      expect(keys).toEqual(["a", "b", "c"]);
    });

    test("空オブジェクトの場合は空配列を返す", () => {
      const obj = {};
      const keys = keysOf(obj);
      expect(keys).toEqual([]);
    });

    test("constオブジェクトのキーを取得する", () => {
      const config = { primary: "#000", secondary: "#fff" } as const;
      const keys = keysOf(config);
      expect(keys).toEqual(["primary", "secondary"]);
    });
  });

  describe("entriesOf", () => {
    test("オブジェクトのエントリを型安全に取得する", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const entries = entriesOf(obj);
      expect(entries).toEqual([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]);
    });

    test("空オブジェクトの場合は空配列を返す", () => {
      const obj = {};
      const entries = entriesOf(obj);
      expect(entries).toEqual([]);
    });

    test("異なる型の値を持つオブジェクトのエントリを取得する", () => {
      const obj = { name: "test", age: 25, active: true };
      const entries = entriesOf(obj);
      expect(entries).toEqual([
        ["name", "test"],
        ["age", 25],
        ["active", true],
      ]);
    });
  });

  describe("filterTruthy", () => {
    test("falsy 値を除去する", () => {
      const arr = [1, false, 2, null, 3, undefined, 4, 0, 5];
      const result = filterTruthy(arr);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    test("全て falsy の場合は空配列を返す", () => {
      const arr = [false, null, undefined];
      const result = filterTruthy(arr);
      expect(result).toEqual([]);
    });

    test("全て truthy の場合はそのまま返す", () => {
      const arr = [1, 2, 3, "a", "b", true];
      const result = filterTruthy(arr);
      expect(result).toEqual([1, 2, 3, "a", "b", true]);
    });

    test("条件付きオブジェクトの配列をフィルタする", () => {
      const condition1 = true;
      const condition2 = false;
      const arr = [condition1 && { id: 1 }, condition2 && { id: 2 }, { id: 3 }];
      const result = filterTruthy(arr);
      expect(result).toEqual([{ id: 1 }, { id: 3 }]);
    });

    test("空配列の場合は空配列を返す", () => {
      const arr: (number | false | null | undefined)[] = [];
      const result = filterTruthy(arr);
      expect(result).toEqual([]);
    });
  });

  describe("isRecord", () => {
    test("プレーンオブジェクトは true を返す", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord({ nested: { value: 1 } })).toBe(true);
    });

    test("null は false を返す", () => {
      expect(isRecord(null)).toBe(false);
    });

    test("undefined は false を返す", () => {
      expect(isRecord(undefined)).toBe(false);
    });

    test("配列は false を返す", () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
    });

    test("プリミティブ型は false を返す", () => {
      expect(isRecord("string")).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });

    test("Date オブジェクトは true を返す", () => {
      expect(isRecord(new Date())).toBe(true);
    });

    test("関数は false を返す", () => {
      expect(isRecord(() => {})).toBe(false);
      expect(isRecord(function () {})).toBe(false);
    });
  });

  describe("createTypeGuard", () => {
    const TABS = ["posts", "categories", "tags"] as const;
    const isTab = createTypeGuard(TABS);

    test("有効な値で true を返す", () => {
      expect(isTab("posts")).toBe(true);
      expect(isTab("categories")).toBe(true);
      expect(isTab("tags")).toBe(true);
    });

    test("無効な値で false を返す", () => {
      expect(isTab("invalid")).toBe(false);
      expect(isTab("post")).toBe(false);
      expect(isTab("tag")).toBe(false);
    });

    test("非文字列値で false を返す", () => {
      expect(isTab(123)).toBe(false);
      expect(isTab(null)).toBe(false);
      expect(isTab(undefined)).toBe(false);
      expect(isTab({})).toBe(false);
      expect(isTab([])).toBe(false);
    });

    test("空文字列で false を返す", () => {
      expect(isTab("")).toBe(false);
    });

    test("大文字小文字を区別する", () => {
      expect(isTab("Posts")).toBe(false);
      expect(isTab("POSTS")).toBe(false);
    });
  });
});
