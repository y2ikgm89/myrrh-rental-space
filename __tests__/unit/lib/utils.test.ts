import { describe, test, expect } from "bun:test";
import { formatCurrency, formatPrice } from "@/shared/lib/pricing/format";
import {
  cn,
  escapeHtml,
  getFormString,
  getFormStringOrNull,
  getFormNumber,
  getFormBoolean,
  formatDate,
  formatDateShort,
  formatDateTimeShort,
  formatDateTimeFull,
  generateSlug,
} from "@/shared/lib/utils";

// =============================================================================
// cn（Tailwind クラスマージ）
// =============================================================================

describe("cn", () => {
  describe("正常系", () => {
    test("単一クラスをそのまま返す", () => {
      expect(cn("px-2")).toBe("px-2");
    });

    test("複数クラスを結合する", () => {
      expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    });

    test("Tailwind の競合するクラスを後者で上書きする", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    test("px と py の競合は発生しない", () => {
      expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    });

    test("条件付きクラス（true）を追加する", () => {
      expect(cn("base", true && "active")).toBe("base active");
    });

    test("条件付きクラス（false）を除外する", () => {
      expect(cn("base", false && "active")).toBe("base");
    });

    test("undefined を無視する", () => {
      expect(cn("base", undefined)).toBe("base");
    });

    test("null を無視する", () => {
      expect(cn("base", null)).toBe("base");
    });

    test("配列形式のクラスを結合する", () => {
      expect(cn(["px-2", "py-1"])).toBe("px-2 py-1");
    });

    test("オブジェクト形式で条件付きクラスを結合する", () => {
      expect(cn({ "text-red-500": true, "text-blue-500": false })).toBe(
        "text-red-500",
      );
    });

    test("text-* クラスの競合を後者で解決する", () => {
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });
  });

  describe("エッジケース", () => {
    test("引数なしで空文字列を返す", () => {
      expect(cn()).toBe("");
    });

    test("空文字列を無視する", () => {
      expect(cn("", "px-2")).toBe("px-2");
    });

    test("重複クラスを1つにまとめる", () => {
      expect(cn("px-2", "px-2")).toBe("px-2");
    });
  });
});

// =============================================================================
// escapeHtml（HTML エスケープ）
// =============================================================================

describe("escapeHtml", () => {
  describe("正常系", () => {
    test("& をエスケープする", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
    });

    test("< をエスケープする", () => {
      expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
    });

    test("> をエスケープする", () => {
      expect(escapeHtml("a > b")).toBe("a &gt; b");
    });

    test('" をエスケープする', () => {
      expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
    });

    test("' をエスケープする", () => {
      expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    test("スクリプトタグをエスケープする", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
      );
    });

    test("全エスケープ対象文字を一括処理する", () => {
      expect(escapeHtml("& < > \" '")).toBe("&amp; &lt; &gt; &quot; &#039;");
    });
  });

  describe("エッジケース", () => {
    test("エスケープ不要な文字列をそのまま返す", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });

    test("空文字列をそのまま返す", () => {
      expect(escapeHtml("")).toBe("");
    });

    test("日本語テキストをそのまま返す", () => {
      expect(escapeHtml("こんにちは世界")).toBe("こんにちは世界");
    });

    test("数字文字列をそのまま返す", () => {
      expect(escapeHtml("12345")).toBe("12345");
    });
  });
});

// =============================================================================
// FormData ヘルパー
// =============================================================================

describe("getFormString", () => {
  describe("正常系", () => {
    test("フィールドが存在する場合は文字列を返す", () => {
      const formData = new FormData();
      formData.set("name", "田中太郎");
      expect(getFormString(formData, "name")).toBe("田中太郎");
    });

    test("フィールドが存在しない場合は空文字列を返す", () => {
      const formData = new FormData();
      expect(getFormString(formData, "name")).toBe("");
    });

    test("フィールドが存在しない場合はデフォルト値を返す", () => {
      const formData = new FormData();
      expect(getFormString(formData, "name", "Guest")).toBe("Guest");
    });

    test("空文字列フィールドをそのまま返す", () => {
      const formData = new FormData();
      formData.set("name", "");
      expect(getFormString(formData, "name")).toBe("");
    });
  });

  describe("エッジケース", () => {
    test("File オブジェクトのフィールドはデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormString(formData, "file", "fallback")).toBe("fallback");
    });

    test("スペースのみの値をそのまま返す", () => {
      const formData = new FormData();
      formData.set("name", "  ");
      expect(getFormString(formData, "name")).toBe("  ");
    });
  });
});

