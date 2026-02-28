/**
 * InlineImageNode Tests
 *
 * @description InlineImageNodeのユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, $createParagraphNode } from 'lexical'
import {
  InlineImageNode,
  $createInlineImageNode,
  $isInlineImageNode,
} from '../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InlineImageNode'

function createEditor() {
  return createHeadlessEditor({
    namespace: 'test',
    nodes: [InlineImageNode],
    onError: (error) => {
      throw error
    },
  })
}

describe('InlineImageNode', () => {
  test('JSON round-trip preserves all states', async () => {
    const editor = createEditor()
    await editor.update(() => {
      const para = $createParagraphNode()
      const node = $createInlineImageNode({
        src: 'https://example.com/img.jpg',
        altText: 'test',
        position: 'left',
        width: 300,
      })
      para.append(node)
      $getRoot().append(para)
    })
    const json = editor.getEditorState().toJSON()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = (json.root.children[0] as any).children[0]
    expect(nodeJson.type).toBe('inline-image')
    // flat: true でトップレベルにシリアライズされる
    expect(nodeJson.src).toBe('https://example.com/img.jpg')
    expect(nodeJson.position).toBe('left')
    expect(nodeJson.width).toBe(300)
  })

  test('$isInlineImageNode returns true for InlineImageNode', async () => {
    const editor = createEditor()
    let result = false
    await editor.update(() => {
      const node = $createInlineImageNode({ src: 'x', altText: '', position: 'full', width: 200 })
      result = $isInlineImageNode(node)
    })
    expect(result).toBe(true)
  })

  test('default position is full and default width is 200', async () => {
    const editor = createEditor()
    let pos = ''
    let w = 0
    await editor.update(() => {
      const node = $createInlineImageNode({ src: 'x', altText: '' })
      pos = node.getPosition()
      w = node.getWidth()
    })
    expect(pos).toBe('full')
    expect(w).toBe(200)
  })

  test('$isInlineImageNode returns false for non-InlineImageNode', async () => {
    const editor = createEditor()
    let result = true
    await editor.update(() => {
      const para = $createParagraphNode()
      result = $isInlineImageNode(para)
    })
    expect(result).toBe(false)
  })

  test('getSrc and getAltText return correct values', async () => {
    const editor = createEditor()
    let src = ''
    let altText = ''
    await editor.update(() => {
      const node = $createInlineImageNode({
        src: 'https://example.com/photo.png',
        altText: 'A photo',
        position: 'right',
        width: 150,
      })
      src = node.getSrc()
      altText = node.getAltText()
    })
    expect(src).toBe('https://example.com/photo.png')
    expect(altText).toBe('A photo')
  })
})
