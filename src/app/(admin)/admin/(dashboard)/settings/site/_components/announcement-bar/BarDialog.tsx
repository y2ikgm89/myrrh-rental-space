'use client'

import { useWatch } from 'react-hook-form'
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/admin/components/ui'
import type { BarDialogProps, DeleteDialogProps } from './types'

export function BarDialog({
  isOpen,
  onOpenChange,
  editingBar,
  isPending,
  register,
  setValue,
  control,
  errors,
  onSubmit,
}: Omit<BarDialogProps, 'formValues'>) {
  const formValues = useWatch({ control })

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingBar ? 'お知らせバーを編集' : 'お知らせバーを作成'}
          </DialogTitle>
          <DialogDescription>
            サイト上部に表示するお知らせバーの内容を設定します
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="message">メッセージ *</Label>
              <Input
                id="message"
                {...register('message')}
                placeholder="お知らせのメッセージを入力"
                disabled={isPending}
              />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">タイプ</Label>
              <Select
                value={formValues.type}
                onValueChange={(value) => setValue('type', value as 'info' | 'warning' | 'promo')}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">お知らせ（青）</SelectItem>
                  <SelectItem value="warning">重要（黄）</SelectItem>
                  <SelectItem value="promo">キャンペーン（緑）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ※ 色は「デザイン・カルーセル設定」で統一設定できます
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">優先度</Label>
              <Input
                id="priority"
                type="number"
                {...register('priority', { valueAsNumber: true })}
                min={0}
                max={100}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                数字が大きいほど優先的に表示
              </p>
            </div>
          </div>

          {/* Link */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="linkUrl">リンクURL</Label>
              <Input
                id="linkUrl"
                {...register('linkUrl')}
                placeholder="https://example.com"
                disabled={isPending}
              />
              {errors.linkUrl && (
                <p className="text-sm text-destructive">{errors.linkUrl.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkText">リンクテキスト</Label>
              <Input
                id="linkText"
                {...register('linkText')}
                placeholder="詳しくはこちら"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startAt">表示開始日時</Label>
              <Input
                id="startAt"
                type="datetime-local"
                {...register('startAt')}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endAt">表示終了日時</Label>
              <Input
                id="endAt"
                type="datetime-local"
                {...register('endAt')}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Active */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-base">有効にする</Label>
              <p className="text-sm text-muted-foreground">
                オフにするとサイトに表示されません
              </p>
            </div>
            <Switch
              id="isActive"
              checked={formValues.isActive}
              onCheckedChange={(checked) => setValue('isActive', checked)}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? '保存中...' : editingBar ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDialog({
  isOpen,
  onOpenChange,
  isPending,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>お知らせバーを削除しますか？</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。本当に削除してもよろしいですか？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? '削除中...' : '削除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
