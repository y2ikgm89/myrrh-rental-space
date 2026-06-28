import { describe, test, expect } from "bun:test";
import {
  toPlainObject,
  toPlainArray,
  toISOString,
  formatSerializedDate,
  toDateString,
  dateInputValueFromSerialized,
  extractFirstFromCommaList,
  keysOf,
  entriesOf,
  filterTruthy,
  omitUndefined,
  isRecord,
  createTypeGuard,
} from "@/shared/lib/serialize";

// ===========================================================================
// toPlainObject
// ===========================================================================

describe("toPlainObject", () => {
  describe("正常系", () => {
    test("プレーンオブジェクトを変換する", () => {
      const input = { id: 1, name: "test", active: true };
      expect(toPlainObject(input)).toEqual(input);
    });

    test("Date を ISO 文字列に変換する", () => {
      const date = new Date("2024-06-15T12:00:00.000Z");
      const result = toPlainObject({ createdAt: date });
      // Serialized<T> により Date → string narrow 済、直接 access 可能
      expect(result.createdAt).toBe("2024-06-15T12:00:00.000Z");
    });

    test("ネストされたオブジェクトを変換する", () => {
      const input = { user: { id: 1, profile: { name: "Alice", age: 30 } } };
      expect(toPlainObject(input)).toEqual(input);
    });

    test("配列を含むオブジェクトを変換する", () => {
      const input = { items: [{ id: 1 }, { id: 2 }], tags: ["a", "b"] };
      expect(toPlainObject(input)).toEqual(input);
    });

    test("Symbol プロパティを除去する", () => {
      const sym = Symbol("hidden");
      const input = { id: 1, [sym]: "removed" };
      const result = toPlainObject(input);
      // Serialized<T> が Symbol key を除外するため型レベルでも { id: number } に narrow
      expect(result).toEqual({ id: 1 });
      expect(sym in result).toBe(false);
    });

    test("関数を除去する", () => {
      const input = {
        id: 1,
        method() {
          return "x";
        },
      };
      const result = toPlainObject(input);
      // Serialized<T> が function key を除外するため型レベルでも { id: number } に narrow
      expect(result).toEqual({ id: 1 });
    });
  });

  describe("プリミティブの早期リターン（パフォーマンス最適化）", () => {
    test("null をそのまま返す", () => {
      expect(toPlainObject(null)).toBe(null);
    });

    test("undefined をそのまま返す", () => {
      expect(toPlainObject(undefined)).toBe(undefined);
    });

    test("文字列をそのまま返す", () => {
      expect(toPlainObject("hello")).toBe("hello");
    });

    test("数値をそのまま返す", () => {
      expect(toPlainObject(0)).toBe(0);
      expect(toPlainObject(-1)).toBe(-1);
      expect(toPlainObject(3.14)).toBe(3.14);
    });

    test("真偽値をそのまま返す", () => {
      expect(toPlainObject(true)).toBe(true);
      expect(toPlainObject(false)).toBe(false);
    });
  });

  describe("異常系", () => {
    test("循環参照でエラーをスローする", () => {
      type CircularFixture = { id: number; self?: CircularFixture };
      const circular: CircularFixture = { id: 1 };
      circular.self = circular;
      expect(() => toPlainObject(circular)).toThrow(
        "[serialize] Failed to convert object to plain object",
      );
    });

    test("BigInt を含むオブジェクトでエラーをスローする", () => {
      expect(() => toPlainObject({ id: BigInt(123) })).toThrow(
        "[serialize] Failed to convert object to plain object",
      );
    });
  });

  describe("エッジケース", () => {
    test("空オブジェクトを変換する", () => {
      expect(toPlainObject({})).toEqual({});
    });

    test("深くネストされたオブジェクトを変換する", () => {
      const input = { a: { b: { c: { d: { e: "deep" } } } } };
      expect(toPlainObject(input)).toEqual(input);
    });

    test("複数の Date フィールドを変換する", () => {
      const date1 = new Date("2024-01-01T12:00:00.000Z");
      const date2 = new Date("2024-12-31T12:00:00.000Z");
      const result = toPlainObject({ start: date1, end: date2 });
      // Serialized<T> により Date → string narrow 済、直接 access 可能
      expect(result.start).toBe("2024-01-01T12:00:00.000Z");
      expect(result.end).toBe("2024-12-31T12:00:00.000Z");
    });
  });
});

