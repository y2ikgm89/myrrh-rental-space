/**
 * Custom Markdown Transformers for Lexical Editor
 *
 * @see https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/MarkdownTransformers/index.ts
 */

import {
  TRANSFORMERS,
  type ElementTransformer,
  type TextMatchTransformer,
} from '@lexical/markdown'
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from '@lexical/react/LexicalHorizontalRuleNode'

import { $createImageNode, $isImageNode, ImageNode } from './nodes/ImageNode'
import { $createYouTubeNode, $isYouTubeNode, YouTubeNode } from './nodes/YouTubeNode'

// =============================================================================
// Validation Helpers
// =============================================================================

// YouTube Video ID: 11文字、英数字と_-のみ
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

function isValidYouTubeId(id: string): boolean {
  return YOUTUBE_ID_REGEX.test(id)
}

// 危険なURLスキームをブロック
function isValidImageUrl(url: string): boolean {
  if (!url || url.trim() === '') return false
  const lower = url.toLowerCase().trim()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return false
  return true
}

// =============================================================================
// Transformers
// =============================================================================

// ![alt](url) -> ImageNode
const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => ($isImageNode(node) ? `![${node.__alt || ''}](${node.__src})` : null),
  importRegExp: /!(?:\[([^\[\]]*)\])(?:\(([^()]+)\))/,
  regExp: /!(?:\[([^\[\]]*)\])(?:\(([^()]+)\))$/,
  replace: (textNode, match) => {
    const alt = match[1]
    const src = match[2]
    if (!src || !isValidImageUrl(src)) return
    textNode.replace($createImageNode({ src: src.trim(), alt: alt ?? '' }))
  },
  trigger: ')',
  type: 'text-match',
}

// @[youtube](videoId) -> YouTubeNode
const YOUTUBE: TextMatchTransformer = {
  dependencies: [YouTubeNode],
  export: (node) => ($isYouTubeNode(node) ? `@[youtube](${node.__videoId})` : null),
  importRegExp: /@\[youtube\]\(([A-Za-z0-9_-]{11})\)/,
  regExp: /@\[youtube\]\(([A-Za-z0-9_-]{11})\)$/,
  replace: (textNode, match) => {
    const videoId = match[1]
    if (!videoId || !isValidYouTubeId(videoId)) return
    textNode.replace($createYouTubeNode({ videoId }))
  },
  trigger: ')',
  type: 'text-match',
}

// --- or *** or ___ -> HorizontalRuleNode
const HR: ElementTransformer = {
  dependencies: [],
  export: (node) => ($isHorizontalRuleNode(node) ? '---' : null),
  regExp: /^(?:---|\*\*\*|___)$/,
  replace: (parentNode, _children, _match, isImport) => {
    const hrNode = $createHorizontalRuleNode()
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(hrNode)
    } else {
      parentNode.insertBefore(hrNode)
    }
    hrNode.selectNext()
  },
  type: 'element',
}

export const EDITOR_TRANSFORMERS = [IMAGE, YOUTUBE, HR, ...TRANSFORMERS]
