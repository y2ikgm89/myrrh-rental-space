import { describe, expect, test } from "bun:test";
import { Z_INDEX } from "@/admin/lib/styles/z-index";

describe("admin z-index tokens", () => {
  test("mobile drawer sits above page overlay and layout chrome", () => {
    expect(Z_INDEX.header).toBeGreaterThan(Z_INDEX.sidebar);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.header);
    expect(Z_INDEX.sidebarDrawer).toBeGreaterThan(Z_INDEX.overlay);
  });

  test("interactive popups stay below page overlay", () => {
    expect(Z_INDEX.dropdown).toBeGreaterThan(Z_INDEX.header);
    expect(Z_INDEX.popover).toBeGreaterThan(Z_INDEX.dropdown);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.popover);
  });

  test("dialog layers render above fullscreen editors", () => {
    expect(Z_INDEX.dialogOverlay).toBeGreaterThan(Z_INDEX.editorFullscreen);
    expect(Z_INDEX.dialog).toBeGreaterThan(Z_INDEX.dialogOverlay);
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.dialog);
  });
});
