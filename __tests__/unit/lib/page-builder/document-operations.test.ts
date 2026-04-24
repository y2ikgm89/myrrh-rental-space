import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  alignPageBuilderNodeOnCanvas,
  canDragPageBuilderNodesOnCanvas,
  canDragPageBuilderNodeOnCanvas,
  canResizePageBuilderNodeOnCanvas,
  clampPageBuilderLayoutCoordinate,
  clampPageBuilderLayoutDimension,
  clonePageBuilderDocument,
  distributePageBuilderNodesOnCanvas,
  duplicatePageBuilderNode,
  duplicatePageBuilderNodesWithOffset,
  duplicatePageBuilderNodeWithLayout,
  groupPageBuilderNodesOnCanvas,
  isPageBuilderNodeAbsoluteChild,
  movePageBuilderNodesOnCanvas,
  movePageBuilderNodeWithinParent,
  nudgePageBuilderNodeOnCanvas,
  reorderPageBuilderNodeWithinParent,
  removePageBuilderNode,
  ungroupPageBuilderNodeOnCanvas,
} from "@/shared/lib/page-builder/document-operations";
import {
  resolvePageBuilderNodeLayoutBox,
  setPageBuilderNodeLayoutBox,
} from "@/shared/lib/page-builder/layout";
import { setPageBuilderNodeHidden } from "@/shared/lib/page-builder/visibility";

