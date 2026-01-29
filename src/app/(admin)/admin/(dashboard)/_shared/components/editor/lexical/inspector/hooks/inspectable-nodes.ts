/**
 * Inspectable Nodes
 *
 * @description インスペクター対象ノードの型定義と判定ユーティリティ
 *
 * 新しいノードタイプを追加する場合：
 * 1. SelectedNodeInfoにユニオンメンバーを追加
 * 2. getInspectableInfoに型ガードチェックを追加
 * 3. InspectorSidebar.tsxのrenderPanelにcaseを追加
 * 4. 対応するInspectorPanelコンポーネントを作成
 */

import type { LexicalNode, NodeKey } from 'lexical'

import { $isButtonNode, type ButtonNode } from '../../nodes/ButtonNode'
import { $isImageNode, type ImageNode } from '../../nodes/ImageNode'
import { $isCalloutNode, type CalloutNode } from '../../nodes/CalloutNode'
import { $isBookmarkNode, type BookmarkNode } from '../../nodes/BookmarkNode'

// =============================================================================
// Types
// =============================================================================

/**
 * インスペクター対応ノードの種別
 *
 * @description 各ノードタイプを識別するリテラル型
 */
export type InspectableNodeType = 'button' | 'image' | 'callout' | 'bookmark'

/**
 * 選択中ノード情報のDiscriminated Union型
 *
 * @description
 * TypeScriptの判別可能なユニオン（Discriminated Union）パターンを使用。
 * `nodeType`フィールドで判別することで、switch文内で`node`の型が自動的に絞り込まれる。
 *
 * @example
 * ```typescript
 * function renderPanel(info: SelectedNodeInfo) {
 *   if (!info) return null
 *
 *   switch (info.nodeType) {
 *     case 'button':
 *       // info.node は ButtonNode 型として推論される
 *       return <ButtonInspectorPanel node={info.node} />
 *     case 'image':
 *       // info.node は ImageNode 型として推論される
 *       return <ImageInspectorPanel node={info.node} />
 *   }
 * }
 * ```
 *
 * @see https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
 */
export type SelectedNodeInfo =
  | { nodeType: 'button'; node: ButtonNode; nodeKey: NodeKey }
  | { nodeType: 'image'; node: ImageNode; nodeKey: NodeKey }
  | { nodeType: 'callout'; node: CalloutNode; nodeKey: NodeKey }
  | { nodeType: 'bookmark'; node: BookmarkNode; nodeKey: NodeKey }
  | null

/**
 * null以外のSelectedNodeInfo
 * @internal
 */
export type InspectableResult = Exclude<SelectedNodeInfo, null>

// =============================================================================
// Utilities
// =============================================================================

/**
 * LexicalノードがInspectable対象かどうかを判定し、型情報を返す
 *
 * @description
 * 各ノードタイプの型ガード（$isXxxNode）を順番にチェックし、
 * 対応するDiscriminated Union情報を返す。
 * 対象外のノードの場合はnullを返す。
 *
 * @param node - 判定対象のLexicalノード
 * @returns Inspectable対象であればSelectedNodeInfo、そうでなければnull
 *
 * @example
 * ```typescript
 * editor.getEditorState().read(() => {
 *   const selection = $getSelection()
 *   if ($isNodeSelection(selection)) {
 *     const node = selection.getNodes()[0]
 *     const info = getInspectableInfo(node)
 *     if (info) {
 *       console.log(`Selected: ${info.nodeType}`)
 *     }
 *   }
 * })
 * ```
 */
export function getInspectableInfo(node: LexicalNode): InspectableResult | null {
  const nodeKey = node.getKey()

  if ($isButtonNode(node)) {
    return { nodeType: 'button', node, nodeKey }
  }
  if ($isImageNode(node)) {
    return { nodeType: 'image', node, nodeKey }
  }
  if ($isCalloutNode(node)) {
    return { nodeType: 'callout', node, nodeKey }
  }
  if ($isBookmarkNode(node)) {
    return { nodeType: 'bookmark', node, nodeKey }
  }
  return null
}

/**
 * 対応しているノードタイプの一覧
 *
 * @description 現在インスペクターがサポートしているノードタイプのリスト
 */
export const INSPECTABLE_NODE_TYPES: readonly InspectableNodeType[] = [
  'button',
  'image',
  'callout',
  'bookmark',
] as const
