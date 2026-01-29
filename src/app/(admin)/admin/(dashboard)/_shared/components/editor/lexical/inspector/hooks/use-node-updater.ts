/**
 * Node Updater Hook
 *
 * @description
 * インスペクターパネルでノードのプロパティを更新するための共通フック。
 * 型安全にノードを取得し、更新処理を実行する。
 *
 * @module
 */

'use client'

import { useCallback } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type LexicalNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

/**
 * ノードの型ガード関数の型
 *
 * @description Lexicalの$isXxxNode関数と同じシグネチャ
 * @template T - 判定対象のノード型
 */
type TypeGuard<T extends LexicalNode> = (node: LexicalNode | null | undefined) => node is T

/**
 * ノード更新関数の型
 *
 * @description updateNode関数に渡すコールバックの型
 * @template T - 更新対象のノード型
 */
export type NodeUpdater<T extends LexicalNode> = (node: T) => void

// =============================================================================
// Hook
// =============================================================================

/**
 * ノード更新用のユーティリティフック
 *
 * @description
 * InspectorPanelコンポーネントで共通して使用するノード更新パターンを提供する。
 *
 * このフックは以下を行う:
 * 1. `$getNodeByKey`でnodeKeyからノードを取得
 * 2. typeGuardで型チェック
 * 3. 更新関数（updater）を実行
 *
 * 全ての処理は`editor.update()`内で実行されるため、
 * Lexicalの不変性とトランザクション規則に準拠する。
 *
 * @template T - 更新対象のノード型（ButtonNode, ImageNode等）
 * @param nodeKey - 対象ノードのキー
 * @param typeGuard - ノードの型ガード関数（$isButtonNode等）
 * @returns updateNode関数
 *
 * @example
 * ```tsx
 * function ButtonInspectorPanel({ nodeKey, node }: Props) {
 *   const updateNode = useNodeUpdater(nodeKey, $isButtonNode)
 *
 *   const handleTextChange = useCallback(
 *     (value: string) => updateNode((n) => n.setText(value)),
 *     [updateNode]
 *   )
 *
 *   const handleVariantChange = useCallback(
 *     (value: string) => {
 *       if (isButtonVariant(value)) {
 *         updateNode((n) => n.setVariant(value))
 *       }
 *     },
 *     [updateNode]
 *   )
 *
 *   return (
 *     <Input value={node.getText()} onChange={handleTextChange} />
 *   )
 * }
 * ```
 *
 * @remarks
 * - 更新関数内では`node.setXxx()`のようなsetterメソッドを呼び出す
 * - setterメソッドは内部で`getWritable()`を使用するため、直接呼び出してOK
 * - typeGuardが失敗した場合、更新は実行されない（サイレントに無視）
 */
export function useNodeUpdater<T extends LexicalNode>(
  nodeKey: string,
  typeGuard: TypeGuard<T>
): (updater: NodeUpdater<T>) => void {
  const [editor] = useLexicalComposerContext()

  return useCallback(
    (updater: NodeUpdater<T>) => {
      editor.update(() => {
        const targetNode = $getNodeByKey(nodeKey)
        if (typeGuard(targetNode)) {
          updater(targetNode)
        }
      })
    },
    [editor, nodeKey, typeGuard]
  )
}
