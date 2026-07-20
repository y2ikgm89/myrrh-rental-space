import { describe, expect, test } from "bun:test";
import { STRUCTURE_INSERT_ITEMS } from "@/admin/components/editor/lexical/config/insert-items/structure";
import {
  getPickerInsertItems,
  getToolbarInsertItems,
} from "@/admin/components/editor/lexical/config/insert-items";
import { DIALOG_REGISTRY } from "@/admin/components/editor/lexical/config/dialog-registry";
import type { DialogId } from "@/admin/components/editor/lexical/dialogs/dialog-types";

/**
 * 監査で発覚した2件の insert-menu 欠落バグの回帰テスト:
 *
 * 1. RubyNode / TooltipNode は node 登録・Dialog 登録済みだが、
 *    insert-items のどこにも dialogId: "ruby" / "tooltip" の InsertItem がなく、
 *    Floating Toolbar（選択時のみ）経由でしか起動できなかった
 *    （「/」コマンド・挿入メニューからの発見性ゼロ）
 * 2. CustomHeadingNode は h1-h6 を扱うが、insert-items には h1-h4 しかなく
 *    h5/h6 は toolbar/insert メニューから新規追加・変更できなかった
 */
describe("insert-items: h5/h6 と ruby/tooltip の欠落回帰テスト", () => {
  test("見出し5・6 の InsertItem が structure に存在する", () => {
    const h5 = STRUCTURE_INSERT_ITEMS.find((item) => item.id === "h5");
    const h6 = STRUCTURE_INSERT_ITEMS.find((item) => item.id === "h6");

    expect(h5).toBeDefined();
    expect(h6).toBeDefined();
    expect(h5?.type).toBe("transform");
    expect(h6?.type).toBe("transform");
    expect(h5?.showInPicker).toBe(true);
    expect(h6?.showInPicker).toBe(true);
  });

  test("ruby・tooltip の InsertItem が structure に存在し dialogId が対応する", () => {
    const ruby = STRUCTURE_INSERT_ITEMS.find((item) => item.id === "ruby");
    const tooltip = STRUCTURE_INSERT_ITEMS.find(
      (item) => item.id === "tooltip",
    );

    expect(ruby).toBeDefined();
    expect(tooltip).toBeDefined();
    expect(ruby?.type).toBe("dialog");
    expect(tooltip?.type).toBe("dialog");
    if (ruby?.type === "dialog") {
      expect(ruby.dialogId).toBe("ruby");
    }
    if (tooltip?.type === "dialog") {
      expect(tooltip.dialogId).toBe("tooltip");
    }
  });

  test("ruby・tooltip は Toolbar 挿入メニューと「/」コンポーネントピッカーの両方に表示される", () => {
    const toolbarIds = getToolbarInsertItems(true).map((item) => item.id);
    const pickerIds = getPickerInsertItems(true).map((item) => item.id);

    expect(toolbarIds).toContain("ruby");
    expect(toolbarIds).toContain("tooltip");
    expect(pickerIds).toContain("ruby");
    expect(pickerIds).toContain("tooltip");
  });

  test("h5・h6 は「/」コンポーネントピッカーに表示される（既存 h1-h4 と同様 toolbar には出さない）", () => {
    const toolbarIds = getToolbarInsertItems(true).map((item) => item.id);
    const pickerIds = getPickerInsertItems(true).map((item) => item.id);

    expect(pickerIds).toContain("h5");
    expect(pickerIds).toContain("h6");
    expect(toolbarIds).not.toContain("h5");
    expect(toolbarIds).not.toContain("h6");
  });

  test("dialog 型 InsertItem の dialogId は全て DIALOG_REGISTRY に実体を持つ（未配線 dialogId の再発防止）", () => {
    const registeredDialogIds = new Set<DialogId>(
      DIALOG_REGISTRY.map((entry) => entry.dialogId),
    );
    // BlockTemplatePlugin は isSaveOpen/isInsertOpen という独自 props パターンのため
    // DIALOG_REGISTRY に含まれず LexicalEditor.tsx で直接管理される
    // （config/dialog-registry.ts のファイル冒頭コメント参照）。
    const knownRegistryExceptions = new Set([
      "blockTemplateInsert",
      "blockTemplateSave",
    ]);

    const danglingDialogItems = STRUCTURE_INSERT_ITEMS.filter(
      (item) =>
        item.type === "dialog" &&
        !registeredDialogIds.has(item.dialogId) &&
        !knownRegistryExceptions.has(item.id),
    ).map((item) => item.id);

    expect(danglingDialogItems).toEqual([]);
  });
});
