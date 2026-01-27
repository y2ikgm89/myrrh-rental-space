'use client'

/**
 * 画像ギャラリーコンポーネント
 *
 * @description メイン画像とサブ画像を表示するギャラリー
 * - デスクトップ: 画像数に応じてレイアウトを変更
 *   - 2枚: 50% 50%
 *   - 3枚: 33% 33% 33%
 *   - 4枚以上: 左50%メイン + 右50%グリッド
 * - モバイル: 縦並びレイアウト
 */

import { useState } from 'react'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/utils'
import type { ReactElement } from 'react'

/** グリッドに表示する最大追加画像数（メイン含め最大5枚表示） */
const MAX_GRID_IMAGES = 4

const styles = tv({
  slots: {
    // 縦並びレイアウト用
    verticalContainer: 'space-y-4',
    mainImageWrapper: 'relative aspect-[16/9] overflow-hidden rounded-lg',
    mainImage: 'object-cover',
    thumbnailGrid: 'grid grid-cols-4 sm:grid-cols-6 gap-2',
    thumbnailWrapper:
      'relative aspect-square overflow-hidden rounded-md cursor-pointer transition-all',
    thumbnailWrapperActive: 'ring-2 ring-primary ring-offset-2',
    thumbnail: 'object-cover hover:opacity-80 transition-opacity',
    // 横並びレイアウト用（2-3枚）
    imageWrapper:
      'relative aspect-[4/3] overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition-opacity',
    // 4枚以上レイアウト用
    splitContainer: 'grid gap-4 md:grid-cols-2',
    mainImageLarge: 'relative aspect-[4/3] overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition-opacity',
    subImageGrid: 'grid grid-cols-2 gap-2',
    subImageWrapper:
      'relative aspect-[4/3] overflow-hidden rounded-md cursor-pointer hover:opacity-80 transition-opacity',
    moreOverlay:
      'absolute inset-0 bg-black/60 flex items-center justify-center text-white font-semibold text-lg rounded-lg',
    // モーダル
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

  // 追加画像がある場合に横並びレイアウトを使用（デスクトップのみ）
  const useHorizontalLayout = imageUrls.length > 0

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

  const openModalAt = (index: number): void => {
    setSelectedIndex(index)
    setIsModalOpen(true)
  }

  // 横並びレイアウト（デスクトップ・追加画像あり）
  if (useHorizontalLayout) {
    const totalImages = allImages.length

    return (
      <>
        {/* モバイル: 縦並び */}
        <div className="md:hidden">
          <VerticalLayout
            allImages={allImages}
            selectedIndex={selectedIndex}
            spaceName={spaceName}
            onSelectIndex={setSelectedIndex}
            onOpenModal={() => setIsModalOpen(true)}
          />
        </div>

        {/* デスクトップ */}
        <div className="hidden md:block">
          {totalImages <= 3 ? (
            // 2-3枚: 等幅横並び
            <EqualWidthLayout
              allImages={allImages}
              spaceName={spaceName}
              onOpenModal={openModalAt}
            />
          ) : (
            // 4枚以上: 左50%メイン + 右50%グリッド
            <SplitLayout
              allImages={allImages}
              spaceName={spaceName}
              onOpenModal={openModalAt}
            />
          )}
        </div>

        {/* モーダル */}
        <Modal
          isOpen={isModalOpen}
          allImages={allImages}
          selectedIndex={selectedIndex}
          selectedImage={selectedImage}
          spaceName={spaceName}
          onClose={() => setIsModalOpen(false)}
          onPrev={handlePrev}
          onNext={handleNext}
          onKeyDown={handleKeyDown}
        />
      </>
    )
  }

  // 縦並びレイアウト（モバイル or 追加画像なし）
  return (
    <>
      <VerticalLayout
        allImages={allImages}
        selectedIndex={selectedIndex}
        spaceName={spaceName}
        onSelectIndex={setSelectedIndex}
        onOpenModal={() => setIsModalOpen(true)}
      />

      {/* モーダル */}
      <Modal
        isOpen={isModalOpen}
        allImages={allImages}
        selectedIndex={selectedIndex}
        selectedImage={selectedImage}
        spaceName={spaceName}
        onClose={() => setIsModalOpen(false)}
        onPrev={handlePrev}
        onNext={handleNext}
        onKeyDown={handleKeyDown}
      />
    </>
  )
}

// 等幅横並びレイアウト（2-3枚用）
interface EqualWidthLayoutProps {
  allImages: string[]
  spaceName: string
  onOpenModal: (index: number) => void
}

function EqualWidthLayout({
  allImages,
  spaceName,
  onOpenModal,
}: EqualWidthLayoutProps): ReactElement {
  const count = allImages.length
  const gridCols = count === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={cn('grid gap-4', gridCols)}>
      {allImages.map((url, index) => (
        <button
          key={index}
          type="button"
          className={styles.imageWrapper()}
          onClick={() => onOpenModal(index)}
          aria-label={index === 0 ? 'メイン画像を拡大表示' : `画像${index + 1}を拡大表示`}
        >
          <Image
            src={url}
            alt={index === 0 ? `${spaceName} - メイン画像` : `${spaceName} - 画像${index + 1}`}
            fill
            sizes={`(max-width: 1280px) ${Math.floor(100 / count)}vw, ${Math.floor(1280 / count)}px`}
            className={styles.mainImage()}
            priority={index === 0}
            loading={index === 0 ? undefined : 'lazy'}
          />
        </button>
      ))}
    </div>
  )
}

// 左右分割レイアウト（4枚以上用）
interface SplitLayoutProps {
  allImages: string[]
  spaceName: string
  onOpenModal: (index: number) => void
}

function SplitLayout({
  allImages,
  spaceName,
  onOpenModal,
}: SplitLayoutProps): ReactElement {
  const mainImage = allImages[0]
  const subImages = allImages.slice(1, MAX_GRID_IMAGES + 1)
  const remainingCount = allImages.length - MAX_GRID_IMAGES - 1

  return (
    <div className={styles.splitContainer()}>
      {/* 左: メイン画像 */}
      <button
        type="button"
        className={styles.mainImageLarge()}
        onClick={() => onOpenModal(0)}
        aria-label="メイン画像を拡大表示"
      >
        <Image
          src={mainImage}
          alt={`${spaceName} - メイン画像`}
          fill
          sizes="(max-width: 1280px) 50vw, 640px"
          className={styles.mainImage()}
          priority
        />
      </button>

      {/* 右: 追加画像グリッド */}
      <div className={styles.subImageGrid()}>
        {subImages.map((url, index) => {
          const isLast = index === subImages.length - 1 && remainingCount > 0
          const imageIndex = index + 1

          return (
            <button
              key={index}
              type="button"
              className={styles.subImageWrapper()}
              onClick={() => onOpenModal(imageIndex)}
              aria-label={`画像${imageIndex + 1}を拡大表示`}
            >
              <Image
                src={url}
                alt={`${spaceName} - 画像${imageIndex + 1}`}
                fill
                sizes="(max-width: 1280px) 25vw, 320px"
                className={styles.thumbnail()}
                loading="lazy"
              />
              {isLast && (
                <div className={styles.moreOverlay()}>
                  +{remainingCount}枚
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 縦並びレイアウトコンポーネント
interface VerticalLayoutProps {
  allImages: string[]
  selectedIndex: number
  spaceName: string
  onSelectIndex: (index: number) => void
  onOpenModal: () => void
}

function VerticalLayout({
  allImages,
  selectedIndex,
  spaceName,
  onSelectIndex,
  onOpenModal,
}: VerticalLayoutProps): ReactElement {
  const selectedImage = allImages[selectedIndex]

  return (
    <div className={styles.verticalContainer()}>
      {/* メイン画像 */}
      <button
        type="button"
        className={styles.mainImageWrapper()}
        onClick={onOpenModal}
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
              onClick={() => onSelectIndex(index)}
              aria-label={`画像${index + 1}を表示`}
              aria-current={index === selectedIndex ? 'true' : undefined}
            >
              <Image
                src={url}
                alt={`${spaceName} - サムネイル${index + 1}`}
                fill
                sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 100px"
                className={styles.thumbnail()}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// モーダルコンポーネント
interface ModalProps {
  isOpen: boolean
  allImages: string[]
  selectedIndex: number
  selectedImage: string
  spaceName: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

function Modal({
  isOpen,
  allImages,
  selectedIndex,
  selectedImage,
  spaceName,
  onClose,
  onPrev,
  onNext,
  onKeyDown,
}: ModalProps): ReactElement | null {
  if (!isOpen) return null

  return (
    <div
      className={styles.modal()}
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="画像ビューア"
      tabIndex={0}
    >
      {/* 閉じるボタン */}
      <button
        type="button"
        className={styles.closeButton()}
        onClick={onClose}
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
            onPrev()
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
            onNext()
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
  )
}
