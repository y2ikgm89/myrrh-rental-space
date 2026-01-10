/**
 * PostListWidget カスタムNode拡張
 *
 * ブログ記事内に記事リストを埋め込むためのTiptap拡張
 * - 最新記事
 * - 人気記事
 * - 関連記事
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { PostListWidgetComponent } from './PostListWidgetComponent'

export type PostListWidgetType = 'recent' | 'popular' | 'related'

export interface PostListWidgetAttributes {
  type: PostListWidgetType
  count: number
  categoryId?: string
  title?: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    postListWidget: {
      /**
       * 記事リストウィジェットを挿入
       */
      insertPostListWidget: (attrs: Partial<PostListWidgetAttributes>) => ReturnType
    }
  }
}

export const PostListWidget = Node.create({
  name: 'postListWidget',

  group: 'block',

  atom: true, // 編集不可のアトミックノード

  draggable: true, // ドラッグ可能

  addAttributes() {
    return {
      type: {
        default: 'recent',
        parseHTML: (element) => element.getAttribute('data-type') || 'recent',
        renderHTML: (attributes) => ({
          'data-type': attributes.type,
        }),
      },
      count: {
        default: 5,
        parseHTML: (element) => parseInt(element.getAttribute('data-count') || '5', 10),
        renderHTML: (attributes) => ({
          'data-count': attributes.count,
        }),
      },
      categoryId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-category-id'),
        renderHTML: (attributes) => {
          if (!attributes.categoryId) return {}
          return { 'data-category-id': attributes.categoryId }
        },
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
        renderHTML: (attributes) => {
          if (!attributes.title) return {}
          return { 'data-title': attributes.title }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-post-list-widget]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-post-list-widget': '' }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(PostListWidgetComponent)
  },

  addCommands() {
    return {
      insertPostListWidget:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              type: attrs.type || 'recent',
              count: attrs.count || 5,
              categoryId: attrs.categoryId,
              title: attrs.title,
            },
          })
        },
    }
  },
})