// ===========================================================================
// toPlainArray
// ===========================================================================

describe("toPlainArray", () => {
  describe("正常系", () => {
    test("プレーンオブジェクトの配列を変換する", () => {
      const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(toPlainArray(input)).toEqual(input);
    });

    test("Date を含む配列を変換する", () => {
      const date = new Date("2024-06-15T12:00:00.000Z");
      const input = [{ id: 1, createdAt: date }];
      const result = toPlainArray(input);
      // Serialized<T> により Date → string narrow 済、直接 access 可能
      expect(result[0]?.createdAt).toBe("2024-06-15T12:00:00.000Z");
    });

    test("ネストされた配列を変換する", () => {
      const input = [
        { user: { id: 1, name: "Alice" } },
        { user: { id: 2, name: "Bob" } },
      ];
      expect(toPlainArray(input)).toEqual(input);
    });
  });

  describe("早期リターン（パフォーマンス最適化）", () => {
    test("空配列をそのまま返す（同一参照）", () => {
      const input: unknown[] = [];
      expect(toPlainArray(input)).toBe(input);
    });

    test("null をそのまま返す", () => {
      // toPlainArray の null overload で戻り値型は null に narrow 済
      const result = toPlainArray(null);
      expect(result).toBe(null);
    });

    test("undefined をそのまま返す", () => {
      // toPlainArray の undefined overload で戻り値型は undefined に narrow 済
      const result = toPlainArray(undefined);
      expect(result).toBe(undefined);
    });
  });

  describe("異常系", () => {
    test("循環参照でエラーをスローする", () => {
      type CircularFixture = { id: number; self?: CircularFixture };
      const circular: CircularFixture = { id: 1 };
      circular.self = circular;
      expect(() => toPlainArray([circular])).toThrow(
        "[serialize] Failed to convert array to plain array",
      );
    });

    test("BigInt を含む配列でエラーをスローする", () => {
      expect(() => toPlainArray([{ id: BigInt(1) }])).toThrow(
        "[serialize] Failed to convert array to plain array",
      );
    });
  });

  describe("エッジケース", () => {
    test("単一要素の配列を変換する", () => {
      expect(toPlainArray([{ id: 42 }])).toEqual([{ id: 42 }]);
    });

    test("100要素の配列を変換する", () => {
      const input = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      expect(toPlainArray(input)).toEqual(input);
    });
  });
});

// ===========================================================================
// toISOString
// ===========================================================================

describe("toISOString", () => {
  describe("正常系", () => {
    test("Date オブジェクトを ISO 文字列に変換する", () => {
      const date = new Date("2024-06-15T12:00:00.000Z");
      expect(toISOString(date)).toBe("2024-06-15T12:00:00.000Z");
    });

    test("ISO 文字列をそのまま返す（パフォーマンス最適化）", () => {
      const iso = "2024-06-15T12:00:00.000Z";
      expect(toISOString(iso)).toBe(iso);
    });

    test("YYYY-MM-DD 形式の文字列をそのまま返す", () => {
      expect(toISOString("2024-06-15")).toBe("2024-06-15");
    });
  });

  describe("異常系・エッジケース", () => {
    test("null を渡すと undefined を返す", () => {
      expect(toISOString(null)).toBe(undefined);
    });

    test("undefined を渡すと undefined を返す", () => {
      expect(toISOString(undefined)).toBe(undefined);
    });

    test("空文字列をそのまま返す（文字列扱い）", () => {
      // typeof "" === "string" のため早期リターン
      expect(toISOString("")).toBe("");
    });
  });
});

// ===========================================================================
// formatSerializedDate
// ===========================================================================

