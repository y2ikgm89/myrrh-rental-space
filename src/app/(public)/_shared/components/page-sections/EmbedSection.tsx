/**
 * 埋め込みセクション
 *
 * Note: embedCodeはサーバーサイドでサニタイズ済みの管理者入力のみを想定
 * ユーザー入力を直接受け付けないため、XSSリスクは最小限
 *
 * 共通スタイルを使用してデザイン変更に対応
 */

import type { ReactElement } from 'react'
import { Code } from 'lucide-react'
import type { EmbedConfig } from '@/shared/lib/validations/page-section'
import {
  sectionVariants,
  sectionTitleVariants,
} from '@/public/lib/styles/section-variants'

interface EmbedSectionProps {
  title?: string | null
  config: EmbedConfig
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  full: 'max-w-full',
} as const

const aspectRatioClasses = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  'auto': '',
} as const

export function EmbedSection({
  title,
  config,
}: EmbedSectionProps): ReactElement {
  const { embedUrl, aspectRatio, maxWidth } = config

  const maxWidthClass = maxWidthClasses[maxWidth]
  const aspectRatioClass = aspectRatioClasses[aspectRatio]

  // embedCodeは現時点では無効化（将来的にサニタイザーを導入後に有効化）
  // embedCodeを使用する場合はDOMPurify等でサニタイズする必要がある
  const hasContent = !!embedUrl

  return (
    <section className={sectionVariants()}>
      <div className="container">
        {title && (
          <h2 className={sectionTitleVariants()}>{title}</h2>
        )}

        <div className={`${maxWidthClass} mx-auto`}>
          {embedUrl && (
            <div className={`w-full overflow-hidden rounded-lg ${aspectRatioClass}`}>
              <iframe
                src={embedUrl}
                width="100%"
                height={aspectRatio === 'auto' ? '500' : '100%'}
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                title={title || '埋め込みコンテンツ'}
              />
            </div>
          )}

          {!hasContent && (
            <div className="w-full overflow-hidden rounded-lg bg-muted aspect-video flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-2" />
                <p>埋め込みURLを設定してください</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
