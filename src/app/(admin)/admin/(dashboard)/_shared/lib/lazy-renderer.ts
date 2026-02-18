/**
 * Lazy Renderer — Dynamic import wrapper for headless-renderer
 *
 * @description Loads renderEditorStateToHtml dynamically to avoid module evaluation
 * issues in Server Actions during Next.js build process. The headless-renderer
 * contains Lexical code that requires a valid editor context and should not be
 * evaluated at module load time in Server Actions.
 */

/**
 * Converts Lexical EditorState JSON string to HTML (lazy-loaded)
 *
 * @param editorStateJson - JSON string from Lexical editor.getEditorState().toJSON()
 * @returns HTML string, or the original JSON if not valid EditorState format
 */
export async function renderEditorStateToHtmlLazy(editorStateJson: string): Promise<string> {
  const { renderEditorStateToHtml } = await import(
    '@/admin/components/editor/lexical/preview/headless-renderer'
  )
  return renderEditorStateToHtml(editorStateJson)
}
