'use client'

/**
 * セクション追加ダイアログ
 */

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/admin/components/ui'
import {
  PageSectionType,
  sectionTypeLabels,
  sectionTypeDescriptions,
} from '@/shared/lib/validations/page-section'
import { SectionTypeIcon } from './SectionTypeIcon'

interface AddSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (type: PageSectionType) => void
  disabled: boolean
}

export function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
}: AddSectionDialogProps) {
  const sectionTypes = Object.values(PageSectionType)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>セクションを追加</AlertDialogTitle>
          <AlertDialogDescription>
            ページに追加するセクションタイプを選択
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-2 py-4 overflow-y-auto">
          {sectionTypes.map((type) => {
            const label = sectionTypeLabels[type]
            const description = sectionTypeDescriptions[type]

            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type)
                  onOpenChange(false)
                }}
                disabled={disabled}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="p-2 rounded-md bg-primary/10 shrink-0">
                  <SectionTypeIcon type={type} className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
