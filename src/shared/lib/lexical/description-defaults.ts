import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

export { EMPTY_LEXICAL_EDITOR_STATE_JSON };

/**
 * 単一段落の Lexical EditorState JSON を生成する（seed / migration / テスト用）。
 * 空文字の場合は `EMPTY_LEXICAL_EDITOR_STATE_JSON` を返す。
 */
export function buildParagraphEditorStateJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return EMPTY_LEXICAL_EDITOR_STATE_JSON;
  return JSON.stringify({
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              text: trimmed,
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              version: 1,
            },
          ],
        },
      ],
    },
  });
}

/**
 * 単一段落を HTML に整形（seed / テスト用）。エスケープ済み。
 */
export function buildParagraphHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<p>${escaped}</p>`;
}
