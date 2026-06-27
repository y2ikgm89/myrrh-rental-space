import { renderEditorStateJsonToHtmlCore } from "./render-editor-state-json-to-html-core";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline";

/**
 * Lexical 公式: contentJson 正本 → 派生 HTML（enrich + sanitize 済み）。
 *
 * seed / data migration worker 等、server-only 外からも保存パイプラインと同一経路で利用する。
 */
export function deriveLexicalContentHtmlFromJsonCore(
  contentJson: string,
): string {
  return finalizeLexicalExportedHtml(
    renderEditorStateJsonToHtmlCore(contentJson),
  );
}
