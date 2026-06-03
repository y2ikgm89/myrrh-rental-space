import { describe, it, expect } from "bun:test";
import { TERMS_CONTENT_WIDTH } from "@/shared/lib/validations/terms";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  resolveWidthStyles,
  CONTENT_WIDTH_PRESETS,
} from "@/shared/lib/styles/layout-mapper";

describe("TERMS_CONTENT_WIDTH — editor ↔ public WYSIWYG consistency", () => {
  it("is a fixed bounded preset (not FULL/CUSTOM) so the editor body matches the published page", () => {
    // 規約は固定 MD 幅で描画する設計。FULL/CUSTOM だと px が null になり、
    // エディタへ渡す contentWidth が undefined = full-width 表示になって
    // 公開ページ (MD=800px) と WYSIWYG がズレる。
    expect(TERMS_CONTENT_WIDTH).toBe(LayoutWidth.MD);

    const px = resolveWidthStyles({
      width: TERMS_CONTENT_WIDTH,
      customPx: null,
    }).px;

    expect(px).not.toBeNull();
    expect(px).toBe(CONTENT_WIDTH_PRESETS[TERMS_CONTENT_WIDTH].px);
  });
});