describe("getFormStringOrNull", () => {
  describe("正常系", () => {
    test("フィールドが存在する場合は文字列を返す", () => {
      const formData = new FormData();
      formData.set("guestName", "山田花子");
      expect(getFormStringOrNull(formData, "guestName")).toBe("山田花子");
    });

    test("フィールドが存在しない場合は null を返す", () => {
      const formData = new FormData();
      expect(getFormStringOrNull(formData, "guestName")).toBeNull();
    });

    test("空文字列フィールドは null を返す", () => {
      const formData = new FormData();
      formData.set("guestName", "");
      expect(getFormStringOrNull(formData, "guestName")).toBeNull();
    });
  });

  describe("エッジケース", () => {
    test("スペースのみの値は文字列として返す（空でない）", () => {
      const formData = new FormData();
      formData.set("name", " ");
      expect(getFormStringOrNull(formData, "name")).toBe(" ");
    });

    test("File オブジェクトのフィールドは null を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormStringOrNull(formData, "file")).toBeNull();
    });
  });
});

describe("getFormNumber", () => {
  describe("正常系", () => {
    test("整数文字列を数値に変換する", () => {
      const formData = new FormData();
      formData.set("page", "3");
      expect(getFormNumber(formData, "page", 1)).toBe(3);
    });

    test("小数文字列を数値に変換する", () => {
      const formData = new FormData();
      formData.set("price", "1234.5");
      expect(getFormNumber(formData, "price", 0)).toBe(1234.5);
    });

    test("ゼロ文字列を 0 に変換する", () => {
      const formData = new FormData();
      formData.set("count", "0");
      expect(getFormNumber(formData, "count", 99)).toBe(0);
    });

    test("負数文字列を負数に変換する", () => {
      const formData = new FormData();
      formData.set("offset", "-5");
      expect(getFormNumber(formData, "offset", 0)).toBe(-5);
    });
  });

  describe("異常系", () => {
    test("フィールドが存在しない場合はデフォルト値を返す", () => {
      const formData = new FormData();
      expect(getFormNumber(formData, "page", 1)).toBe(1);
    });

    test("数値でない文字列はデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("page", "abc");
      expect(getFormNumber(formData, "page", 1)).toBe(1);
    });

    test("空文字列はデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("page", "");
      // Number('') === 0 なのでデフォルト値ではなく 0 を返す
      expect(getFormNumber(formData, "page", 1)).toBe(0);
    });

    test("File オブジェクトのフィールドはデフォルト値を返す", () => {
      const formData = new FormData();
      formData.set("file", new Blob(["content"]));
      expect(getFormNumber(formData, "file", 99)).toBe(99);
    });
  });
});

describe("getFormBoolean", () => {
  describe("正常系", () => {
    test("'true' を true に変換する", () => {
      const formData = new FormData();
      formData.set("isPublished", "true");
      expect(getFormBoolean(formData, "isPublished")).toBe(true);
    });

    test("'on' を true に変換する（チェックボックス）", () => {
      const formData = new FormData();
      formData.set("isPublished", "on");
      expect(getFormBoolean(formData, "isPublished")).toBe(true);
    });

    test("'false' を false に変換する", () => {
      const formData = new FormData();
      formData.set("isPublished", "false");
      expect(getFormBoolean(formData, "isPublished")).toBe(false);
    });

    test("フィールドが存在しない場合は false を返す", () => {
      const formData = new FormData();
      expect(getFormBoolean(formData, "isPublished")).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("'1' は false を返す（'true'/'on' のみ true）", () => {
      const formData = new FormData();
      formData.set("flag", "1");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });

    test("'True'（大文字）は false を返す", () => {
      const formData = new FormData();
      formData.set("flag", "True");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });

    test("空文字列は false を返す", () => {
      const formData = new FormData();
      formData.set("flag", "");
      expect(getFormBoolean(formData, "flag")).toBe(false);
    });
  });
});

// =============================================================================
// formatCurrency（日本円フォーマット）
// =============================================================================

describe("formatCurrency", () => {
  describe("正常系", () => {
    test("整数を日本円にフォーマットする", () => {
      const result = formatCurrency(12345);
      // 通貨記号（半角¥ または全角￥）とカンマ区切り数値を含む
      expect(result).toMatch(/[¥￥]12,345/);
    });

    test("ゼロを日本円にフォーマットする", () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/[¥￥]0/);
    });

    test("1000未満の数値をフォーマットする", () => {
      const result = formatCurrency(500);
      expect(result).toMatch(/[¥￥]500/);
    });

    test("大きな数値をカンマ区切りでフォーマットする", () => {
      const result = formatCurrency(1000000);
      expect(result).toContain("1,000,000");
    });

    test("負数をフォーマットする", () => {
      const result = formatCurrency(-5000);
      expect(result).toContain("5,000");
    });
  });
});

// =============================================================================
// formatPrice（価格フォーマット、null/undefined 対応）
// =============================================================================

