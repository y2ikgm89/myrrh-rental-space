/**
 * Image Component
 *
 * エディタ内で画像を表示・操作するコンポーネント
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { tv } from 'tailwind-variants'
import { $isImageNode } from './ImageNode'

const styles = tv({
  slots: {
    wrapper: 'relative inline-block max-w-full my-4',
    image: 'max-w-full h-auto rounded-lg transition-shadow',
    resizer: [
      'absolute bottom-0 right-0 w-4 h-4 cursor-se-resize',
      'bg-primary rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity',
    ],
  },
  variants: {
    selected: {
      true: {
        image: 'ring-2 ring-primary shadow-lg',
      },
    },
    dragging: {
      true: {
        wrapper: 'cursor-grabbing',
      },
    },
  },
})()

type ImageComponentProps = {
  nodeKey: string
  src: string
  alt: string
  width?: number
  height?: number
}

export function ImageComponent({
  nodeKey,
  src,
  alt,
  width,
  height,
}: ImageComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const imageRef = useRef<HTMLImageElement>(null)
  const [isResizing, setIsResizing] = useState(false)

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isImageNode(node)) {
            node.remove()
          }
        })
        return true
      }
      return false
    },
    [editor, isSelected, nodeKey]
  )

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          if (imageRef.current === event.target) {
            if (event.shiftKey) {
              setSelected(!isSelected)
            } else {
              clearSelection()
              setSelected(true)
            }
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
  }, [clearSelection, editor, isSelected, onDelete, setSelected])

  const handleResize = (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = imageRef.current?.offsetWidth || 0

    setIsResizing(true)

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(100, startWidth + (e.clientX - startX))
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) {
          node.setDimensions(newWidth, undefined)
        }
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <span
      className={`${styles.wrapper({ dragging: isResizing })} group`}
      draggable={false}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Editor handles external URLs */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={styles.image({ selected: isSelected })}
        draggable={false}
      />
      {isSelected && (
        <span
          className={styles.resizer()}
          onMouseDown={handleResize}
          role="presentation"
        />
      )}
    </span>
  )
}
