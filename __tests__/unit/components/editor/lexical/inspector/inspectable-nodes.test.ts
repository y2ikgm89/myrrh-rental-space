/**
 * Inspectable Nodes Tests
 *
 * @description getInspectableInfoとINSPECTABLE_NODE_TYPESのユニットテスト
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, $getState, type LexicalEditor } from 'lexical'

// テスト対象
import {
  getInspectableInfo,
  INSPECTABLE_NODE_TYPES,
  type InspectableNodeType,
} from '@/admin/components/editor/lexical/inspector/hooks/inspectable-nodes'

// ノードのインポート
import { ButtonNode, $createButtonNode, buttonTextState, buttonHrefState } from '@/admin/components/editor/lexical/nodes/ButtonNode'
import { ImageNode, $createImageNode } from '@/admin/components/editor/lexical/nodes/ImageNode'
import { CalloutNode, $createCalloutNode } from '@/admin/components/editor/lexical/nodes/CalloutNode'
import { BookmarkNode, $createBookmarkNode } from '@/admin/components/editor/lexical/nodes/BookmarkNode'

// =============================================================================
// Test Setup
// =============================================================================

function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'test',
    nodes: [ButtonNode, ImageNode, CalloutNode, BookmarkNode],
    onError: (error) => {
      throw error
    },
  })
}

// =============================================================================
// Tests
// =============================================================================

describe('inspectable-nodes', () => {
  describe('INSPECTABLE_NODE_TYPES', () => {
    test('対応しているノードタイプが15つ定義されている', () => {
      expect(INSPECTABLE_NODE_TYPES).toHaveLength(15)
    })

    test('すべてのインスペクタブルノードタイプが含まれている', () => {
      const expectedTypes: InspectableNodeType[] = [
        'button', 'image', 'callout', 'bookmark', 'pullQuote',
        'collapsible', 'steps', 'tabs', 'layout',
        'youtube', 'vimeo', 'x', 'instagram', 'pageBreak', 'mapEmbed',
      ]
      expect(INSPECTABLE_NODE_TYPES).toEqual(expectedTypes)
    })

    test('readonly配列である', () => {
      expect(Array.isArray(INSPECTABLE_NODE_TYPES)).toBe(true)
    })
  })

  describe('getInspectableInfo', () => {
    let editor: LexicalEditor

    beforeEach(() => {
      editor = createTestEditor()
    })

    test('ButtonNodeに対してbutton型の情報を返す', async () => {
      await editor.update(() => {
        const root = $getRoot()
        root.clear()
        const buttonNode = $createButtonNode({
          text: 'テストボタン',
          href: 'https://example.com',
        })
        root.append(buttonNode)

        const info = getInspectableInfo(buttonNode)

        expect(info).not.toBeNull()
        expect(info?.nodeType).toBe('button')
        expect(info?.node).toBe(buttonNode)
        expect(info?.nodeKey).toBe(buttonNode.getKey())
      })
    })

    test('ImageNodeに対してimage型の情報を返す', async () => {
      await editor.update(() => {
        const root = $getRoot()
        root.clear()
        const imageNode = $createImageNode({
          src: 'https://example.com/image.jpg',
          alt: 'テスト画像',
        })
        root.append(imageNode)

        const info = getInspectableInfo(imageNode)

        expect(info).not.toBeNull()
        expect(info?.nodeType).toBe('image')
        expect(info?.node).toBe(imageNode)
        expect(info?.nodeKey).toBe(imageNode.getKey())
      })
    })

    test('CalloutNodeに対してcallout型の情報を返す', async () => {
      await editor.update(() => {
        const root = $getRoot()
        root.clear()
        const calloutNode = $createCalloutNode('info')
        root.append(calloutNode)

        const info = getInspectableInfo(calloutNode)

        expect(info).not.toBeNull()
        expect(info?.nodeType).toBe('callout')
        expect(info?.node).toBe(calloutNode)
        expect(info?.nodeKey).toBe(calloutNode.getKey())
      })
    })

    test('BookmarkNodeに対してbookmark型の情報を返す', async () => {
      await editor.update(() => {
        const root = $getRoot()
        root.clear()
        const bookmarkNode = $createBookmarkNode({
          url: 'https://example.com',
          title: 'テストブックマーク',
        })
        root.append(bookmarkNode)

        const info = getInspectableInfo(bookmarkNode)

        expect(info).not.toBeNull()
        expect(info?.nodeType).toBe('bookmark')
        expect(info?.node).toBe(bookmarkNode)
        expect(info?.nodeKey).toBe(bookmarkNode.getKey())
      })
    })
  })

  describe('NodeState APIによるプロパティアクセス', () => {
    let editor: LexicalEditor

    beforeEach(() => {
      editor = createTestEditor()
    })

    test('$getStateでButtonNodeのプロパティを取得できる', async () => {
      await editor.update(() => {
        const root = $getRoot()
        root.clear()
        const buttonNode = $createButtonNode({
          text: 'テスト',
          href: '#',
        })
        root.append(buttonNode)

        const info = getInspectableInfo(buttonNode)
        if (!info) {
          throw new Error('info should not be null')
        }

        expect(info.nodeType).toBe('button')
        // NodeState APIでプロパティを読み取る
        expect($getState(info.node, buttonTextState)).toBe('テスト')
        expect($getState(info.node, buttonHrefState)).toBe('#')
      })
    })
  })
})