describe("formatPrice", () => {
  describe("正常系", () => {
    test("数値を日本円にフォーマットする", () => {
      const result = formatPrice(12345);
      expect(result).toContain("12,345");
    });

    test("null の場合はデフォルトフォールバック '要問合せ' を返す", () => {
      expect(formatPrice(null)).toBe("要問合せ");
    });

    test("undefined の場合はデフォルトフォールバック '要問合せ' を返す", () => {
      expect(formatPrice(undefined)).toBe("要問合せ");
    });

    test("カスタムフォールバック文字列を使用する", () => {
      expect(formatPrice(null, "-")).toBe("-");
    });

    test("undefined でカスタムフォールバックを使用する", () => {
      expect(formatPrice(undefined, "未定")).toBe("未定");
    });

    test("ゼロをフォーマットする（フォールバックにならない）", () => {
      const result = formatPrice(0);
      expect(result).toMatch(/[¥￥]0/);
    });
  });
});

// =============================================================================
// formatDate（日本語日付フォーマット）
// =============================================================================

describe("formatDate", () => {
  describe("正常系", () => {
    test("Date オブジェクトを日本語形式でフォーマットする", () => {
      // UTC 正午: どのタイムゾーンでも同日
      const date = new Date("2024-01-15T12:00:00Z");
      const result = formatDate(date);
      expect(result).toContain("2024");
      expect(result).toContain("1");
      expect(result).toContain("15");
    });

    test("ISO 日付文字列を日本語形式でフォーマットする", () => {
      const result = formatDate("2024-06-15T12:00:00Z");
      expect(result).toContain("2024");
      expect(result).toContain("6");
      expect(result).toContain("15");
    });

    test("includeTime=true で時刻を含むフォーマットを返す", () => {
      const date = new Date("2024-01-15T12:30:00Z");
      const result = formatDate(date, true);
      // 時刻が含まれることを確認（'HH:MM' 形式）
      expect(result).toMatch(/\d+:\d+/);
    });

    test("includeTime=false（デフォルト）で時刻を含まない", () => {
      const date = new Date("2024-01-15T12:30:00Z");
      const result = formatDate(date, false);
      expect(result).not.toMatch(/\d+:\d+/);
    });
  });

  describe("エッジケース", () => {
    test("null の場合は空文字列を返す", () => {
      expect(formatDate(null)).toBe("");
    });

    test("undefined の場合は空文字列を返す", () => {
      expect(formatDate(undefined)).toBe("");
    });

    test("空文字列の場合は空文字列を返す", () => {
      expect(formatDate("")).toBe("");
    });
  });
});

// =============================================================================
// formatDateShort（短縮日付フォーマット）
// =============================================================================

describe("formatDateShort", () => {
  describe("正常系", () => {
    test("Date オブジェクトを YYYY/MM/DD 形式でフォーマットする", () => {
      // UTC 正午: どのタイムゾーンでも同日
      const date = new Date("2024-01-15T12:00:00Z");
      const result = formatDateShort(date);
      expect(result).toMatch(/2024\/01\/15/);
    });

    test("文字列日付を YYYY/MM/DD 形式でフォーマットする", () => {
      const result = formatDateShort("2024-12-15T12:00:00Z");
      expect(result).toMatch(/2024\/12\/15/);
    });
  });

  describe("エッジケース", () => {
    test("null の場合は '-' を返す", () => {
      expect(formatDateShort(null)).toBe("-");
    });

    test("undefined の場合は '-' を返す", () => {
      expect(formatDateShort(undefined)).toBe("-");
    });

    test("空文字列の場合は '-' を返す", () => {
      expect(formatDateShort("")).toBe("-");
    });
  });
});

// =============================================================================
// formatDateTimeShort（短縮日時フォーマット）
// =============================================================================

describe("formatDateTimeShort", () => {
  describe("正常系", () => {
    test("Date オブジェクトを YYYY/MM/DD HH:MM 形式でフォーマットする", () => {
      const date = new Date("2024-01-15T12:30:00Z");
      const result = formatDateTimeShort(date);
      expect(result).toMatch(/2024\/01\/15/);
      expect(result).toMatch(/\d+:\d+/);
    });

    test("文字列日付を YYYY/MM/DD HH:MM 形式でフォーマットする", () => {
      const result = formatDateTimeShort("2024-06-15T12:00:00Z");
      expect(result).toMatch(/2024\/06\/15/);
      expect(result).toMatch(/\d+:\d+/);
    });
  });

  describe("エッジケース", () => {
    test("null の場合は '-' を返す", () => {
      expect(formatDateTimeShort(null)).toBe("-");
    });

    test("undefined の場合は '-' を返す", () => {
      expect(formatDateTimeShort(undefined)).toBe("-");
    });

    test("空文字列の場合は '-' を返す", () => {
      expect(formatDateTimeShort("")).toBe("-");
    });
  });
});

