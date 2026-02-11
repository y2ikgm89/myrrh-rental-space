/**
 * Bookmark Node
 *
 * @description ブックマーク/リンクカードを表示するDecoratorNode
 * OGP情報（タイトル、説明、画像、favicon）を表示
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import { ExternalLink } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

export interface SerializedBookmarkNode extends SerializedLexicalNode {
  url: string
  title: string
  description: string
  imageUrl: string
  faviconUrl: string
  siteName: string
}

// =============================================================================
// Component
// =============================================================================

function BookmarkComponent({
  url,
  title,
  description,
  imageUrl,
  faviconUrl,
  siteName,
  nodeKey,
}: {
  url: string
  title: string
  description: string
  imageUrl: string
  faviconUrl: string
  siteName: string
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      data-bookmark
      className="my-4"
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors"
        draggable={false}
        onClick={(e) => e.preventDefault()} // エディタ内ではナビゲーション無効
      >
        <div className="flex">
          {/* テキスト部分 */}
          <div className="flex-1 p-4 min-w-0">
            {/* サイト情報 */}
            <div className="flex items-center gap-2 mb-2">
              {faviconUrl ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-4 h-4 rounded-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground truncate">
                {siteName || new URL(url).hostname}
              </span>
            </div>
            {/* タイトル */}
            <h4 className="font-medium text-sm line-clamp-2 mb-1">
              {title || url}
            </h4>
            {/* 説明 */}
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {description}
              </p>
            )}
          </div>
          {/* 画像部分 */}
          {imageUrl && (
            <div className="w-32 h-24 flex-shrink-0">
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.parentElement?.remove()
                }}
              />
            </div>
          )}
        </div>
      </a>
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertBookmarkElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const link = element.querySelector('a')
  if (!link) return null

  const url = link.getAttribute('href') ?? ''
  const title = element.getAttribute('data-bookmark-title') ?? ''
  const description = element.getAttribute('data-bookmark-description') ?? ''
  const imageUrl = element.getAttribute('data-bookmark-image') ?? ''
  const faviconUrl = element.getAttribute('data-bookmark-favicon') ?? ''
  const siteName = element.getAttribute('data-bookmark-site') ?? ''

  const node = $createBookmarkNode({
    url,
    title,
    description,
    imageUrl,
    faviconUrl,
    siteName,
  })
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class BookmarkNode extends DecoratorNode<ReactElement> {
  __url: string
  __title: string
  __description: string
  __imageUrl: string
  __faviconUrl: string
  __siteName: string

  static getType(): string {
    return 'bookmark'
  }

  static clone(node: BookmarkNode): BookmarkNode {
    return new BookmarkNode(
      node.__url,
      node.__title,
      node.__description,
      node.__imageUrl,
      node.__faviconUrl,
      node.__siteName,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedBookmarkNode): BookmarkNode {
    return $createBookmarkNode({
      url: serializedNode.url,
      title: serializedNode.title,
      description: serializedNode.description,
      imageUrl: serializedNode.imageUrl,
      faviconUrl: serializedNode.faviconUrl,
      siteName: serializedNode.siteName,
    }).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-bookmark')) {
          return {
            conversion: $convertBookmarkElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(
    url: string,
    title: string = '',
    description: string = '',
    imageUrl: string = '',
    faviconUrl: string = '',
    siteName: string = '',
    key?: NodeKey
  ) {
    super(key)
    this.__url = url
    this.__title = title
    this.__description = description
    this.__imageUrl = imageUrl
    this.__faviconUrl = faviconUrl
    this.__siteName = siteName
  }

  exportJSON(): SerializedBookmarkNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      title: this.__title,
      description: this.__description,
      imageUrl: this.__imageUrl,
      faviconUrl: this.__faviconUrl,
      siteName: this.__siteName,
    }
  }

  exportDOM(): DOMExportOutput {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-bookmark', 'true')
    wrapper.setAttribute('data-bookmark-title', this.__title)
    wrapper.setAttribute('data-bookmark-description', this.__description)
    wrapper.setAttribute('data-bookmark-image', this.__imageUrl)
    wrapper.setAttribute('data-bookmark-favicon', this.__faviconUrl)
    wrapper.setAttribute('data-bookmark-site', this.__siteName)
    wrapper.className = 'my-4'

    const link = document.createElement('a')
    link.href = this.__url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.className = 'block border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors'

    const content = document.createElement('div')
    content.className = 'flex'

    // テキスト部分
    const textDiv = document.createElement('div')
    textDiv.className = 'flex-1 p-4 min-w-0'

    // サイト情報
    const siteInfo = document.createElement('div')
    siteInfo.className = 'flex items-center gap-2 mb-2'

    if (this.__faviconUrl) {
      const favicon = document.createElement('img')
      favicon.src = this.__faviconUrl
      favicon.alt = ''
      favicon.className = 'w-4 h-4 rounded-sm'
      siteInfo.appendChild(favicon)
    }

    const siteName = document.createElement('span')
    siteName.className = 'text-xs text-muted-foreground truncate'
    siteName.textContent = this.__siteName || new URL(this.__url).hostname
    siteInfo.appendChild(siteName)
    textDiv.appendChild(siteInfo)

    // タイトル
    const title = document.createElement('h4')
    title.className = 'font-medium text-sm line-clamp-2 mb-1'
    title.textContent = this.__title || this.__url
    textDiv.appendChild(title)

    // 説明
    if (this.__description) {
      const description = document.createElement('p')
      description.className = 'text-xs text-muted-foreground line-clamp-2'
      description.textContent = this.__description
      textDiv.appendChild(description)
    }

    content.appendChild(textDiv)

    // 画像部分
    if (this.__imageUrl) {
      const imageDiv = document.createElement('div')
      imageDiv.className = 'w-32 h-24 flex-shrink-0'
      const image = document.createElement('img')
      image.src = this.__imageUrl
      image.alt = ''
      image.className = 'w-full h-full object-cover'
      imageDiv.appendChild(image)
      content.appendChild(imageDiv)
    }

    link.appendChild(content)
    wrapper.appendChild(link)

    return { element: wrapper }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.bookmark
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return (
      <BookmarkComponent
        url={this.__url}
        title={this.__title}
        description={this.__description}
        imageUrl={this.__imageUrl}
        faviconUrl={this.__faviconUrl}
        siteName={this.__siteName}
        nodeKey={this.__key}
      />
    )
  }

  // Getters
  getUrl(): string {
    return this.getLatest().__url
  }

  getTitle(): string {
    return this.getLatest().__title
  }

  getDescription(): string {
    return this.getLatest().__description
  }

  getImageUrl(): string {
    return this.getLatest().__imageUrl
  }

  getFaviconUrl(): string {
    return this.getLatest().__faviconUrl
  }

  getSiteName(): string {
    return this.getLatest().__siteName
  }

  // Setters
  setTitle(title: string): void {
    const self = this.getWritable()
    self.__title = title
  }

  setDescription(description: string): void {
    const self = this.getWritable()
    self.__description = description
  }

  setImageUrl(imageUrl: string): void {
    const self = this.getWritable()
    self.__imageUrl = imageUrl
  }

  setFaviconUrl(faviconUrl: string): void {
    const self = this.getWritable()
    self.__faviconUrl = faviconUrl
  }

  setSiteName(siteName: string): void {
    const self = this.getWritable()
    self.__siteName = siteName
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * ブックマークノードを作成する
 *
 * @param params - ブックマークのパラメータ
 * @returns BookmarkNode インスタンス
 */
export function $createBookmarkNode({
  url,
  title = '',
  description = '',
  imageUrl = '',
  faviconUrl = '',
  siteName = '',
}: {
  url: string
  title?: string
  description?: string
  imageUrl?: string
  faviconUrl?: string
  siteName?: string
}): BookmarkNode {
  return $applyNodeReplacement(
    new BookmarkNode(url, title, description, imageUrl, faviconUrl, siteName)
  )
}

/**
 * ノードがBookmarkNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns BookmarkNodeの場合true
 */
export function $isBookmarkNode(
  node: LexicalNode | null | undefined
): node is BookmarkNode {
  return node instanceof BookmarkNode
}
