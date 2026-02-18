/**
 * Collapsible Plugin
 *
 * @description 折りたたみ可能なコンテンツの挿入と管理を提供するプラグイン
 *
 * 3-tier構造: Container → Item → Title + Content
 *
 * - INSERT_COLLAPSIBLE_COMMAND: 新規Collapsible挿入
 * - TOGGLE_COLLAPSIBLE_COMMAND: アイテムの開閉トグル
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
  $getState,
  $isRangeSelection,
  $setState,
  $createTextNode,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  type LexicalCommand,
  mergeRegister,
  type NodeKey,
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import {
  $createCollapsibleContainerNode,
  $isCollapsibleContainerNode,
  CollapsibleContainerNode,
} from '../nodes/CollapsibleContainerNode'
import {
  $createCollapsibleItemNode,
  $isCollapsibleItemNode,
  CollapsibleItemNode,
  openState,
} from '../nodes/CollapsibleItemNode'
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
function $onEscape(direction: 'up' | 'down'): boolean {
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

  // Title内で上キー → コンテナ外へ移動
  // Content内の最後で下キー → コンテナ外へ移動
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

  // First item's title + up key → escape before container
  if (direction === 'up' && inTitle && isAtStart) {
    // Only escape if this is the first item in the container
    let itemNode = node.getParent()
    while (itemNode && !$isCollapsibleItemNode(itemNode)) {
      itemNode = itemNode.getParent()
    }
    if (itemNode && $isCollapsibleItemNode(itemNode)) {
      const items = containerNode.getChildren().filter($isCollapsibleItemNode)
      const firstItem = items[0]
      if (firstItem && firstItem.getKey() === itemNode.getKey()) {
        const paragraph = $createParagraphNode()
        containerNode.insertBefore(paragraph)
        paragraph.select()
        return true
      }
    }
  }

  // Last item's content + down key → escape after container
  if (direction === 'down' && inContent && isAtEnd) {
    let itemNode = node.getParent()
    while (itemNode && !$isCollapsibleItemNode(itemNode)) {
      itemNode = itemNode.getParent()
    }
    if (itemNode && $isCollapsibleItemNode(itemNode)) {
      const items = containerNode.getChildren().filter($isCollapsibleItemNode)
      const lastItem = items[items.length - 1]
      if (lastItem && lastItem.getKey() === itemNode.getKey()) {
        const paragraph = $createParagraphNode()
        containerNode.insertAfter(paragraph)
        paragraph.select()
        return true
      }
    }
  }

  return false
}

// =============================================================================
// Public Helpers
// =============================================================================

/**
 * コンテナにCollapsibleアイテムを追加
 */
export function $addCollapsibleItem(container: CollapsibleContainerNode): CollapsibleItemNode {
  const item = $createCollapsibleItemNode(true)

  const title = $createCollapsibleTitleNode()
  const titleParagraph = $createParagraphNode()
  title.append(titleParagraph)

  const content = $createCollapsibleContentNode()
  const contentParagraph = $createParagraphNode()
  content.append(contentParagraph)

  item.append(title, content)
  container.append(item)

  titleParagraph.select()
  return item
}

/**
 * コンテナから指定インデックスのアイテムを削除
 * 最低1つは残す
 */
export function $removeCollapsibleItem(container: CollapsibleContainerNode, index: number): boolean {
  const items = container.getChildren().filter($isCollapsibleItemNode)
  if (items.length <= 1) return false
  const target = items[index]
  if (!target) return false
  target.remove()
  return true
}

/**
 * コンテナ内のアイテムを並び替え
 */
export function $reorderCollapsibleItem(
  container: CollapsibleContainerNode,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) return
  const items = container.getChildren().filter($isCollapsibleItemNode)
  const movedItem = items[fromIndex]
  const targetItem = items[toIndex]
  if (!movedItem || !targetItem) return

  if (fromIndex < toIndex) {
    targetItem.insertAfter(movedItem)
  } else {
    targetItem.insertBefore(movedItem)
  }
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
        CollapsibleItemNode,
        CollapsibleTitleNode,
        CollapsibleContentNode,
      ])
    ) {
      throw new Error(
        'CollapsiblePlugin: CollapsibleContainerNode, CollapsibleItemNode, CollapsibleTitleNode, CollapsibleContentNode が登録されていません'
      )
    }

    return mergeRegister(
      // INSERT_COLLAPSIBLE_COMMAND
      editor.registerCommand(
        INSERT_COLLAPSIBLE_COMMAND,
        () => {
          editor.update(() => {
            const container = $createCollapsibleContainerNode()

            const item = $createCollapsibleItemNode(true)

            const title = $createCollapsibleTitleNode()
            const titleParagraph = $createParagraphNode()
            titleParagraph.append($createTextNode('タイトル'))
            title.append(titleParagraph)

            const content = $createCollapsibleContentNode()
            const contentParagraph = $createParagraphNode()
            content.append(contentParagraph)

            item.append(title, content)
            container.append(item)

            $insertNodeToNearestRoot(container)

            titleParagraph.select()
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // TOGGLE_COLLAPSIBLE_COMMAND — targets CollapsibleItemNode
      editor.registerCommand(
        TOGGLE_COLLAPSIBLE_COMMAND,
        (nodeKey) => {
          editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if ($isCollapsibleItemNode(node)) {
              $setState(node, openState, !$getState(node, openState))
            }
          })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),

      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape('up'),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape('down'),
        COMMAND_PRIORITY_LOW
      ),

      // 構造検証: CollapsibleContainerNode
      editor.registerNodeTransform(CollapsibleContainerNode, (node) => {
        const children = node.getChildren()

        // CollapsibleItemNode以外の子は除去
        for (const child of children) {
          if (!$isCollapsibleItemNode(child)) {
            child.remove()
          }
        }

        // 少なくとも1つのItemが必要
        if (node.getChildren().filter($isCollapsibleItemNode).length === 0) {
          const item = $createCollapsibleItemNode(true)
          const titleNode = $createCollapsibleTitleNode()
          const titleParagraph = $createParagraphNode()
          titleNode.append(titleParagraph)

          const contentNode = $createCollapsibleContentNode()
          const contentParagraph = $createParagraphNode()
          contentNode.append(contentParagraph)

          item.append(titleNode, contentNode)
          node.append(item)
        }
      }),

      // 構造検証: CollapsibleItemNode
      editor.registerNodeTransform(CollapsibleItemNode, (node) => {
        const children = node.getChildren()
        const hasTitle = children.some($isCollapsibleTitleNode)
        const hasContent = children.some($isCollapsibleContentNode)

        if (!hasTitle) {
          const titleNode = $createCollapsibleTitleNode()
          const paragraph = $createParagraphNode()
          titleNode.append(paragraph)
          const firstChild = node.getFirstChild()
          if (firstChild) {
            firstChild.insertBefore(titleNode)
          } else {
            node.append(titleNode)
          }
        }
        if (!hasContent) {
          const contentNode = $createCollapsibleContentNode()
          const paragraph = $createParagraphNode()
          contentNode.append(paragraph)
          node.append(contentNode)
        }
      }),

      // 構造検証: CollapsibleTitleNode
      editor.registerNodeTransform(CollapsibleTitleNode, (node) => {
        const parent = node.getParent()
        // 親がCollapsibleItemでない場合、アンラップ
        if (!$isCollapsibleItemNode(parent)) {
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
        // 親がCollapsibleItemでない場合、アンラップ
        if (!$isCollapsibleItemNode(parent)) {
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
      })
    )
  }, [editor])

  return null
}
