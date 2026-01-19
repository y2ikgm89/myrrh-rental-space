'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Switch,
  DeleteConfirmDialog,
} from '@/admin/components/ui'
import { updateSpacePublish, deleteSpace } from '@/admin/actions/space'
import type { SpaceWithStats } from '@/admin/lib/validations/space'
import { formatDateTimeShort, formatCurrency } from '@/shared/lib/utils'

type SpaceDetailProps = {
  space: SpaceWithStats
}

export function SpaceDetail({ space }: SpaceDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const handlePublishChange = async (checked: boolean) => {
    startTransition(async () => {
      const result = await updateSpacePublish(space.id, checked)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteSpace(space.id)
      if (result.success) {
        router.push('/admin/spaces')
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* 公開状態 */}
      <Card>
        <CardHeader>
          <CardTitle>公開状態</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Switch
              checked={space.isPublished}
              onCheckedChange={handlePublishChange}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">
                {space.isPublished ? '公開中' : '非公開'}
              </p>
              <p className="text-sm text-muted-foreground">
                {space.isPublished
                  ? 'このスペースは公開ページに表示されています'
                  : 'このスペースは公開ページに表示されていません'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">スペース名</div>
              <div className="font-medium">{space.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">予約数</div>
              <div className="font-medium">
                <Badge variant="secondary">{space._count.reservations}件</Badge>
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-sm text-muted-foreground">説明</div>
              <div className="whitespace-pre-wrap">{space.description}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">住所</div>
              <div className="font-medium">{space.address}</div>
            </div>
            {space.access && (
              <div>
                <div className="text-sm text-muted-foreground">アクセス</div>
                <div className="font-medium">{space.access}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">定員</div>
              <div className="font-medium">{space.capacity}名</div>
            </div>
            {space.area && (
              <div>
                <div className="text-sm text-muted-foreground">面積</div>
                <div className="font-medium">{space.area}m²</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 料金 */}
      <Card>
        <CardHeader>
          <CardTitle>料金</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">時間料金</div>
              <div className="text-xl font-bold">
                {formatCurrency(space.hourlyPrice)}
                <span className="text-sm font-normal text-muted-foreground">
                  /時間
                </span>
              </div>
            </div>
            {space.dailyPrice && (
              <div>
                <div className="text-sm text-muted-foreground">日額料金</div>
                <div className="text-xl font-bold">
                  {formatCurrency(space.dailyPrice)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /日
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 画像 */}
      <Card>
        <CardHeader>
          <CardTitle>画像</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">メイン画像</div>
              <div className="relative h-64 w-full">
                <Image
                  src={space.mainImageUrl}
                  alt={space.name}
                  fill
                  className="rounded-lg object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
            {space.imageUrls.length > 0 && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  追加画像（{space.imageUrls.length}枚）
                </div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  {space.imageUrls.map((url: string, index: number) => (
                    <div key={index} className="relative aspect-square">
                      <Image
                        src={url}
                        alt={`${space.name} ${index + 1}`}
                        fill
                        className="rounded-lg object-cover"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 設備 */}
      {space.facilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>設備・アメニティ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {space.facilities.map((facility: string, index: number) => (
                <Badge key={index} variant="secondary">
                  {facility}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* メタ情報 */}
      <Card>
        <CardHeader>
          <CardTitle>メタ情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">作成日時</div>
              <div className="font-medium">
                {formatDateTimeShort(space.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">更新日時</div>
              <div className="font-medium">
                {formatDateTimeShort(space.updatedAt)}
              </div>
            </div>
            {space.publishedAt && (
              <div>
                <div className="text-sm text-muted-foreground">公開日時</div>
                <div className="font-medium">
                  {formatDateTimeShort(space.publishedAt)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 危険な操作 */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">危険な操作</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            スペースを削除
          </Button>
          <DeleteConfirmDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            itemName={space.name}
            description="この操作により、スペースは非アクティブ状態になります。有効な予約がある場合は削除できません。"
            onConfirm={handleDelete}
            isPending={isPending}
          />
        </CardContent>
      </Card>
    </div>
  )
}
