/**
 * Lexical Editor Theme
 *
 * Tailwind CSSベースのエディタスタイル定義
 * @see https://lexical.dev/docs/getting-started/theming
 */

import type { EditorThemeClasses } from 'lexical'

export const editorTheme: EditorThemeClasses = {
  // Root
  root: 'focus:outline-none',

  // Text formatting
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    subscript: 'text-[0.8em] align-sub',
    superscript: 'text-[0.8em] align-super',
    code: 'font-mono bg-muted px-1 py-0.5 rounded text-sm',
    highlight: 'bg-yellow-200 dark:bg-yellow-800',
  },

  // Headings
  heading: {
    h1: 'text-3xl font-bold mt-6 mb-4',
    h2: 'text-2xl font-bold mt-5 mb-3',
    h3: 'text-xl font-bold mt-4 mb-2',
    h4: 'text-lg font-bold mt-3 mb-2',
    h5: 'text-base font-bold mt-2 mb-1',
    h6: 'text-sm font-bold mt-2 mb-1',
  },

  // Paragraph
  paragraph: 'mb-4 leading-relaxed',

  // Lists
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal ml-6 mb-4',
    ul: 'list-disc ml-6 mb-4',
    listitem: 'mb-1',
    listitemChecked: 'line-through text-muted-foreground',
    listitemUnchecked: '',
  },

  // Quote
  quote: 'border-l-4 border-primary pl-4 italic my-4 text-muted-foreground',

  // Code block
  code: 'block bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto my-4',
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

  // Link
  link: 'text-primary underline hover:text-primary/80 cursor-pointer',

  // Table
  table: 'w-full border-collapse my-4',
  tableCell: 'border border-border p-2 min-w-[75px]',
  tableCellHeader: 'border border-border p-2 bg-muted font-bold text-left',
  tableRow: '',
  tableRowStriping: 'even:bg-muted/50',
  tableSelection: 'bg-primary/20',
  tableSelected: 'outline outline-2 outline-primary',

  // Image
  image: 'max-w-full h-auto rounded-lg my-4',

  // Horizontal rule
  hr: 'border-t border-border my-6',

  // Embedblock (for YouTube, etc.)
  embedBlock: {
    base: 'my-4',
    focus: 'outline outline-2 outline-primary',
  },
}