describe("page-builder document operations", () => {
  test("duplicatePageBuilderNode は選択ノードと子孫ノードを複製して直後に挿入する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    let sequence = 0;

    const duplicatedId = duplicatePageBuilderNode(
      document,
      "frame-main",
      (type) => {
        sequence += 1;
        return `${type}-copy-${sequence}`;
      },
    );

    expect(duplicatedId).toBe("frame-copy-1");
    expect(document.nodes["root"]?.children).toEqual([
      "frame-main",
      "frame-copy-1",
    ]);
    expect(document.nodes["frame-copy-1"]?.children).toEqual([
      "text-copy-2",
      "text-copy-3",
      "button-copy-4",
    ]);
    expect(document.nodes["text-copy-2"]?.parentId).toBe("frame-copy-1");
    expect(document.nodes["button-copy-4"]?.parentId).toBe("frame-copy-1");
  });

  test("duplicatePageBuilderNodeWithLayout は複製ノードへ指定 layout を適用する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    let sequence = 0;

    if (!frame || frame.type !== "frame" || !title || title.type !== "text") {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 10,
      y: 20,
      width: 300,
      height: 120,
    });

    const duplicatedId = duplicatePageBuilderNodeWithLayout(
      document,
      "text-title",
      "desktop",
      {
        ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
        x: 240,
        y: 180,
      },
      (type) => {
        sequence += 1;
        return `${type}-copy-${sequence}`;
      },
    );

    expect(duplicatedId).toBe("text-copy-1");
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-copy-1",
      "text-body",
      "button-primary",
    ]);
    expect(resolvePageBuilderNodeLayoutBox(title, "desktop")).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      rotate: 0,
      zIndex: 0,
    });
    expect(
      resolvePageBuilderNodeLayoutBox(
        document.nodes["text-copy-1"]!,
        "desktop",
      ),
    ).toEqual({
      x: 240,
      y: 180,
      width: 300,
      height: 120,
      rotate: 0,
      zIndex: 0,
    });
  });

  test("duplicatePageBuilderNode は locked ノードの複製を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const title = document.nodes["text-title"];

    if (!title) {
      throw new Error("text-title is missing");
    }

    title.locked = true;

    expect(duplicatePageBuilderNode(document, "text-title")).toBeNull();
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-body",
      "button-primary",
    ]);
  });

  test("movePageBuilderNodeWithinParent は兄弟順を前後に移動する", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const movedUp = movePageBuilderNodeWithinParent(document, "text-body", -1);
    expect(movedUp).toBe(true);
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-body",
      "text-title",
      "button-primary",
    ]);

    const movedDown = movePageBuilderNodeWithinParent(document, "text-body", 1);
    expect(movedDown).toBe(true);
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-body",
      "button-primary",
    ]);
  });

  test("movePageBuilderNodeWithinParent は境界外への移動を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    expect(movePageBuilderNodeWithinParent(document, "text-title", -1)).toBe(
      false,
    );
    expect(movePageBuilderNodeWithinParent(document, "button-primary", 1)).toBe(
      false,
    );
  });

  test("movePageBuilderNodeWithinParent は locked ノードの移動を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const body = document.nodes["text-body"];

    if (!body) {
      throw new Error("text-body is missing");
    }

    body.locked = true;

    expect(movePageBuilderNodeWithinParent(document, "text-body", -1)).toBe(
      false,
    );
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-body",
      "button-primary",
    ]);
  });

  test("reorderPageBuilderNodeWithinParent は同じ親の兄弟順をドラッグ順に並び替える", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    const reordered = reorderPageBuilderNodeWithinParent(
      document,
      "button-primary",
      "text-title",
    );

    expect(reordered).toBe(true);
    expect(document.nodes["frame-main"]?.children).toEqual([
      "button-primary",
      "text-title",
      "text-body",
    ]);
  });

  test("reorderPageBuilderNodeWithinParent は親が異なるノード間の移動を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    expect(
      reorderPageBuilderNodeWithinParent(document, "frame-main", "text-title"),
    ).toBe(false);
    expect(document.nodes["root"]?.children).toEqual(["frame-main"]);
  });

  test("reorderPageBuilderNodeWithinParent は locked ノードの並び替えを拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const button = document.nodes["button-primary"];

    if (!button) {
      throw new Error("button-primary is missing");
    }

    button.locked = true;

    expect(
      reorderPageBuilderNodeWithinParent(
        document,
        "button-primary",
        "text-title",
      ),
    ).toBe(false);
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-body",
      "button-primary",
    ]);
  });

  test("isPageBuilderNodeAbsoluteChild は absolute 親の直下だけ true を返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    if (!frame || frame.type !== "frame") {
      throw new Error("frame-main is missing");
    }

    frame.layoutMode = "absolute";

    expect(isPageBuilderNodeAbsoluteChild(document, "text-title")).toBe(true);
    expect(isPageBuilderNodeAbsoluteChild(document, "frame-main")).toBe(false);
    expect(isPageBuilderNodeAbsoluteChild(document, "root")).toBe(false);
  });

  test("canDragPageBuilderNodeOnCanvas は absolute 親かつ unlocked / visible ノードだけ true を返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];

    if (!frame || frame.type !== "frame" || !title || title.type !== "text") {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    expect(
      canDragPageBuilderNodeOnCanvas(document, "text-title", "desktop"),
    ).toBe(true);

    title.locked = true;
    expect(
      canDragPageBuilderNodeOnCanvas(document, "text-title", "desktop"),
    ).toBe(false);

    title.locked = false;
    setPageBuilderNodeHidden(title, "desktop", true);
    expect(
      canDragPageBuilderNodeOnCanvas(document, "text-title", "desktop"),
    ).toBe(false);
  });

  test("canResizePageBuilderNodeOnCanvas は fixed size の absolute 子ノードだけ true を返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const button = document.nodes["button-primary"];

    if (
      !frame ||
      frame.type !== "frame" ||
      !title ||
      title.type !== "text" ||
      !button ||
      button.type !== "button"
    ) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";

    expect(
      canResizePageBuilderNodeOnCanvas(document, "text-title", "desktop"),
    ).toBe(false);
    expect(
      canResizePageBuilderNodeOnCanvas(document, "button-primary", "desktop"),
    ).toBe(true);
  });

  test("clampPageBuilderLayoutCoordinate / Dimension は schema の範囲に収める", () => {
    expect(clampPageBuilderLayoutCoordinate(-9999)).toBe(-4000);
    expect(clampPageBuilderLayoutCoordinate(9999)).toBe(4000);
    expect(clampPageBuilderLayoutDimension(-10)).toBe(1);
    expect(clampPageBuilderLayoutDimension(9999)).toBe(4000);
  });

  test("nudgePageBuilderNodeOnCanvas は absolute 子ノードの座標だけを移動する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];

    if (!frame || frame.type !== "frame" || !title || title.type !== "text") {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 10,
      y: 20,
    });

    const nudgedBox = nudgePageBuilderNodeOnCanvas(
      document,
      "text-title",
      "desktop",
      10,
      -5,
    );

    expect(nudgedBox).toEqual({
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 20,
      y: 15,
    });
  });

  test("nudgePageBuilderNodeOnCanvas は移動不可ノードでは null を返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    expect(
      nudgePageBuilderNodeOnCanvas(document, "frame-main", "desktop", 10, 10),
    ).toBeNull();
  });

  test("movePageBuilderNodesOnCanvas は同じ absolute 親の複数ノードをまとめて移動する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];

    if (!frame || frame.type !== "frame" || !title || !body) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 10,
      y: 20,
    });
    setPageBuilderNodeLayoutBox(body, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(body, "desktop"),
      x: 80,
      y: 120,
    });

    expect(
      canDragPageBuilderNodesOnCanvas(
        document,
        ["text-title", "text-body"],
        "desktop",
      ),
    ).toBe(true);
    expect(
      movePageBuilderNodesOnCanvas(
        document,
        ["text-title", "text-body"],
        "desktop",
        16,
        -8,
      ),
    ).toEqual(["text-title", "text-body"]);
    expect(resolvePageBuilderNodeLayoutBox(title, "desktop").x).toBe(26);
    expect(resolvePageBuilderNodeLayoutBox(title, "desktop").y).toBe(12);
    expect(resolvePageBuilderNodeLayoutBox(body, "desktop").x).toBe(96);
    expect(resolvePageBuilderNodeLayoutBox(body, "desktop").y).toBe(112);
  });

  test("movePageBuilderNodesOnCanvas は locked ノードを含む選択を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];

    if (!frame || frame.type !== "frame" || !title) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    title.locked = true;

    expect(
      movePageBuilderNodesOnCanvas(
        document,
        ["text-title", "text-body"],
        "desktop",
        16,
        16,
      ),
    ).toEqual([]);
  });

  test("alignPageBuilderNodeOnCanvas は absolute 子ノードを親枠内で整列する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];

    if (!frame || frame.type !== "frame" || !title || title.type !== "text") {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(frame, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(frame, "desktop"),
      width: 800,
      height: 600,
    });
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 32,
      y: 48,
      width: 200,
      height: 100,
    });

    const nodeBox = resolvePageBuilderNodeLayoutBox(title, "desktop");

    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "left"),
    ).toEqual({
      ...nodeBox,
      x: 0,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "center"),
    ).toEqual({
      ...nodeBox,
      x: 300,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "right"),
    ).toEqual({
      ...nodeBox,
      x: 600,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "top"),
    ).toEqual({
      ...nodeBox,
      y: 0,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "middle"),
    ).toEqual({
      ...nodeBox,
      y: 250,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "bottom"),
    ).toEqual({
      ...nodeBox,
      y: 500,
    });
  });

  test("alignPageBuilderNodeOnCanvas は寸法が解決できない中央・右下整列を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];

    if (!frame || frame.type !== "frame" || !title || title.type !== "text") {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";

    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "left"),
    ).toEqual({
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 0,
    });
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "center"),
    ).toBeNull();
    expect(
      alignPageBuilderNodeOnCanvas(document, "text-title", "desktop", "bottom"),
    ).toBeNull();
  });

  test("alignPageBuilderNodeOnCanvas は移動不可ノードでは null を返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");

    expect(
      alignPageBuilderNodeOnCanvas(document, "frame-main", "desktop", "left"),
    ).toBeNull();
  });

  test("groupPageBuilderNodesOnCanvas は absolute 兄弟を frame group にまとめて相対座標へ変換する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];
    const button = document.nodes["button-primary"];

    if (
      !frame ||
      frame.type !== "frame" ||
      !title ||
      title.type !== "text" ||
      !body ||
      body.type !== "text" ||
      !button ||
      button.type !== "button"
    ) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 40,
      y: 60,
      width: 220,
      height: 80,
    });
    setPageBuilderNodeLayoutBox(body, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(body, "desktop"),
      x: 120,
      y: 180,
      width: 300,
      height: 90,
    });

    const groupId = groupPageBuilderNodesOnCanvas(
      document,
      ["text-body", "text-title"],
      "desktop",
      () => "frame-group",
    );

    expect(groupId).toBe("frame-group");
    expect(document.nodes["frame-main"]?.children).toEqual([
      "frame-group",
      "button-primary",
    ]);
    expect(document.nodes["frame-group"]?.children).toEqual([
      "text-title",
      "text-body",
    ]);
    expect(document.nodes["text-title"]?.parentId).toBe("frame-group");
    expect(document.nodes["text-body"]?.parentId).toBe("frame-group");
    expect(
      resolvePageBuilderNodeLayoutBox(
        document.nodes["frame-group"]!,
        "desktop",
      ),
    ).toEqual({
      x: 40,
      y: 60,
      width: 380,
      height: 210,
      rotate: 0,
      zIndex: 0,
    });
    expect(resolvePageBuilderNodeLayoutBox(title, "desktop")).toEqual({
      x: 0,
      y: 0,
      width: 220,
      height: 80,
      rotate: 0,
      zIndex: 0,
    });
    expect(resolvePageBuilderNodeLayoutBox(body, "desktop")).toEqual({
      x: 80,
      y: 120,
      width: 300,
      height: 90,
      rotate: 0,
      zIndex: 0,
    });
    expect(button.parentId).toBe("frame-main");
  });

  test("ungroupPageBuilderNodeOnCanvas は group の子を親へ戻して絶対座標へ復元する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];

    if (
      !frame ||
      frame.type !== "frame" ||
      !title ||
      title.type !== "text" ||
      !body ||
      body.type !== "text"
    ) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 40,
      y: 60,
      width: 220,
      height: 80,
    });
    setPageBuilderNodeLayoutBox(body, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(body, "desktop"),
      x: 120,
      y: 180,
      width: 300,
      height: 90,
    });

    const groupId = groupPageBuilderNodesOnCanvas(
      document,
      ["text-title", "text-body"],
      "desktop",
      () => "frame-group",
    );
    if (groupId === null) {
      throw new Error("group was not created");
    }

    const restoredIds = ungroupPageBuilderNodeOnCanvas(document, groupId);

    expect(restoredIds).toEqual(["text-title", "text-body"]);
    expect(document.nodes["frame-group"]).toBeUndefined();
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-body",
      "button-primary",
    ]);
    expect(document.nodes["text-title"]?.parentId).toBe("frame-main");
    expect(document.nodes["text-body"]?.parentId).toBe("frame-main");
    expect(resolvePageBuilderNodeLayoutBox(title, "desktop")).toEqual({
      x: 40,
      y: 60,
      width: 220,
      height: 80,
      rotate: 0,
      zIndex: 0,
    });
    expect(resolvePageBuilderNodeLayoutBox(body, "desktop")).toEqual({
      x: 120,
      y: 180,
      width: 300,
      height: 90,
      rotate: 0,
      zIndex: 0,
    });
  });

  test("groupPageBuilderNodesOnCanvas は locked ノードと非 absolute 親を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];
    const frame = document.nodes["frame-main"];

    if (!title || !body || !frame || frame.type !== "frame") {
      throw new Error("required builder nodes are missing");
    }

    expect(
      groupPageBuilderNodesOnCanvas(
        document,
        ["text-title", "text-body"],
        "desktop",
      ),
    ).toBeNull();

    frame.layoutMode = "absolute";
    title.locked = true;

    expect(
      groupPageBuilderNodesOnCanvas(
        document,
        ["text-title", "text-body"],
        "desktop",
      ),
    ).toBeNull();
  });

  test("distributePageBuilderNodesOnCanvas は absolute 兄弟を等間隔に配置する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];
    const button = document.nodes["button-primary"];

    if (
      !frame ||
      frame.type !== "frame" ||
      !title ||
      title.type !== "text" ||
      !body ||
      body.type !== "text" ||
      !button ||
      button.type !== "button"
    ) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    setPageBuilderNodeLayoutBox(body, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(body, "desktop"),
      x: 160,
      y: 20,
      width: 100,
      height: 80,
    });
    setPageBuilderNodeLayoutBox(button, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(button, "desktop"),
      x: 360,
      y: 40,
      width: 120,
      height: 80,
    });

    expect(
      distributePageBuilderNodesOnCanvas(
        document,
        ["button-primary", "text-title", "text-body"],
        "desktop",
        "horizontal",
      ),
    ).toBe(true);

    expect(resolvePageBuilderNodeLayoutBox(title, "desktop").x).toBe(0);
    expect(resolvePageBuilderNodeLayoutBox(body, "desktop").x).toBe(180);
    expect(resolvePageBuilderNodeLayoutBox(button, "desktop").x).toBe(360);
  });

  test("duplicatePageBuilderNodesWithOffset は複数選択を親順で複製して layout をずらす", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];
    const title = document.nodes["text-title"];
    const body = document.nodes["text-body"];

    if (!frame || frame.type !== "frame" || !title || !body) {
      throw new Error("required builder nodes are missing");
    }

    frame.layoutMode = "absolute";
    setPageBuilderNodeLayoutBox(title, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(title, "desktop"),
      x: 10,
      y: 20,
      width: 200,
      height: 80,
    });
    setPageBuilderNodeLayoutBox(body, "desktop", {
      ...resolvePageBuilderNodeLayoutBox(body, "desktop"),
      x: 80,
      y: 120,
      width: 240,
      height: 80,
    });

    let sequence = 0;
    const duplicatedIds = duplicatePageBuilderNodesWithOffset(
      document,
      ["text-body", "text-title"],
      "desktop",
      24,
      32,
      (type) => {
        sequence += 1;
        return `${type}-copy-${sequence}`;
      },
    );

    expect(duplicatedIds).toEqual(["text-copy-1", "text-copy-2"]);
    expect(document.nodes["frame-main"]?.children).toEqual([
      "text-title",
      "text-copy-1",
      "text-body",
      "text-copy-2",
      "button-primary",
    ]);
    expect(
      resolvePageBuilderNodeLayoutBox(
        document.nodes["text-copy-1"]!,
        "desktop",
      ),
    ).toEqual({
      x: 34,
      y: 52,
      width: 200,
      height: 80,
      rotate: 0,
      zIndex: 0,
    });
    expect(
      resolvePageBuilderNodeLayoutBox(
        document.nodes["text-copy-2"]!,
        "desktop",
      ),
    ).toEqual({
      x: 104,
      y: 152,
      width: 240,
      height: 80,
      rotate: 0,
      zIndex: 0,
    });
  });

  test("removePageBuilderNode は子孫を含めて削除し親を返す", () => {
    const source = createDefaultPageBuilderDocument("テスト");
    const document = clonePageBuilderDocument(source);

    const parentId = removePageBuilderNode(document, "frame-main");

    expect(parentId).toBe("root");
    expect(document.nodes["root"]?.children).toEqual([]);
    expect(document.nodes["frame-main"]).toBeUndefined();
    expect(document.nodes["text-title"]).toBeUndefined();
    expect(document.nodes["button-primary"]).toBeUndefined();
  });

  test("removePageBuilderNode は locked ノードの削除を拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];

    if (!frame) {
      throw new Error("frame-main is missing");
    }

    frame.locked = true;

    expect(removePageBuilderNode(document, "frame-main")).toBeNull();
    expect(document.nodes["root"]?.children).toEqual(["frame-main"]);
    expect(document.nodes["frame-main"]).toBe(frame);
    expect(document.nodes["text-title"]).toBeDefined();
  });
});
