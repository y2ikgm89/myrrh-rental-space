/**
 * Card Component
 *
 * エディタ内でカードを表示・編集するコンポーネント
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { LayoutGrid, Settings, Trash2, ExternalLink, ImageIcon } from 'lucide-react'
import { $isCardNode } from './CardNode'

const styles = tv({
  slots: {
    wrapper: [
      'relative rounded-lg border-2 overflow-hidden transition-colors',
      'bg-background max-w-sm',
    ],
    imageContainer: 'relative aspect-video bg-muted',
    image: 'w-full h-full object-cover',
    imagePlaceholder: [
      'w-full h-full flex flex-col items-center justify-center gap-2',
      'text-muted-foreground',
    ],
    content: 'p-4 space-y-2',
    titleInput: [
      'w-full text-lg font-semibold bg-transparent border-none outline-none',
      'placeholder:text-muted-foreground',
    ],
    descriptionTextarea: [
      'w-full text-sm text-muted-foreground bg-transparent border-none outline-none resize-none',
      'placeholder:text-muted-foreground/50',
    ],
    linkRow: 'flex items-center gap-2 text-sm text-primary',
    linkIcon: 'w-4 h-4',
    actions: 'absolute top-2 right-2 flex items-center gap-1',
    actionButton: [
      'p-1.5 rounded-md bg-white/90 backdrop-blur transition-colors',
      'hover:bg-white text-muted-foreground hover:text-foreground',
      'shadow-sm',
    ],
    dialog: [
      'absolute top-full left-0 mt-2 p-4 bg-popover border rounded-lg shadow-lg z-50',
      'w-full max-w-sm space-y-3',
    ],
    field: 'space-y-1',
    label: 'text-xs font-medium text-muted-foreground',
    input: 'w-full px-2 py-1.5 border rounded text-sm bg-background',
    textarea: 'w-full px-2 py-1.5 border rounded text-sm bg-background min-h-[60px] resize-none',
    dialogActions: 'flex justify-end gap-2 pt-2 border-t',
    button: 'px-3 py-1 text-xs rounded transition-colors',
    buttonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    buttonSecondary: 'border hover:bg-muted',
  },
  variants: {
    selected: {
      true: {
        wrapper: 'border-primary ring-2 ring-primary/20',
      },
      false: {
        wrapper: 'border-border hover:border-primary/50',
      },
    },
  },
})()

type CardComponentProps = {
  nodeKey: string
  title: string
  description: string
  imageUrl?: string
  imageAlt?: string
  linkUrl?: string
  linkText?: string
}

export function CardComponent({
  nodeKey,
  title,
  description,
  imageUrl,
  imageAlt,
  linkUrl,
  linkText,
}: CardComponentProps) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)
  const [showSettings, setShowSettings] = useState(false)

  // Local state for inline editing - initialized from props
  const [localTitle, setLocalTitle] = useState(title)
  const [localDescription, setLocalDescription] = useState(description)

  // Local state for settings dialog
  const [settingsImageUrl, setSettingsImageUrl] = useState(imageUrl || '')
  const [settingsImageAlt, setSettingsImageAlt] = useState(imageAlt || '')
  const [settingsLinkUrl, setSettingsLinkUrl] = useState(linkUrl || '')
  const [settingsLinkText, setSettingsLinkText] = useState(linkText || '')

  // Reset settings state when dialog opens
  const handleOpenSettings = () => {
    setSettingsImageUrl(imageUrl || '')
    setSettingsImageAlt(imageAlt || '')
    setSettingsLinkUrl(linkUrl || '')
    setSettingsLinkText(linkText || '')
    setShowSettings(true)
  }

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isCardNode(node)) {
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
          const cardWrapper = target.closest('.card-wrapper')
          if (cardWrapper) {
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setLocalTitle(newTitle)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCardNode(node)) {
        node.setTitle(newTitle)
      }
    })
  }

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDescription = e.target.value
    setLocalDescription(newDescription)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCardNode(node)) {
        node.setDescription(newDescription)
      }
    })
  }

  const handleSaveSettings = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCardNode(node)) {
        node.setImageUrl(settingsImageUrl || undefined)
        node.setImageAlt(settingsImageAlt || undefined)
        node.setLinkUrl(settingsLinkUrl || undefined)
        node.setLinkText(settingsLinkText || undefined)
      }
    })
    setShowSettings(false)
  }

  const handleRemove = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isCardNode(node)) {
        node.remove()
      }
    })
  }

  // Close settings when clicking outside
  useEffect(() => {
    if (!showSettings) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.card-settings')) {
        setShowSettings(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSettings])

  return (
    <div className={styles.wrapper({ selected: isSelected })}>
      <div className={styles.imageContainer()}>
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- Editor handles external URLs */
          <img
            src={imageUrl}
            alt={imageAlt || ''}
            className={styles.image()}
            loading="lazy"
          />
        ) : (
          <div className={styles.imagePlaceholder()}>
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">画像なし</span>
          </div>
        )}
        <div className={styles.actions()}>
          <button
            type="button"
            className={`card-settings ${styles.actionButton()}`}
            onClick={(e) => {
              e.stopPropagation()
              if (showSettings) {
                setShowSettings(false)
              } else {
                handleOpenSettings()
              }
            }}
            aria-label="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={styles.actionButton()}
            onClick={handleRemove}
            aria-label="削除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={styles.content()}>
        <input
          type="text"
          className={styles.titleInput()}
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="タイトル"
        />
        <textarea
          className={styles.descriptionTextarea()}
          value={localDescription}
          onChange={handleDescriptionChange}
          placeholder="説明文を入力..."
          rows={2}
        />
        {linkUrl && (
          <div className={styles.linkRow()}>
            <ExternalLink className={styles.linkIcon()} />
            <span>{linkText || '詳細を見る'}</span>
          </div>
        )}
      </div>

      {showSettings && (
        <div className={`card-settings ${styles.dialog()}`}>
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <span>カード設定</span>
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>画像URL</label>
            <input
              type="url"
              className={styles.input()}
              value={settingsImageUrl}
              onChange={(e) => setSettingsImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>画像の代替テキスト</label>
            <input
              type="text"
              className={styles.input()}
              value={settingsImageAlt}
              onChange={(e) => setSettingsImageAlt(e.target.value)}
              placeholder="画像の説明"
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクURL</label>
            <input
              type="url"
              className={styles.input()}
              value={settingsLinkUrl}
              onChange={(e) => setSettingsLinkUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field()}>
            <label className={styles.label()}>リンクテキスト</label>
            <input
              type="text"
              className={styles.input()}
              value={settingsLinkText}
              onChange={(e) => setSettingsLinkText(e.target.value)}
              placeholder="詳細を見る"
            />
          </div>

          <div className={styles.dialogActions()}>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonSecondary()}`}
              onClick={() => setShowSettings(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={`${styles.button()} ${styles.buttonPrimary()}`}
              onClick={handleSaveSettings}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
