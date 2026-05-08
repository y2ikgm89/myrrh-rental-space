import { describe, expect, test } from "bun:test";
import {
  createSpan,
  createInlineIcon,
  createBlock,
} from "@/shared/lib/portable-text/factory";

describe("createSpan", () => {
  test("_type='span' / _key (UUID) / text を生成", () => {
    const s = createSpan("Hello");
    expect(s._type).toBe("span");
    expect(s.text).toBe("Hello");
    expect(s._key.length).toBeGreaterThan(0);
  });

  test("各 _key が一意", () => {
    const a = createSpan("X");
    const b = createSpan("X");
    expect(a._key).not.toBe(b._key);
  });
});

describe("createInlineIcon", () => {
  test("_type='iconInline' / _key (UUID) / name を生成", () => {
    const s = createInlineIcon("IconHeart");
    expect(s._type).toBe("iconInline");
    expect(s.name).toBe("IconHeart");
    expect(s._key.length).toBeGreaterThan(0);
  });
});

describe("createBlock", () => {
  test("_type='block' / style='normal' / children を内包", () => {
    const b = createBlock([createSpan("A"), createInlineIcon("IconStar")]);
    expect(b._type).toBe("block");
    expect(b.style).toBe("normal");
    expect(b.children.length).toBe(2);
  });

  test("空 children でも生成可能", () => {
    const b = createBlock([]);
    expect(b.children.length).toBe(0);
  });
});
