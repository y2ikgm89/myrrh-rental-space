/**
 * TestimonialNode Tests
 *
 * @description TestimonialContainerNode / TestimonialItemNode のユニットテスト
 */

import { describe, test, expect } from 'bun:test'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, $createParagraphNode } from 'lexical'
import {
  TestimonialContainerNode,
  TestimonialItemNode,
  $createTestimonialContainerNode,
  $createTestimonialItemNode,
  $isTestimonialContainerNode,
  $isTestimonialItemNode,
} from '../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TestimonialNode'

function createEditor() {
  return createHeadlessEditor({
    namespace: 'test',
    nodes: [TestimonialContainerNode, TestimonialItemNode],
    onError: (error) => {
      throw error
    },
  })
}

describe('TestimonialContainerNode', () => {
  test('JSON round-trip preserves container states', async () => {
    const editor = createEditor()
    await editor.update(() => {
      const node = $createTestimonialContainerNode({
        layout: 'list',
        columns: 3,
        accentColor: 'blue',
      })
      $getRoot().append(node)
    })
    const json = editor.getEditorState().toJSON()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = (json.root.children[0] as any)
    expect(nodeJson.type).toBe('testimonial-container')
    expect(nodeJson.layout).toBe('list')
    expect(nodeJson.columns).toBe(3)
    expect(nodeJson.accentColor).toBe('blue')
  })

  test('$isTestimonialContainerNode returns true for TestimonialContainerNode', async () => {
    const editor = createEditor()
    let result = false
    await editor.update(() => {
      const node = $createTestimonialContainerNode()
      result = $isTestimonialContainerNode(node)
    })
    expect(result).toBe(true)
  })

  test('isShadowRoot returns true', async () => {
    const editor = createEditor()
    let result = false
    await editor.update(() => {
      const node = $createTestimonialContainerNode()
      result = node.isShadowRoot()
    })
    expect(result).toBe(true)
  })
})

describe('TestimonialItemNode', () => {
  test('JSON round-trip preserves item states', async () => {
    const editor = createEditor()
    await editor.update(() => {
      const container = $createTestimonialContainerNode()
      const item = $createTestimonialItemNode({
        authorName: '山田太郎',
        authorTitle: 'CEO',
        avatarUrl: 'https://example.com/avatar.jpg',
        rating: 4,
        date: '2024-01-01',
      })
      const para = $createParagraphNode()
      item.append(para)
      container.append(item)
      $getRoot().append(container)
    })
    const json = editor.getEditorState().toJSON()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemJson = (json.root.children[0] as any).children[0]
    expect(itemJson.type).toBe('testimonial-item')
    expect(itemJson.authorName).toBe('山田太郎')
    expect(itemJson.authorTitle).toBe('CEO')
    expect(itemJson.avatarUrl).toBe('https://example.com/avatar.jpg')
    expect(itemJson.rating).toBe(4)
    expect(itemJson.date).toBe('2024-01-01')
  })

  test('$isTestimonialItemNode returns true for TestimonialItemNode', async () => {
    const editor = createEditor()
    let result = false
    await editor.update(() => {
      const node = $createTestimonialItemNode()
      result = $isTestimonialItemNode(node)
    })
    expect(result).toBe(true)
  })

  test('isShadowRoot returns true', async () => {
    const editor = createEditor()
    let result = false
    await editor.update(() => {
      const node = $createTestimonialItemNode()
      result = node.isShadowRoot()
    })
    expect(result).toBe(true)
  })
})
