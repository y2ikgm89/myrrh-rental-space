import { renderEditorStateJsonToHtmlCore } from "./render-editor-state-json-to-html-core";
import { finalizeLexicalExportedHtml } from "@/shared/lib/html/lexical-content-html-pipeline";
import { DomainError } from "@/shared/domain/domain-error";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/types";
import { logError } from "@/shared/lib/errors/logger-core";

/**
 * Lexical 公式: contentJson 正本 → 派生 HTML（enrich + sanitize 済み）。
 *
 * seed / data migration worker 等、server-only 外からも保存パイプラインと同一経路で利用する。
 * そのため本ファイルは `import "server-only"` を持たない。ログ出力も server-only を
 * 持たない `logger-core` / `errors/types` を直接 import することで同じ制約を維持する
 * （`@/shared/lib/errors/server` はサーバー専用 barrel のため使わない）。
 *
 * 変換失敗時（壊れた / 未登録 node type を含む editorStateJson 等）は空文字列へ silent
 * フォールバックせず `DomainError` でラップして throw する。空文字列を返すと呼び出し元の
 * admin mutation がそれをそのまま contentHtml/descriptionHtml へ persist し、些細な編集
 * 保存だけで公開ページの本文が丸ごと消える事故になるため（M critical）。
 */
export function deriveLexicalContentHtmlFromJsonCore(
  contentJson: string,
): string {
  try {
    return finalizeLexicalExportedHtml(
      renderEditorStateJsonToHtmlCore(contentJson),
    );
  } catch (error) {
    logError(error, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "deriveLexicalContentHtmlFromJsonCore" },
    });
    throw new DomainError(
      "本文のHTML生成に失敗しました。エディタの内容を確認して保存し直してください。",
      "UNEXPECTED",
    );
  }
}