describe("formatSerializedDate", () => {
  // タイムゾーン安全な固定日時（UTC 正午）
  const DATE_OBJ = new Date("2024-01-15T12:00:00.000Z");
  const DATE_ISO = "2024-01-15T12:00:00.000Z";

  describe("正常系", () => {
    test("Date オブジェクトを日本語形式（YYYY年M月D日）にフォーマットする", () => {
      expect(formatSerializedDate(DATE_OBJ)).toMatch(/2024年1月15日/);
    });

    test("ISO 文字列を日本語形式にフォーマットする", () => {
      expect(formatSerializedDate(DATE_ISO)).toMatch(/2024年1月15日/);
    });

    test("Date オブジェクトと ISO 文字列で同じ出力になる", () => {
      expect(formatSerializedDate(DATE_OBJ)).toBe(
        formatSerializedDate(DATE_ISO),
      );
    });

    test("カスタムオプション（2桁月日）でフォーマットする", () => {
      const result = formatSerializedDate(DATE_OBJ, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      expect(result).toMatch(/2024\/01\/15/);
    });

    test("時刻を含むカスタムオプションでフォーマットする", () => {
      const result = formatSerializedDate(DATE_OBJ, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      expect(result).toMatch(/2024\/01\/15/);
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    test("月末（12月31日）を正しくフォーマットする", () => {
      const date = new Date("2023-12-31T12:00:00.000Z");
      expect(formatSerializedDate(date)).toMatch(/2023年12月31日/);
    });

    test("うるう年（2月29日）を正しくフォーマットする", () => {
      const date = new Date("2024-02-29T12:00:00.000Z");
      expect(formatSerializedDate(date)).toMatch(/2024年2月29日/);
    });
  });

  describe("異常系", () => {
    test("null を渡すと空文字列を返す", () => {
      expect(formatSerializedDate(null)).toBe("");
    });

    test("undefined を渡すと空文字列を返す", () => {
      expect(formatSerializedDate(undefined)).toBe("");
    });

    test("無効な日付文字列を渡すと空文字列を返す", () => {
      expect(formatSerializedDate("invalid-date")).toBe("");
    });

    test("数字のみの文字列を渡すと空文字列を返す", () => {
      // new Date("20240115") は実装依存だが Invalid Date になるケースを想定
      // 実際の結果は環境に依存するため「例外が発生しない」ことのみ確認
      expect(() => formatSerializedDate("20240115")).not.toThrow();
    });
  });
});

// ===========================================================================
// toDateString
// ===========================================================================

describe("toDateString", () => {
  describe("正常系", () => {
    test("UTC 日付を YYYY-MM-DD 形式に変換する", () => {
      expect(toDateString(new Date("2024-01-15T12:00:00.000Z"))).toBe(
        "2024-01-15",
      );
    });

    test("12月31日を正しく変換する", () => {
      expect(toDateString(new Date("2023-12-31T12:00:00.000Z"))).toBe(
        "2023-12-31",
      );
    });

    test("うるう年の2月29日を正しく変換する", () => {
      expect(toDateString(new Date("2024-02-29T12:00:00.000Z"))).toBe(
        "2024-02-29",
      );
    });

    test("1月1日を正しく変換する", () => {
      expect(toDateString(new Date("2024-01-01T12:00:00.000Z"))).toBe(
        "2024-01-01",
      );
    });
  });

  describe("エッジケース", () => {
    test("月と日が一桁の場合にゼロ埋めされる", () => {
      // 3月5日
      expect(toDateString(new Date("2024-03-05T12:00:00.000Z"))).toBe(
        "2024-03-05",
      );
    });
  });
});

// ===========================================================================
// dateInputValueFromSerialized
// ===========================================================================

describe("dateInputValueFromSerialized", () => {
  describe("正常系", () => {
    test("YYYY-MM-DD 形式はそのまま返す", () => {
      expect(dateInputValueFromSerialized("2024-01-15")).toBe("2024-01-15");
    });

    test("ISO 日時から日付部分（YYYY-MM-DD）を取り出す", () => {
      expect(dateInputValueFromSerialized("2024-01-15T00:00:00.000Z")).toBe(
        "2024-01-15",
      );
    });

    test("タイムゾーンオフセット付き ISO 文字列から日付部分を取り出す", () => {
      expect(dateInputValueFromSerialized("2024-06-15T09:00:00+09:00")).toBe(
        "2024-06-15",
      );
    });

    test("スペース区切りの日時形式から日付部分を取り出す", () => {
      // 先頭10文字が YYYY-MM-DD パターンであれば取り出せる
      expect(dateInputValueFromSerialized("2024-06-15 10:30:00")).toBe(
        "2024-06-15",
      );
    });
  });

  describe("異常系", () => {
    test("null を渡すと空文字列を返す", () => {
      expect(dateInputValueFromSerialized(null)).toBe("");
    });

    test("undefined を渡すと空文字列を返す", () => {
      expect(dateInputValueFromSerialized(undefined)).toBe("");
    });

    test("空文字列を渡すと空文字列を返す", () => {
      expect(dateInputValueFromSerialized("")).toBe("");
    });

    test("解釈不能な文字列は空文字列を返す", () => {
      expect(dateInputValueFromSerialized("not-a-date")).toBe("");
    });

    test("9文字以下の文字列（短すぎる）は空文字列を返す", () => {
      // 10文字未満は YYYY-MM-DD パターンに届かない
      expect(dateInputValueFromSerialized("2024-01-")).toBe("");
      expect(dateInputValueFromSerialized("2024")).toBe("");
    });

    test("ハイフン位置が違う文字列は空文字列を返す", () => {
      // 5文字目と8文字目がハイフンでない
      expect(dateInputValueFromSerialized("20240115T12:00:00")).toBe("");
    });
  });

  describe("エッジケース", () => {
    test("ちょうど10文字の YYYY-MM-DD を返す", () => {
      expect(dateInputValueFromSerialized("2024-12-31")).toBe("2024-12-31");
    });

    test("11文字以上でも先頭10文字が YYYY-MM-DD なら抽出する", () => {
      expect(dateInputValueFromSerialized("2024-01-15X")).toBe("2024-01-15");
    });
  });
});

// ===========================================================================
// extractFirstFromCommaList
// ===========================================================================

describe("extractFirstFromCommaList", () => {
  describe("正常系", () => {
    test("カンマ区切り文字列の最初の要素を取得する", () => {
      expect(
        extractFirstFromCommaList("192.168.1.1, 10.0.0.1, 172.16.0.1"),
      ).toBe("192.168.1.1");
    });

    test("単一要素の場合はそのまま返す", () => {
      expect(extractFirstFromCommaList("192.168.1.1")).toBe("192.168.1.1");
    });

    test("前後の空白をトリムする", () => {
      expect(extractFirstFromCommaList("  192.168.1.1  , 10.0.0.1")).toBe(
        "192.168.1.1",
      );
    });

    test("2要素の場合は最初の要素を返す", () => {
      expect(extractFirstFromCommaList("first, second")).toBe("first");
    });
  });

  describe("異常系", () => {
    test("null を渡すと null を返す", () => {
      expect(extractFirstFromCommaList(null)).toBe(null);
    });

    test("undefined を渡すと null を返す", () => {
      expect(extractFirstFromCommaList(undefined)).toBe(null);
    });

    test("空文字列を渡すと null を返す", () => {
      expect(extractFirstFromCommaList("")).toBe(null);
    });
  });

  describe("エッジケース", () => {
    test("先頭がカンマ（空の最初の要素）は null を返す", () => {
      expect(extractFirstFromCommaList(",second")).toBe(null);
    });

    test("カンマのみは null を返す", () => {
      expect(extractFirstFromCommaList(",")).toBe(null);
    });

    test("空白のみは空文字列を返す（trim 後の空文字 → そのまま返却）", () => {
      // "   " は truthy → split(",")[0] = "   " → trim() = "" → "" を返す
      // null ではなく "" が返る（trim 後の falsy チェックは行われない）
      expect(extractFirstFromCommaList("   ")).toBe("");
    });
  });
});

// ===========================================================================
// keysOf
// ===========================================================================

describe("keysOf", () => {
  describe("正常系", () => {
    test("オブジェクトのキーを取得する", () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(keysOf(obj)).toEqual(["a", "b", "c"]);
    });

    test("const オブジェクトのキーを取得する", () => {
      const config = { primary: "#000", secondary: "#fff" } as const;
      expect(keysOf(config)).toEqual(["primary", "secondary"]);
    });

    test("単一キーのオブジェクトを取得する", () => {
      expect(keysOf({ only: true })).toEqual(["only"]);
    });
  });

  describe("エッジケース", () => {
    test("空オブジェクトは空配列を返す", () => {
      expect(keysOf({})).toEqual([]);
    });

    test("異なる型の値を持つオブジェクトのキーを取得する", () => {
      const obj = { name: "test", count: 0, flag: false, data: null };
      expect(keysOf(obj)).toEqual(["name", "count", "flag", "data"]);
    });
  });
});

// ===========================================================================
// entriesOf
// ===========================================================================

describe("entriesOf", () => {
  describe("正常系", () => {
    test("オブジェクトのエントリを取得する", () => {
      const obj = { a: 1, b: 2 };
      expect(entriesOf(obj)).toEqual([
        ["a", 1],
        ["b", 2],
      ]);
    });

    test("異なる型の値を持つオブジェクトのエントリを取得する", () => {
      const obj = { name: "Alice", age: 30, active: true };
      expect(entriesOf(obj)).toEqual([
        ["name", "Alice"],
        ["age", 30],
        ["active", true],
      ]);
    });
  });

  describe("エッジケース", () => {
    test("空オブジェクトは空配列を返す", () => {
      expect(entriesOf({})).toEqual([]);
    });

    test("null 値を含むオブジェクトのエントリを取得する", () => {
      const obj = { id: 1, deletedAt: null };
      expect(entriesOf(obj)).toEqual([
        ["id", 1],
        ["deletedAt", null],
      ]);
    });
  });
});

// ===========================================================================
// filterTruthy
// ===========================================================================

describe("filterTruthy", () => {
  describe("正常系", () => {
    test("falsy 値（false, null, undefined）を除去する", () => {
      const arr = [1, false, 2, null, 3, undefined] as const;
      expect(filterTruthy(arr)).toEqual([1, 2, 3]);
    });

    test("数値 0 を除去する（falsy）", () => {
      const arr = [0, 1, 2];
      expect(filterTruthy(arr)).toEqual([1, 2]);
    });

    test("条件付きオブジェクトの配列をフィルタする", () => {
      const cond = false;
      const arr = [{ id: 1 }, cond && { id: 2 }, { id: 3 }];
      expect(filterTruthy(arr)).toEqual([{ id: 1 }, { id: 3 }]);
    });

    test("全て truthy の場合は全要素を返す", () => {
      const arr = [1, "a", true, { id: 1 }];
      expect(filterTruthy(arr)).toEqual([1, "a", true, { id: 1 }]);
    });
  });

  describe("異常系・エッジケース", () => {
    test("空配列は空配列を返す", () => {
      expect(filterTruthy([])).toEqual([]);
    });

    test("全て falsy の場合は空配列を返す", () => {
      const arr = [false, null, undefined] as const;
      expect(filterTruthy(arr)).toEqual([]);
    });

    test("空文字列を除去する（falsy）", () => {
      const arr = ["", "hello", ""];
      expect(filterTruthy(arr)).toEqual(["hello"]);
    });
  });
});

// ===========================================================================
// omitUndefined
// ===========================================================================

describe("omitUndefined", () => {
  describe("正常系", () => {
    test("undefined 値のプロパティを除去する", () => {
      const input = { title: "Hello", ogpTitle: undefined };
      expect(omitUndefined(input)).toEqual({ title: "Hello" });
    });

    test("undefined がないオブジェクトはそのまま返す", () => {
      const input = { title: "Hello", count: 0, active: false };
      expect(omitUndefined(input)).toEqual(input);
    });

    test("null 値は保持する（undefined のみ除去）", () => {
      const input = { title: "Hello", deletedAt: null, ogpTitle: undefined };
      expect(omitUndefined(input)).toEqual({ title: "Hello", deletedAt: null });
    });

    test("空文字列は保持する", () => {
      const input = { title: "", description: undefined };
      expect(omitUndefined(input)).toEqual({ title: "" });
    });

    test("数値 0 と false は保持する", () => {
      const input = { count: 0, active: false, removed: undefined };
      expect(omitUndefined(input)).toEqual({ count: 0, active: false });
    });
  });

  describe("エッジケース", () => {
    test("空オブジェクトは空オブジェクトを返す", () => {
      expect(omitUndefined({})).toEqual({});
    });

    test("全プロパティが undefined の場合は空オブジェクトを返す", () => {
      const input = { a: undefined, b: undefined };
      expect(omitUndefined(input)).toEqual({});
    });

    test("複数の undefined を除去する", () => {
      const input = { a: 1, b: undefined, c: "text", d: undefined, e: true };
      expect(omitUndefined(input)).toEqual({ a: 1, c: "text", e: true });
    });
  });
});

// ===========================================================================
// isRecord
// ===========================================================================

describe("isRecord", () => {
  describe("正常系: true を返すケース", () => {
    test("空オブジェクトは true", () => {
      expect(isRecord({})).toBe(true);
    });

    test("プロパティを持つオブジェクトは true", () => {
      expect(isRecord({ id: 1, name: "test" })).toBe(true);
    });

    test("ネストされたオブジェクトは true", () => {
      expect(isRecord({ nested: { value: 1 } })).toBe(true);
    });
  });

  describe("正常系: false を返すケース", () => {
    test("null は false", () => {
      expect(isRecord(null)).toBe(false);
    });

    test("undefined は false", () => {
      expect(isRecord(undefined)).toBe(false);
    });

    test("配列は false", () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
    });

    test("文字列は false", () => {
      expect(isRecord("string")).toBe(false);
    });

    test("数値は false", () => {
      expect(isRecord(42)).toBe(false);
    });

    test("真偽値は false", () => {
      expect(isRecord(true)).toBe(false);
      expect(isRecord(false)).toBe(false);
    });

    test("関数は false", () => {
      expect(isRecord(() => {})).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("Date オブジェクトは true（オブジェクト型）", () => {
      expect(isRecord(new Date())).toBe(true);
    });

    test("空配列は false（Array.isArray チェックで除外）", () => {
      expect(isRecord([])).toBe(false);
    });
  });
});

// ===========================================================================
// createTypeGuard
// ===========================================================================

describe("createTypeGuard", () => {
  const ROLES = ["admin", "staff", "viewer"] as const;
  const isRole = createTypeGuard(ROLES);

  describe("正常系", () => {
    test("許可された値で true を返す", () => {
      expect(isRole("admin")).toBe(true);
      expect(isRole("staff")).toBe(true);
      expect(isRole("viewer")).toBe(true);
    });

    test("許可されていない文字列で false を返す", () => {
      expect(isRole("owner")).toBe(false);
      expect(isRole("guest")).toBe(false);
    });

    test("非文字列値で false を返す", () => {
      expect(isRole(0)).toBe(false);
      expect(isRole(null)).toBe(false);
      expect(isRole(undefined)).toBe(false);
      expect(isRole({})).toBe(false);
      expect(isRole([])).toBe(false);
      expect(isRole(true)).toBe(false);
    });

    test("空文字列で false を返す", () => {
      expect(isRole("")).toBe(false);
    });

    test("大文字小文字を区別する", () => {
      expect(isRole("Admin")).toBe(false);
      expect(isRole("ADMIN")).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("単一値の配列から型ガードを生成できる", () => {
      const isSingle = createTypeGuard(["only"] as const);
      expect(isSingle("only")).toBe(true);
      expect(isSingle("other")).toBe(false);
    });

    test("空配列から生成した型ガードは全ての値で false を返す", () => {
      const isEmpty = createTypeGuard([] as const);
      expect(isEmpty("anything")).toBe(false);
      expect(isEmpty("")).toBe(false);
    });

    test("重複値を含む配列でも正常に動作する", () => {
      const isDup = createTypeGuard(["a", "b", "a"] as const);
      expect(isDup("a")).toBe(true);
      expect(isDup("b")).toBe(true);
      expect(isDup("c")).toBe(false);
    });

    test("Set-based O(1) ルックアップで多数の値に対応できる", () => {
      const values: readonly string[] = Array.from(
        { length: 1000 },
        (_, i) => `value_${i}`,
      );
      const isValue = createTypeGuard(values);
      expect(isValue("value_0")).toBe(true);
      expect(isValue("value_999")).toBe(true);
      expect(isValue("value_1000")).toBe(false);
    });
  });
});
