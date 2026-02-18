/**
 * Table of Contents Node
 *
 * @description 見出しリストを表示する目次DecoratorNode
 */

'use client'

import { type ReactElement, useEffect, useState } from 'react'
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from 'lexical'
import { $create, $getRoot, DecoratorNode } from 'lexical'
import { $isHeadingNode, type HeadingTagType } from '@lexical/rich-text'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { List } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

type TocEntry = {
  key: string
  text: string
  tag: HeadingTagType
}

// =============================================================================
// Utilities
// =============================================================================

const TAG_LEVELS: Record<HeadingTagType, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
}

function collectHeadings(editor: LexicalEditor): TocEntry[] {
  const entries: TocEntry[] = []

  editor.getEditorState().read(() => {
    const root = $getRoot()
    for (const child of root.getChildren()) {
      if ($isHeadingNode(child)) {
        const text = child.getTextContent().trim()
        if (text) {
          entries.push({
            key: child.getKey(),
            text,
            tag: child.getTag(),
          })
        }
      }
    }
  })

  return entries
}

// =============================================================================
// Component
// =============================================================================

function TableOfContentsComponent({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext()
  const [entries, setEntries] = useState<TocEntry[]>([])

  useEffect(() => {
    const update = () => {
      setEntries(collectHeadings(editor))
    }

    update()

    return editor.registerUpdateListener(() => {
      update()
    })
  }, [editor])

  if (entries.length === 0) {
    return (
      <div
        data-lexical-node-key={nodeKey}
        className="my-6 rounded-lg border border-border bg-muted/30 p-4"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <List className="h-4 w-4" />
          <span>見出しを追加すると目次が自動生成されます</span>
        </div>
      </div>
    )
  }

  return (
    <nav
      data-lexical-node-key={nodeKey}
      className="my-6 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <List className="h-4 w-4" />
        <span>目次</span>
      </div>
      <ul className="space-y-1">
        {entries.map((entry) => {
          const level = TAG_LEVELS[entry.tag] ?? 1
          const indent = (level - 1) * 16

          return (
            <li
              key={entry.key}
              style={{ paddingLeft: `${indent}px` }}
            >
              <button
                type="button"
                className="text-left text-sm text-primary hover:underline"
                onClick={() => {
                  editor.getEditorState().read(() => {
                    const element = editor.getElementByKey(entry.key)
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  })
                }}
              >
                {entry.text}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// =============================================================================
// Node Class
// =============================================================================

export class TableOfContentsNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('table-of-contents', { extends: DecoratorNode })
  }

  static override importDOM(): null {
    return null
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const entries = collectHeadings(editor)

    const nav = document.createElement('nav')
    nav.setAttribute('data-toc', 'true')
    nav.setAttribute('aria-label', '目次')

    if (entries.length === 0) {
      return { element: nav }
    }

    const title = document.createElement('p')
    title.setAttribute('data-toc-title', 'true')
    title.textContent = '目次'
    nav.appendChild(title)

    const ul = document.createElement('ul')
    for (const entry of entries) {
      const li = document.createElement('li')
      li.setAttribute('data-toc-level', String(TAG_LEVELS[entry.tag] ?? 1))
      const a = document.createElement('a')
      a.href = `#heading-${entry.key}`
      a.textContent = entry.text
      li.appendChild(a)
      ul.appendChild(li)
    }
    nav.appendChild(ul)

    return { element: nav }
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme['tableOfContents']
    if (className) {
      div.className = className
    }
    return div
  }

  override updateDOM(): false {
    return false
  }

  override decorate(): ReactElement {
    return <TableOfContentsComponent nodeKey={this.__key} />
  }

  override isInline(): false {
    return false
  }

  isTopLevel(): true {
    return true
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createTableOfContentsNode(): TableOfContentsNode {
  return $create(TableOfContentsNode)
}

export function $isTableOfContentsNode(
  node: LexicalNode | null | undefined
): node is TableOfContentsNode {
  return node instanceof TableOfContentsNode
}
