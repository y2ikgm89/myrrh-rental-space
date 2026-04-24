import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  canRedoPageBuilderHistory,
  canUndoPageBuilderHistory,
  createEmptyPageBuilderHistoryState,
  createPageBuilderHistoryEntry,
  pushPageBuilderHistory,
  redoPageBuilderHistory,
  undoPageBuilderHistory,
} from "@/shared/lib/page-builder/history";

describe("page-builder history", () => {
  test("pushPageBuilderHistory は past を積み future をクリアする", () => {
    const history = createEmptyPageBuilderHistoryState();
    const currentDocument = createDefaultPageBuilderDocument("現在");
    const nextDocument = createDefaultPageBuilderDocument("次");

    const nextHistory = pushPageBuilderHistory(
      {
        past: [],
        future: [createPageBuilderHistoryEntry(nextDocument)],
      },
      createPageBuilderHistoryEntry(currentDocument),
      createPageBuilderHistoryEntry(nextDocument),
    );

    expect(nextHistory.past).toHaveLength(1);
    expect(nextHistory.future).toHaveLength(0);
    expect(history.past).toHaveLength(0);
  });

  test("undoPageBuilderHistory は直前の document に戻し future へ current を積む", () => {
    const previousDocument = createDefaultPageBuilderDocument("前");
    const currentDocument = createDefaultPageBuilderDocument("今");

    const result = undoPageBuilderHistory(
      {
        past: [createPageBuilderHistoryEntry(previousDocument)],
        future: [],
      },
      createPageBuilderHistoryEntry(currentDocument),
    );

    expect(result?.document.nodes["text-title"]?.content).toEqual({
      text: "前",
      tag: "h1",
    });
    expect(result?.history.past).toHaveLength(0);
    expect(result?.history.future).toHaveLength(1);
    expect(
      result?.history.future[0]?.document.nodes["text-title"]?.content,
    ).toEqual({
      text: "今",
      tag: "h1",
    });
  });

  test("redoPageBuilderHistory は future から復元して current を past に戻す", () => {
    const currentDocument = createDefaultPageBuilderDocument("今");
    const nextDocument = createDefaultPageBuilderDocument("次");

    const result = redoPageBuilderHistory(
      {
        past: [],
        future: [createPageBuilderHistoryEntry(nextDocument)],
      },
      createPageBuilderHistoryEntry(currentDocument),
    );

    expect(result?.document.nodes["text-title"]?.content).toEqual({
      text: "次",
      tag: "h1",
    });
    expect(result?.history.past).toHaveLength(1);
    expect(result?.history.future).toHaveLength(0);
    expect(
      result?.history.past[0]?.document.nodes["text-title"]?.content,
    ).toEqual({
      text: "今",
      tag: "h1",
    });
  });

  test("canUndoPageBuilderHistory / canRedoPageBuilderHistory は履歴有無を返す", () => {
    const history = createEmptyPageBuilderHistoryState();

    expect(canUndoPageBuilderHistory(history)).toBe(false);
    expect(canRedoPageBuilderHistory(history)).toBe(false);
    expect(
      canUndoPageBuilderHistory({
        past: [
          createPageBuilderHistoryEntry(createDefaultPageBuilderDocument("x")),
        ],
        future: [],
      }),
    ).toBe(true);
    expect(
      canRedoPageBuilderHistory({
        past: [],
        future: [
          createPageBuilderHistoryEntry(createDefaultPageBuilderDocument("y")),
        ],
      }),
    ).toBe(true);
  });
});
