/**
 * @description `getRegisteredLexicalNodeTypes` / `findUnregisteredLexicalNodeTypes` のテスト。
 *
 * 後半の「実際に危険を再現する」テストは、未登録 node type を含む EditorState JSON を
 * 本物の `createEditor` + `parseEditorState` + `setEditorState`（EDITOR_NODES 込み）に
 * 通し、事前検証（このモジュール）が無ければ何が起きるかを実測する:
 *
 * - 壊れたノードが root の唯一の子 → parseEditorState は当該ノードを黙って
 *   ドロップし（onError: Lexical error #17）、root の子が 0 件になった状態で
 *   setEditorState が isEmpty invariant（Lexical error #38）を同期 throw する
 * - 壊れたノードの前に正常な兄弟が1つでもある → parseEditorState / setEditorState
 *   はどちらも throw せず、壊れたノード以降の内容が無警告のままサイレントに
 *   失われる（クラッシュしないぶんより危険）
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createEditor } from "lexical";
import { EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import {
  findUnregisteredLexicalNodeTypes,
  getRegisteredLexicalNodeTypes,
} from "@/admin/components/editor/lexical/config/registered-node-types";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";
import { installJSDOMForTests } from "../../../../setup-dom";

beforeEach(() => {
  installJSDOMForTests();
});

const UNKNOWN_TYPE = "totally-unknown-widget";

/** root 直下の唯一の子が未登録 type（実害シナリオ A: 同期 throw） */
const SOLE_CHILD_UNKNOWN_JSON = JSON.stringify({
  root: {
    children: [{ type: UNKNOWN_TYPE, version: 1 }],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

/** 正常な段落（既知 type のみ） */
const KNOWN_PARAGRAPH_CHILD = {
  children: [
    {
      detail: 0,
      format: 0,
      mode: "normal",
      style: "",
      text: "hello",
      type: "text",
      version: 1,
    },
  ],
  direction: "ltr",
  format: "",
  indent: 0,
  type: "paragraph",
  version: 1,
  textFormat: 0,
  textStyle: "",
};

/** 正常な段落のみの JSON（比較対照） */
const ALL_KNOWN_TYPES_JSON = JSON.stringify({
  root: {
    children: [KNOWN_PARAGRAPH_CHILD],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

/** 正常な段落の後に未登録 type が続く（実害シナリオ B: サイレント切り詰め） */
const TRAILING_UNKNOWN_JSON = JSON.stringify({
  root: {
    children: [KNOWN_PARAGRAPH_CHILD, { type: UNKNOWN_TYPE, version: 1 }],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

function createProbeEditor(onError: (error: Error) => void) {
  return createEditor({
    namespace: "registered-node-types-test",
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    onError,
  });
}

describe("getRegisteredLexicalNodeTypes", () => {
  test("Lexical コア組込 type を含む", () => {
    const types = getRegisteredLexicalNodeTypes();
    expect(types.has("root")).toBe(true);
    expect(types.has("text")).toBe(true);
    expect(types.has("linebreak")).toBe(true);
    expect(types.has("tab")).toBe(true);
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("artificial")).toBe(true);
  });

  test("EDITOR_NODES 由来のカスタム node type を含む", () => {
    const types = getRegisteredLexicalNodeTypes();
    expect(types.has("image")).toBe(true);
    expect(types.has("callout")).toBe(true);
  });

  test("node replacement の元クラス（heading/table/table-cell）は withKlass 側の type と同一に解決される", () => {
    const types = getRegisteredLexicalNodeTypes();
    expect(types.has("heading")).toBe(true);
    expect(types.has("table")).toBe(true);
    expect(types.has("tablecell")).toBe(true);
  });

  test("未登録の type は含まない", () => {
    expect(getRegisteredLexicalNodeTypes().has(UNKNOWN_TYPE)).toBe(false);
  });
});

describe("findUnregisteredLexicalNodeTypes", () => {
  test("EMPTY_LEXICAL_EDITOR_STATE_JSON は空配列", () => {
    expect(
      findUnregisteredLexicalNodeTypes(EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toEqual([]);
  });

  test("既知の type のみの JSON は空配列", () => {
    expect(findUnregisteredLexicalNodeTypes(ALL_KNOWN_TYPES_JSON)).toEqual([]);
  });

  test("未登録 type を検出する（root 唯一の子）", () => {
    expect(findUnregisteredLexicalNodeTypes(SOLE_CHILD_UNKNOWN_JSON)).toEqual([
      UNKNOWN_TYPE,
    ]);
  });

  test("未登録 type を検出する（正常な兄弟の後）", () => {
    expect(findUnregisteredLexicalNodeTypes(TRAILING_UNKNOWN_JSON)).toEqual([
      UNKNOWN_TYPE,
    ]);
  });
});

describe("未登録 node type の実害（事前検証が無い場合に何が起きるか）", () => {
  test("シナリオA: root 唯一の子が未登録 → setEditorState が同期 throw する（Lexical error #38）", () => {
    // 事前検証: このケースは findUnregisteredLexicalNodeTypes で弾ける
    expect(findUnregisteredLexicalNodeTypes(SOLE_CHILD_UNKNOWN_JSON)).toEqual([
      UNKNOWN_TYPE,
    ]);

    // 事前検証をすり抜けた場合の実害を実測
    const onErrorCalls: string[] = [];
    const editor = createProbeEditor((error) => {
      onErrorCalls.push(error.message);
    });
    const state = editor.parseEditorState(SOLE_CHILD_UNKNOWN_JSON);

    // 未登録ノードは import 段階で黙ってドロップされる（root 子 0 件）
    expect(state.toJSON().root.children).toEqual([]);

    // root の子が 0 件の EditorState を適用しようとすると同期 throw する
    expect(() => editor.setEditorState(state)).toThrow();
  });

  test("シナリオB: 正常な兄弟の後の未登録ノードは throw せずサイレントに失われる", () => {
    // 事前検証: このケースも findUnregisteredLexicalNodeTypes で弾ける
    expect(findUnregisteredLexicalNodeTypes(TRAILING_UNKNOWN_JSON)).toEqual([
      UNKNOWN_TYPE,
    ]);

    // 事前検証をすり抜けた場合の実害を実測: クラッシュしないぶん気づきにくい
    const onErrorCalls: string[] = [];
    const editor = createProbeEditor((error) => {
      onErrorCalls.push(error.message);
    });
    const state = editor.parseEditorState(TRAILING_UNKNOWN_JSON);

    expect(() => editor.setEditorState(state)).not.toThrow();

    // 正常な段落だけが残り、未登録ノードの内容は無警告のまま消える
    const finalJson = editor.getEditorState().toJSON();
    expect(finalJson.root.children).toHaveLength(1);
    expect(onErrorCalls.length).toBeGreaterThan(0);
  });
});