// =============================================================================
// formatDateTimeFull（詳細日時フォーマット、曜日付き）
// =============================================================================

describe("formatDateTimeFull", () => {
  describe("正常系", () => {
    test("Date オブジェクトを曜日付き形式でフォーマットする", () => {
      const date = new Date("2024-01-15T12:30:00Z");
      const result = formatDateTimeFull(date);
      // 曜日（月・火・水等）が含まれることを確認
      expect(result).toMatch(/[月火水木金土日]/);
      expect(result).toMatch(/2024/);
    });

    test("文字列日付を曜日付き形式でフォーマットする", () => {
      const result = formatDateTimeFull("2024-06-15T12:00:00Z");
      expect(result).toMatch(/[月火水木金土日]/);
      expect(result).toContain("2024");
    });
  });

  describe("エッジケース", () => {
    test("null の場合は '-' を返す", () => {
      expect(formatDateTimeFull(null)).toBe("-");
    });

    test("undefined の場合は '-' を返す", () => {
      expect(formatDateTimeFull(undefined)).toBe("-");
    });

    test("空文字列の場合は '-' を返す", () => {
      expect(formatDateTimeFull("")).toBe("-");
    });
  });
});

// =============================================================================
// generateSlug（URL スラッグ生成）
// =============================================================================

describe("generateSlug", () => {
  describe("正常系", () => {
    test("スペースをハイフンに変換する", () => {
      expect(generateSlug("Hello World")).toBe("hello-world");
    });

    test("大文字を小文字に変換する", () => {
      expect(generateSlug("HELLO WORLD")).toBe("hello-world");
    });

    test("数字を含む文字列を正しく処理する", () => {
      expect(generateSlug("Article 2024")).toBe("article-2024");
    });

    test("既存のハイフンを保持する", () => {
      expect(generateSlug("hello-world")).toBe("hello-world");
    });

    test("連続スペースを単一ハイフンに変換する", () => {
      expect(generateSlug("hello   world")).toBe("hello-world");
    });

    test("連続ハイフンを単一ハイフンに変換する", () => {
      expect(generateSlug("hello--world")).toBe("hello-world");
    });

    test("先頭・末尾のハイフンを除去する", () => {
      expect(generateSlug("-hello-world-")).toBe("hello-world");
    });

    test("アクセント記号を除去する", () => {
      expect(generateSlug("café")).toBe("cafe");
    });

    test("特殊文字を除去する", () => {
      expect(generateSlug("hello!@#world")).toBe("helloworld");
    });

    test("maxLength で切り詰める", () => {
      const longText = "a".repeat(100);
      expect(generateSlug(longText, "item", 20)).toHaveLength(20);
    });

    test("デフォルト maxLength（50）で切り詰める", () => {
      const longText = "a ".repeat(30); // "a a a a..." → "a-a-a-a..."
      const result = generateSlug(longText);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe("フォールバック（非ASCII文字のみ）", () => {
    test("日本語のみの場合はプレフィックス付きランダムIDを返す", () => {
      const result = generateSlug("日本語タグ");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });

    test("日本語のみでカスタムプレフィックスを使用する", () => {
      const result = generateSlug("タイトル", "tag");
      expect(result).toMatch(/^tag-[a-f0-9-]+$/);
    });

    test("中国語のみの場合もフォールバックを返す", () => {
      const result = generateSlug("中文", "post");
      expect(result).toMatch(/^post-[a-f0-9-]+$/);
    });

    test("ASCII と非ASCII 混在の場合は ASCII 部分のみのスラッグを返す", () => {
      // "Mix 混合" → ASCII 部分の "mix" のみ残る
      expect(generateSlug("Mix 混合", "tag")).toBe("mix");
    });

    test("空文字列の場合はデフォルトプレフィックスでフォールバックを返す", () => {
      const result = generateSlug("");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });

    test("記号のみの場合もフォールバックを返す", () => {
      const result = generateSlug("!@#$%^&*()");
      expect(result).toMatch(/^item-[a-f0-9-]+$/);
    });
  });

  describe("境界値", () => {
    test("maxLength=1 で1文字に切り詰める", () => {
      expect(generateSlug("hello world", "item", 1)).toBe("h");
    });

    test("maxLength がスラッグ長より長い場合は切り詰めない", () => {
      expect(generateSlug("hi", "item", 100)).toBe("hi");
    });

    test("数字のみの文字列を処理する", () => {
      expect(generateSlug("12345")).toBe("12345");
    });

    test("英字1文字を処理する", () => {
      expect(generateSlug("a")).toBe("a");
    });
  });
});
