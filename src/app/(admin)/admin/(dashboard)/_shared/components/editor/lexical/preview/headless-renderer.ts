/**
 * Headless Renderer
 *
 * @description サーバーサイドでEditorState JSON → HTML変換
 */

import { createHeadlessEditor } from '@lexical/headless'
import { $generateHtmlFromNodes } from '@lexical/html'
import { EDITOR_NODES } from '../config/nodes'
import { editorTheme } from '../theme'
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

export function renderEditorStateToHtml(editorStateJson: string): string {
  const editor = createHeadlessEditor({
    namespace: 'HeadlessRenderer',
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    onError: (error: Error) => {
      logError(error, {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'headlessLexicalRender' },
      })
    },
  })

  const editorState = editor.parseEditorState(editorStateJson)
  let html = ''

  editorState.read(() => {
    html = $generateHtmlFromNodes(editor, null)
  })

  return html
}
