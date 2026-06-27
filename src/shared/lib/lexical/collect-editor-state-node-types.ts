/**
 * Lexical EditorState JSON 内の node type 一覧を収集する。
 * headless 派生パイプラインの検証・デバッグ用。
 */

export function collectLexicalEditorStateNodeTypes(
  editorStateJson: string,
): Set<string> {
  const types = new Set<string>();

  function walk(value: unknown): void {
    if (typeof value !== "object" || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    const type = record["type"];
    if (typeof type === "string") {
      types.add(type);
    }
    for (const child of Object.values(record)) {
      walk(child);
    }
  }

  try {
    walk(JSON.parse(editorStateJson) as unknown);
  } catch {
    return types;
  }

  return types;
}
