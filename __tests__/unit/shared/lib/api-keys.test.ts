import { describe, test, expect } from "bun:test";
import {
  maskApiKey,
  maskResendKey,
  maskTurnstileKey,
  maskGoogleMapsKey,
} from "@/shared/lib/api-keys";

// =============================================================================
// maskApiKey
// =============================================================================

describe("maskApiKey", () => {
  describe("正常系", () => {
    test("デフォルトパラメータで先頭6文字と末尾4文字を残してマスクする", () => {
      // minLength = 6 + 4 + 4 = 14 → 14文字以上で正常動作
      // "re_abc123def456xyz" → 先頭6="re_abc", 末尾4="6xyz"
      const key = "re_abc123def456xyz";
      expect(maskApiKey(key)).toBe("re_abc...6xyz");
    });

    test("prefixLength と suffixLength を明示指定してマスクする", () => {
      const key = "AIzaSyXXXXXXXXXXXXXXXXXXXXXXabcd";
      // minLength = 10 + 4 + 4 = 18
      expect(maskApiKey(key, 10, 4)).toBe("AIzaSyXXXX...abcd");
    });

    test("ちょうど最小長（minLength = 14）のキーを正常にマスクする", () => {
      // prefixLength=6, suffixLength=4, minLength=14
      const key = "abcdef1234abcd"; // 14文字
      expect(maskApiKey(key)).toBe("abcdef...abcd");
    });

    test("アンダースコアとハイフンを含むキーをマスクする", () => {
      const key = "re_abc-xyz_1234abcd"; // 有効文字のみ
      expect(maskApiKey(key)).toBe("re_abc...abcd");
    });

    test("先頭と末尾が重複しない十分な長さのキーで prefix...suffix 形式を返す", () => {
      const key = "123456789012345678"; // 18文字
      const result = maskApiKey(key);
      expect(result).toContain("...");
      expect(result.startsWith("123456")).toBe(true);
      expect(result.endsWith("5678")).toBe(true);
    });
  });

  describe("異常系", () => {
    test("空文字列で '****' を返す", () => {
      expect(maskApiKey("")).toBe("****");
    });

    test("最小長未満（13文字）のキーで '****' を返す", () => {
      // minLength = 6 + 4 + 4 = 14
      const key = "abcdef1234abc"; // 13文字
      expect(maskApiKey(key)).toBe("****");
    });

    test("最小長未満（1文字）のキーで '****' を返す", () => {
      expect(maskApiKey("a")).toBe("****");
    });

    test("<script> タグを含む入力で '****' を返す（XSS対策）", () => {
      expect(maskApiKey("<script>alert(1)</script>")).toBe("****");
    });

    test("スペースを含む入力で '****' を返す（XSS対策）", () => {
      expect(maskApiKey("re_abc 123def456xyz")).toBe("****");
    });

    test("スラッシュを含む入力で '****' を返す（XSS対策）", () => {
      expect(maskApiKey("re_abc/def456xyz1234")).toBe("****");
    });

    test("ドットを含む入力で '****' を返す（XSS対策）", () => {
      expect(maskApiKey("re_abc.def456xyz1234")).toBe("****");
    });

    test("日本語文字を含む入力で '****' を返す（XSS対策）", () => {
      expect(maskApiKey("re_abcあいうdef456xyz")).toBe("****");
    });

    test("カスタム minLength 未満のキーで '****' を返す", () => {
      // prefixLength=10, suffixLength=4 → minLength=18
      const key = "AIzaSyabcd1234567"; // 17文字
      expect(maskApiKey(key, 10, 4)).toBe("****");
    });
  });

  describe("エッジケース", () => {
    test("ちょうど minLength - 1（13文字）で '****' を返す", () => {
      const key = "abcdef1234abc"; // 13文字
      expect(maskApiKey(key)).toBe("****");
    });

    test("prefixLength=0 suffixLength=0 で minLength=4 となり最小長を満たすキーをマスクする", () => {
      const key = "abcd"; // minLength = 0+0+4 = 4
      expect(maskApiKey(key, 0, 0)).toBe("..."); // prefix=""...suffix=""
    });

    test("大文字小文字混在の有効なキーをマスクする", () => {
      const key = "AbCdEf1234AbCd"; // 14文字
      expect(maskApiKey(key)).toBe("AbCdEf...AbCd");
    });
  });
});

// =============================================================================
// maskResendKey
// =============================================================================

describe("maskResendKey", () => {
  test("re_ で始まる有効なキーを prefix...suffix 形式でマスクする", () => {
    // prefixLength=6, suffixLength=4, minLength=14
    // "re_abc123def456xyz" → 先頭6="re_abc", 末尾4="6xyz"
    const key = "re_abc123def456xyz";
    expect(maskResendKey(key)).toBe("re_abc...6xyz");
  });

  test("最小長未満のキーで '****' を返す", () => {
    expect(maskResendKey("re_abc")).toBe("****");
  });

  test("不正文字を含むキーで '****' を返す", () => {
    expect(maskResendKey("re_abc<def>123456")).toBe("****");
  });

  test("空文字列で '****' を返す", () => {
    expect(maskResendKey("")).toBe("****");
  });
});

// =============================================================================
// maskTurnstileKey
// =============================================================================

describe("maskTurnstileKey", () => {
  test("0x で始まる有効なキーを prefix...suffix 形式でマスクする", () => {
    // prefixLength=6, suffixLength=4, minLength=14
    const key = "0x1234567890abcd";
    expect(maskTurnstileKey(key)).toBe("0x1234...abcd");
  });

  test("最小長未満のキーで '****' を返す", () => {
    expect(maskTurnstileKey("0x1234")).toBe("****");
  });

  test("不正文字を含むキーで '****' を返す", () => {
    expect(maskTurnstileKey("0x1234<script>abcd")).toBe("****");
  });

  test("空文字列で '****' を返す", () => {
    expect(maskTurnstileKey("")).toBe("****");
  });
});

// =============================================================================
// maskGoogleMapsKey
// =============================================================================

describe("maskGoogleMapsKey", () => {
  test("AIzaSy で始まる有効なキーを prefix...suffix 形式でマスクする", () => {
    // prefixLength=10, suffixLength=4, minLength=18
    const key = "AIzaSyAbc123Def456Ghi789abcd";
    expect(maskGoogleMapsKey(key)).toBe("AIzaSyAbc1...abcd");
  });

  test("minLength=18 ちょうどのキーを正常にマスクする", () => {
    const key = "AIzaSyAbc123456789"; // 18文字（a-zA-Z0-9のみ）
    expect(maskGoogleMapsKey(key)).toBe("AIzaSyAbc1...6789");
  });

  test("最小長未満（17文字）のキーで '****' を返す", () => {
    const key = "AIzaSyAbc12345678"; // 17文字
    expect(maskGoogleMapsKey(key)).toBe("****");
  });

  test("不正文字を含むキーで '****' を返す", () => {
    expect(maskGoogleMapsKey("AIzaSyAbc123Def45<>")).toBe("****");
  });

  test("空文字列で '****' を返す", () => {
    expect(maskGoogleMapsKey("")).toBe("****");
  });
});
