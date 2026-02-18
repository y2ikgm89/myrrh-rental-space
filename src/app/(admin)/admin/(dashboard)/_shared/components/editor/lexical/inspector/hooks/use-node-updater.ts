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
 * import { $getState, $setState } from 'lexical'
 * import { $isButtonNode, buttonTextState, buttonVariantState } from '../../nodes/ButtonNode'
 *
 * function ButtonInspectorPanel({ nodeKey, node }: Props) {
 *   const updateNode = useNodeUpdater(nodeKey, $isButtonNode)
 *
 *   const text = editor.getEditorState().read(() => $getState(node, buttonTextState))
 *
 *   const handleTextChange = (value: string) =>
 *     updateNode((n) => { $setState(n, buttonTextState, value) })
 *
 *   const handleVariantChange = (value: string) => {
 *     if (isButtonVariant(value)) {
 *       updateNode((n) => { $setState(n, buttonVariantState, value) })
 *     }
 *   }
 *
 *   return <Input value={text} onChange={(e) => handleTextChange(e.target.value)} />
 * }
 * ```
 *
 * @remarks
 * - 更新関数内では `$setState(node, stateConfig, value)` を使用
 * - editor.update()内で実行されるため $setState は直接呼び出し可
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
