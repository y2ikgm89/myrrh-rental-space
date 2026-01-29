/**
 * Collapsible Plugin
 *
 * @description 折りたたみ可能なコンテンツの挿入と管理を提供するプラグイン
 *
 * - INSERT_COLLAPSIBLE_COMMAND: 新規Collapsible挿入
 * - TOGGLE_COLLAPSIBLE_COMMAND: 開閉状態のトグル
 * - 構造検証トランスフォーマー
 * - 矢印キーでの境界脱出
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'
import {
  $createCollapsibleContainerNode,
  $isCollapsibleContainerNode,
  CollapsibleContainerNode,
} from '../nodes/CollapsibleContainerNode'
import {
  $createCollapsibleTitleNode,
  $isCollapsibleTitleNode,
  CollapsibleTitleNode,
} from '../nodes/CollapsibleTitleNode'
import {
  $createCollapsibleContentNode,
  $isCollapsibleContentNode,
  CollapsibleContentNode,
} from '../nodes/CollapsibleContentNode'

// =============================================================================
// Commands
// =============================================================================

export const INSERT_COLLAPSIBLE_COMMAND: LexicalCommand<void> =
  createCommand('INSERT_COLLAPSIBLE_COMMAND')

export const TOGGLE_COLLAPSIBLE_COMMAND: LexicalCommand<NodeKey> =
  createCommand('TOGGLE_COLLAPSIBLE_COMMAND')

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでCollapsible境界を脱出
 */
function $onEscape(
  editor: LexicalEditor,
  direction: 'up' | 'down'
): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }

  const node = selection.anchor.getNode()

  // CollapsibleContainer内かチェック
  let containerNode: CollapsibleContainerNode | null = null
  let current = node.getParent()

  while (current) {
    if ($isCollapsibleContainerNode(current)) {
      containerNode = current
      break
    }
    current = current.getParent()
  }

  if (!containerNode) return false

  const isAtStart = selection.anchor.offset === 0
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize()

  // Title内で上キー または Content内の最後で下キー → コンテナ外へ移動
  let inTitle = false
  let inContent = false
  current = node.getParent()
  while (current && current !== containerNode) {
    if ($isCollapsibleTitleNode(current)) {
      inTitle = true
      break
    }
    if ($isCollapsibleContentNode(current)) {
      inContent = true
      break
    }
    current = current.getParent()
  }

  if ((direction === 'up' && inTitle && isAtStart) ||
      (direction === 'down' && inContent && isAtEnd)) {
    const paragraph = $createParagraphNode()
    if (direction === 'up') {
      containerNode.insertBefore(paragraph)
    } else {
      containerNode.insertAfter(paragraph)
    }
    paragraph.select()
    return true
  }

  return false
}

// =============================================================================
// Component
// =============================================================================

export function CollapsiblePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // ノードが登録されているか確認
    if (
      !editor.hasNodes([
        CollapsibleContainerNode,
        CollapsibleTitleNode,
        CollapsibleContentNode,
      ])
    ) {
      throw new Error(
        'CollapsiblePlugin: CollapsibleContainerNode, CollapsibleTitleNode, CollapsibleContentNode が登録されていません'
      )
    }

    return mergeRegister(
      // INSERT_COLLAPSIBLE_COMMAND
      editor.registerCommand(
        INSERT_COLLAPSIBLE_COMMAND,
        () => {
          editor.update(() => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return false

            // Collapsible構造を作成
            const container = $createCollapsibleContainerNode(true) // 初期状態で開く

            const title = $createCollapsibleTitleNode()
            const titleParagraph = $createParagraphNode()
            titleParagraph.append($createTextNode('タイトル'))
            title.append(titleParagraph)

            const content = $createCollapsibleContentNode()
            const contentParagraph = $createParagraphNode()
            content.append(contentParagraph)

            container.append(title, content)

            selection.insertNodes([container])

            // Titleの段落を選択
            titleParagraph.select()
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // TOGGLE_COLLAPSIBLE_COMMAND
      editor.registerCommand(
        TOGGLE_COLLAPSIBLE_COMMAND,
        (nodeKey) => {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if ($isCollapsibleContainerNode(node)) {
              node.toggleOpen()
            }
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(editor, 'up'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(editor, 'down'),
        COMMAND_PRIORITY_LOW
      ),

      // 構造検証: CollapsibleTitleNode
      editor.registerNodeTransform(CollapsibleTitleNode, (node) => {
        const parent = node.getParent()
        // 親がCollapsibleContainerでない場合、アンラップ
        if (!$isCollapsibleContainerNode(parent)) {
          const children = node.getChildren()
          for (const child of children) {
            node.insertBefore(child)
          }
          node.remove()
          return
        }

        // 空のTitleに段落を追加
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }),

      // 構造検証: CollapsibleContentNode
      editor.registerNodeTransform(CollapsibleContentNode, (node) => {
        const parent = node.getParent()
        // 親がCollapsibleContainerでない場合、アンラップ
        if (!$isCollapsibleContainerNode(parent)) {
          const children = node.getChildren()
          for (const child of children) {
            node.insertBefore(child)
          }
          node.remove()
          return
        }

        // 空のContentに段落を追加
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode()
          node.append(paragraph)
        }
      }),

      // 構造検証: CollapsibleContainerNode
      editor.registerNodeTransform(CollapsibleContainerNode, (node) => {
        const children = node.getChildren()
        let hasTitle = false
        let hasContent = false

        for (const child of children) {
          if ($isCollapsibleTitleNode(child)) {
            hasTitle = true
          } else if ($isCollapsibleContentNode(child)) {
            hasContent = true
          } else {
            // 不正な子ノードはContentに移動
            const contentNode = children.find($isCollapsibleContentNode)
            if (contentNode && $isCollapsibleContentNode(contentNode)) {
              contentNode.append(child)
            }
          }
        }

        // Titleがない場合は追加
        if (!hasTitle) {
          const title = $createCollapsibleTitleNode()
          const paragraph = $createParagraphNode()
          title.append(paragraph)
          const firstChild = node.getFirstChild()
          if (firstChild) {
            firstChild.insertBefore(title)
          } else {
            node.append(title)
          }
        }

        // Contentがない場合は追加
        if (!hasContent) {
          const content = $createCollapsibleContentNode()
          const paragraph = $createParagraphNode()
          content.append(paragraph)
          node.append(content)
        }
      })
    )
  }, [editor])

  return null
}
