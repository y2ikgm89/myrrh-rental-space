/**
 * Lexical Editor Theme
 *
 * Tailwind CSSベースのエディタスタイル定義
 * prose.tsのENHANCED_PROSE_CLASSESと整合性を保つ
 *
 * @see https://lexical.dev/docs/getting-started/theming
 * @see src/lib/styles/prose.ts
 */

import type { EditorThemeClasses } from 'lexical'

export const editorTheme: EditorThemeClasses = {
  // Root
  root: 'focus:outline-none',

  // Text formatting
  text: {
    bold: 'font-semibold text-foreground',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    subscript: 'text-[0.8em] align-sub',
    superscript: 'text-[0.8em] align-super',
    code: 'font-mono bg-muted px-1.5 py-0.5 rounded text-[0.9em] text-foreground',
    highlight: 'bg-yellow-200 dark:bg-yellow-800',
  },

  // Headings（prose.tsと整合: leading-tight, mb/mt値を統一）
  heading: {
    h1: 'text-3xl sm:text-4xl font-bold leading-tight mt-8 mb-6 tracking-tight text-foreground',
    h2: 'text-2xl sm:text-3xl font-bold leading-tight mt-8 mb-5 tracking-tight text-foreground',
    h3: 'text-xl sm:text-2xl font-bold leading-snug mt-6 mb-4 tracking-tight text-foreground',
    h4: 'text-lg sm:text-xl font-bold leading-snug mt-5 mb-3 tracking-tight text-foreground',
    h5: 'text-base font-bold mt-4 mb-2 text-foreground',
    h6: 'text-sm font-bold mt-4 mb-2 text-foreground',
  },

  // Paragraph（prose.tsと整合: leading-relaxed = 1.625, mb-5）
  paragraph: 'mb-5 leading-relaxed text-foreground',

  // Lists（prose.tsと整合: my-5, li:my-1.5）
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal ml-6 my-5',
    ul: 'list-disc ml-6 my-5',
    listitem: 'my-1.5 leading-relaxed text-foreground',
    listitemChecked: 'line-through text-muted-foreground',
    listitemUnchecked: '',
  },

  // Quote（prose.tsと整合: border-primary/40, bg-muted/30）
  quote: 'border-l-4 border-primary/40 pl-6 py-1 my-5 text-muted-foreground bg-muted/30 rounded-r-lg',

  // Code block（prose.tsと整合: rounded-xl, p-5）
  code: 'block bg-muted rounded-xl p-5 font-mono text-sm overflow-x-auto my-5',
  codeHighlight: {
    atrule: 'text-purple-600 dark:text-purple-400',
    attr: 'text-yellow-600 dark:text-yellow-400',
    boolean: 'text-purple-600 dark:text-purple-400',
    builtin: 'text-cyan-600 dark:text-cyan-400',
    cdata: 'text-gray-500',
    char: 'text-green-600 dark:text-green-400',
    class: 'text-yellow-600 dark:text-yellow-400',
    'class-name': 'text-yellow-600 dark:text-yellow-400',
    comment: 'text-gray-500 italic',
    constant: 'text-purple-600 dark:text-purple-400',
    deleted: 'text-red-600 dark:text-red-400',
    doctype: 'text-gray-500',
    entity: 'text-red-600 dark:text-red-400',
    function: 'text-blue-600 dark:text-blue-400',
    important: 'text-red-600 dark:text-red-400 font-bold',
    inserted: 'text-green-600 dark:text-green-400',
    keyword: 'text-purple-600 dark:text-purple-400',
    namespace: 'text-gray-500',
    number: 'text-orange-600 dark:text-orange-400',
    operator: 'text-gray-700 dark:text-gray-300',
    prolog: 'text-gray-500',
    property: 'text-blue-600 dark:text-blue-400',
    punctuation: 'text-gray-700 dark:text-gray-300',
    regex: 'text-green-600 dark:text-green-400',
    selector: 'text-green-600 dark:text-green-400',
    string: 'text-green-600 dark:text-green-400',
    symbol: 'text-purple-600 dark:text-purple-400',
    tag: 'text-red-600 dark:text-red-400',
    url: 'text-cyan-600 dark:text-cyan-400 underline',
    variable: 'text-orange-600 dark:text-orange-400',
  },

  // Link（prose.tsと整合: decoration-primary/40, transition）
  link: 'text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors cursor-pointer',

  // Table（prose.tsと整合: my-8, p-3）
  table: 'w-full border-collapse my-8',
  tableCell: 'border border-border p-3 min-w-[75px]',
  tableCellHeader: 'border border-border p-3 bg-muted font-semibold text-left',
  tableRow: '',
  tableRowStriping: 'even:bg-muted/50',
  tableSelection: 'bg-primary/20',
  tableSelected: 'outline outline-2 outline-primary',

  // Image（prose.tsと整合: rounded-xl, shadow-lg, my-8）
  image: 'max-w-full h-auto rounded-xl shadow-lg my-8',

  // Horizontal rule（prose.tsと整合: my-10）
  hr: 'border-t border-border my-10',

  // Embedblock (for YouTube, etc.)
  embedBlock: {
    base: 'my-8',
    focus: 'outline outline-2 outline-primary',
  },
}
