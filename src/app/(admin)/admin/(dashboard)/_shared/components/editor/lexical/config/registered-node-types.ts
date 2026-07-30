/**
 * Lexical エディタに実際に登録されている node type の集合と、
 * EditorState JSON に含まれる未登録 node type の検出。
 *
 * 破損 JSON（未登録 node type を含む）を LexicalComposer にマウントすると
 * `editor.setEditorState()` が同期 throw（Lexical error #38）するか、
 * `parseEditorState` 内部の try/catch に握りつぶされて本文がサイレントに
 * 切り詰められる。マウント前にこの関数で弾くことが主防御になる。
 *
 * `EDITOR_NODES` は admin 配下（このディレクトリ）にしか存在しないため、
 * `src/shared/lib/lexical/collect-editor-state-node-types.ts`（shared 層、
 * `@/admin` import 禁止）ではなくこちらに置く。
 */

import { EDITOR_NODES } from "./nodes";
import { collectLexicalEditorStateNodeTypes } from "@/shared/lib/lexical/collect-editor-state-node-types";

/**
 * Lexical コア (`createEditor()`) が常に暗黙登録する組込 node type。
 * `node_modules/lexical/src/LexicalEditor.ts` の `createEditor()` 実装
 * （`RootNode` / `TextNode` / `LineBreakNode` / `TabNode` / `ParagraphNode` /
 * `ArtificialNode__DO_NOT_USE`）の各 `getType()` を直書きで固定する。
 * `editor._nodes` 等の private 実装詳細には依存しない（将来のバージョンアップ耐性）。
 */
const IMPLICIT_LEXICAL_NODE_TYPES: ReadonlySet<string> = new Set([
  "root",
  "text",
  "linebreak",
  "tab",
  "paragraph",
  "artificial",
]);

let cachedRegisteredNodeTypes: Set<string> | undefined;

/**
 * `EDITOR_NODES`（node replacement の `withKlass` 側を含む）+ Lexical コア組込 type
 * から成る「実際に登録されている node type」の集合。`EDITOR_NODES` は静的なので
 * 初回呼び出し時にのみ計算しキャッシュする。
 */
export function getRegisteredLexicalNodeTypes(): Set<string> {
  if (cachedRegisteredNodeTypes) {
    return cachedRegisteredNodeTypes;
  }

  const types = new Set<string>(IMPLICIT_LEXICAL_NODE_TYPES);
  for (const entry of EDITOR_NODES) {
    if (typeof entry === "object") {
      // node replacement エントリ: { replace, with, withKlass }
      types.add((entry.withKlass ?? entry.replace).getType());
    } else {
      types.add(entry.getType());
    }
  }

  cachedRegisteredNodeTypes = types;
  return types;
}

/**
 * EditorState JSON に含まれる node type のうち、登録されていないものを列挙する。
 * 空配列なら安全にマウントできる。
 */
export function findUnregisteredLexicalNodeTypes(
  editorStateJson: string,
): string[] {
  const registered = getRegisteredLexicalNodeTypes();
  const found = collectLexicalEditorStateNodeTypes(editorStateJson);
  return [...found].filter((type) => !registered.has(type));
}
