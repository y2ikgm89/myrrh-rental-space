/**
 * Lexical EditorState JSON から公開記事目次用の見出しを抽出する。
 *
 * 公開側は管理画面の Lexical エディタを使えないため（`server-only` / DOM 依存）、
 * `@lexical/headless` を使わず **JSON 構造を直接走査**する。
 * これにより RSC / Server Actions / ビルド時のどこからでも安全に呼べる。
 *
 * 抽出条件:
 * - `type === "heading"` かつ `tag === "h2" | "h3"`
 * - CustomHeadingNode の NodeState (`flat: true`) で永続化された `anchorId` が
 *   空でない（= エディタで一度でも保存済みの記事）
 * - 再帰的に `children` を辿るため、カラム内見出し等のネストにも対応
 *
 * 注: 空 `anchorId` の見出し（legacy content / 未保存）は黙って除外する。
 * 管理画面で再保存すると HeadingAnchorPlugin が NodeState を populate する。
 */

export type HeadingEntry = {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
};

type SerializedNode = {
  readonly type?: string;
  readonly tag?: string;
  readonly text?: string;
  readonly anchorId?: string;
  readonly children?: readonly SerializedNode[];
};

type SerializedRoot = {
  readonly root?: SerializedNode;
};

/**
 * Lexical EditorState から h2 / h3 見出しを抽出する。
 *
 * Prisma の JSON カラム（`contentJson`）はランタイムで既にパース済みの
 * オブジェクトとして返るため、`unknown` を直接受け付ける。文字列で
 * 渡された場合は内部で `JSON.parse` する。
 *
 * @param editorState EditorState JSON 文字列または パース済みオブジェクト
 * @returns 見出しエントリの配列（ドキュメント順序を保持）
 */
export function extractHeadings(editorState: unknown): readonly HeadingEntry[] {
  let parsed: unknown = editorState;

  if (typeof editorState === "string") {
    if (!editorState) return [];
    try {
      parsed = JSON.parse(editorState);
    } catch {
      return [];
    }
  }

  if (!isSerializedRoot(parsed) || !parsed.root) return [];

  const entries: HeadingEntry[] = [];
  walk(parsed.root, entries);
  return entries;
}

function walk(node: SerializedNode, out: HeadingEntry[]): void {
  if (node.type === "heading") {
    const level = headingLevel(node.tag);
    const anchorId =
      typeof node.anchorId === "string" ? node.anchorId.trim() : "";
    if (level !== null && anchorId) {
      const text = collectText(node).trim();
      if (text) {
        out.push({ id: anchorId, text, level });
      }
    }
    // heading の children はテキスト・マーク等のため再帰不要
    return;
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    walk(child, out);
  }
}

function headingLevel(tag: string | undefined): 2 | 3 | null {
  if (tag === "h2") return 2;
  if (tag === "h3") return 3;
  return null;
}

/**
 * 見出しノードの子ツリーから純粋なテキスト内容を連結する。
 * `type === "text"` のノードの `text` フィールドを再帰的に結合。
 */
function collectText(node: SerializedNode): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (!Array.isArray(node.children)) return "";
  let out = "";
  for (const child of node.children) {
    out += collectText(child);
  }
  return out;
}

function isSerializedRoot(value: unknown): value is SerializedRoot {
  return typeof value === "object" && value !== null && "root" in value;
}
