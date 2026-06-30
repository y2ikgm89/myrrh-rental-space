import { createHeadlessEditor } from "@lexical/headless";
import type { LexicalEditor } from "lexical";
import { HEADLESS_EDITOR_NODES } from "./config/nodes";
import { editorTheme } from "./theme";
import { logger } from "@/shared/lib/errors/logger-core";

/** 規約 HTML↔JSON 派生および CLI 向け headless editor（Lexical 公式 API） */
export function createProjectHeadlessEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "LexicalHeadless",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: (error: Error) => {
      logger.error("Headless Lexical editor error", {
        error: error.message,
      });
    },
  });
}
