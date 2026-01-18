'use client'

/**
 * 画像ギャラリーコンポーネント
 *
 * @description メイン画像とサブ画像を表示するギャラリー
 */

import { useState } from 'react'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    container: 'space-y-4',
    mainImageWrapper: 'relative aspect-[16/9] overflow-hidden rounded-lg',
    mainImage: 'object-cover',
    thumbnailGrid: 'grid grid-cols-4 sm:grid-cols-6 gap-2',
    thumbnailWrapper:
      'relative aspect-square overflow-hidden rounded-md cursor-pointer transition-all',
    thumbnailWrapperActive: 'ring-2 ring-primary ring-offset-2',
    thumbnail: 'object-cover hover:opacity-80 transition-opacity',
    modal:
      'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4',
    modalImage: 'max-w-full max-h-[90vh] object-contain rounded-lg',
    closeButton:
      'absolute top-4 right-4 text-white hover:text-gray-300 transition-colors',
    navButton:
      'absolute top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors p-2',
    navButtonPrev: 'left-4',
    navButtonNext: 'right-4',
  },
})()

interface ImageGalleryProps {
  mainImageUrl: string
  imageUrls: string[]
  spaceName: string
}

export function ImageGallery({
  mainImageUrl,
  imageUrls,
  spaceName,
}: ImageGalleryProps): ReactElement {
  // 全ての画像を配列に統合（メイン画像を最初に）
  const allImages = [mainImageUrl, ...imageUrls]

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const selectedImage = allImages[selectedIndex]

  const handlePrev = (): void => {
    setSelectedIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1))
  }

  const handleNext = (): void => {
    setSelectedIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1))
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setIsModalOpen(false)
    } else if (e.key === 'ArrowLeft') {
      handlePrev()
    } else if (e.key === 'ArrowRight') {
      handleNext()
    }
  }

  return (
    <div className={styles.container()}>
      {/* メイン画像 */}
      <button
        type="button"
        className={styles.mainImageWrapper()}
        onClick={() => setIsModalOpen(true)}
        aria-label="画像を拡大表示"
      >
        <Image
          src={selectedImage}
          alt={`${spaceName} - 画像${selectedIndex + 1}`}
          fill
          sizes="(max-width: 1280px) 100vw, 1280px"
          className={styles.mainImage()}
          priority
        />
      </button>

      {/* サムネイル（複数画像がある場合のみ） */}
      {allImages.length > 1 && (
        <div className={styles.thumbnailGrid()}>
          {allImages.map((url, index) => (
            <button
              key={index}
              type="button"
              className={cn(
                styles.thumbnailWrapper(),
                index === selectedIndex && styles.thumbnailWrapperActive()
              )}
              onClick={() => setSelectedIndex(index)}
              aria-label={`画像${index + 1}を表示`}
              aria-current={index === selectedIndex ? 'true' : undefined}
            >
              <Image
                src={url}
                alt={`${spaceName} - サムネイル${index + 1}`}
                fill
                sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 100px"
                className={styles.thumbnail()}
              />
            </button>
          ))}
        </div>
      )}

      {/* モーダル */}
      {isModalOpen && (
        <div
          className={styles.modal()}
          onClick={() => setIsModalOpen(false)}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label="画像ビューア"
          tabIndex={0}
        >
          {/* 閉じるボタン */}
          <button
            type="button"
            className={styles.closeButton()}
            onClick={() => setIsModalOpen(false)}
            aria-label="閉じる"
          >
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* 前へボタン */}
          {allImages.length > 1 && (
            <button
              type="button"
              className={cn(styles.navButton(), styles.navButtonPrev())}
              onClick={(e) => {
                e.stopPropagation()
                handlePrev()
              }}
              aria-label="前の画像"
            >
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}

          {/* 画像 */}
          <Image
            src={selectedImage}
            alt={`${spaceName} - 画像${selectedIndex + 1}`}
            width={1920}
            height={1080}
            className={styles.modalImage()}
            onClick={(e) => e.stopPropagation()}
          />

          {/* 次へボタン */}
          {allImages.length > 1 && (
            <button
              type="button"
              className={cn(styles.navButton(), styles.navButtonNext())}
              onClick={(e) => {
                e.stopPropagation()
                handleNext()
              }}
              aria-label="次の画像"
            >
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
