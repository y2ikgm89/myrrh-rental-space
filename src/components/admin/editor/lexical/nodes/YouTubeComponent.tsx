/**
 * YouTube Component
 *
 * エディタ内でYouTube動画を表示・操作するコンポーネント
 */

'use client'

import { useCallback, useEffect } from 'react'
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
import { $isYouTubeNode } from './YouTubeNode'

const styles = tv({
  slots: {
    wrapper: 'relative my-4 aspect-video max-w-full',
    iframe: 'w-full h-full rounded-lg transition-shadow',
    overlay: [
      'absolute inset-0 cursor-pointer',
      'flex items-center justify-center',
      'bg-black/0 hover:bg-black/10 transition-colors',
    ],
  },
  variants: {
    selected: {
      true: {
        wrapper: 'ring-2 ring-primary rounded-lg',
      },
    },
  },
})()

type YouTubeComponentProps = {
  nodeKey: string
  videoId: string
  width: number
}

export function YouTubeComponent({
  nodeKey,
  videoId,
  width,
}: YouTubeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isYouTubeNode(node)) {
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
          const target = event.target as HTMLElement
          const wrapper = target.closest('.youtube-wrapper')
          if (wrapper) {
            clearSelection()
            setSelected(true)
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
  }, [clearSelection, editor, onDelete, setSelected])

  return (
    <div
      className={styles.wrapper({ selected: isSelected })}
      style={{ maxWidth: width }}
    >
      <iframe
        className={styles.iframe()}
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
      {!isSelected && (
        <div className={styles.overlay()} role="presentation" />
      )}
    </div>
  )
}
