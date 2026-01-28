/**
 * 選択中ノード検出フック
 *
 * @description SELECTION_CHANGE_COMMANDを監視し、選択中のDecoratorNode/ElementNodeを返す
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalNode,
  type NodeKey,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

import { $isButtonNode, type ButtonNode } from '../../nodes/ButtonNode'
import { $isImageNode, type ImageNode } from '../../nodes/ImageNode'
import { $isCalloutNode, type CalloutNode } from '../../nodes/CalloutNode'
import { $isBookmarkNode, type BookmarkNode } from '../../nodes/BookmarkNode'

// =============================================================================
// Types
// =============================================================================

export type InspectableNode = ButtonNode | ImageNode | CalloutNode | BookmarkNode

export type InspectableNodeType = 'button' | 'image' | 'callout' | 'bookmark'

export type SelectedNodeInfo = {
  node: InspectableNode
  nodeKey: NodeKey
  nodeType: InspectableNodeType
} | null

// =============================================================================
// Type Guards
// =============================================================================

function getInspectableNodeType(node: LexicalNode): InspectableNodeType | null {
  if ($isButtonNode(node)) return 'button'
  if ($isImageNode(node)) return 'image'
  if ($isCalloutNode(node)) return 'callout'
  if ($isBookmarkNode(node)) return 'bookmark'
  return null
}

function isInspectableNode(node: LexicalNode): node is InspectableNode {
  return getInspectableNodeType(node) !== null
}

// =============================================================================
// Hook
// =============================================================================

export function useSelectedNode(): SelectedNodeInfo {
  const [editor] = useLexicalComposerContext()
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo>(null)

  const updateSelectedNode = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()

      // NodeSelection: DecoratorNode（Button, Image等）が選択された場合
      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        if (nodes.length === 1) {
          const node = nodes[0]
          const nodeType = getInspectableNodeType(node)
          if (nodeType && isInspectableNode(node)) {
            setSelectedNode({
              node,
              nodeKey: node.getKey(),
              nodeType,
            })
            return
          }
        }
      }

      // RangeSelection: ElementNode（Callout等）内にカーソルがある場合
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode()
        // 親をたどってInspectableNodeを探す
        let current: LexicalNode | null = anchorNode
        while (current !== null) {
          const nodeType = getInspectableNodeType(current)
          if (nodeType && isInspectableNode(current)) {
            setSelectedNode({
              node: current,
              nodeKey: current.getKey(),
              nodeType,
            })
            return
          }
          current = current.getParent()
        }
      }

      // 該当なし
      setSelectedNode(null)
    })
  }, [editor])

  useEffect(() => {
    // 初回実行
    updateSelectedNode()

    // リスナー登録
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateSelectedNode()
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        updateSelectedNode()
      })
    )
  }, [editor, updateSelectedNode])

  return selectedNode
}
