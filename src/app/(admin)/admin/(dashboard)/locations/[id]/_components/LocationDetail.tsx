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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/admin/components/ui'
import { toggleLocationPublish, deleteLocation } from '@/admin/actions/location'
import type { LocationWithStats } from '@/admin/lib/validations/location'

type LocationDetailProps = {
  location: LocationWithStats
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function LocationDetail({ location }: LocationDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const handlePublishChange = async (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleLocationPublish(location.id, checked)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  const handleDelete = async () => {
    startTransition(async () => {
      const result = await deleteLocation(location.id)
      if (result.success) {
        router.push('/admin/locations')
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
              checked={location.isPublished}
              onCheckedChange={handlePublishChange}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">
                {location.isPublished ? '公開中' : '非公開'}
              </p>
              <p className="text-sm text-muted-foreground">
                {location.isPublished
                  ? 'この場所は公開ページに表示されています'
                  : 'この場所は公開ページに表示されていません'}
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
              <div className="text-sm text-muted-foreground">場所名</div>
              <div className="font-medium">{location.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">スペース数</div>
              <div className="font-medium">
                <Badge variant="secondary">{location._count.spaces}件</Badge>
              </div>
            </div>
            {location.description && (
              <div className="sm:col-span-2">
                <div className="text-sm text-muted-foreground">説明</div>
                <div className="whitespace-pre-wrap">{location.description}</div>
              </div>
            )}
            <div className="sm:col-span-2">
              <div className="text-sm text-muted-foreground">住所</div>
              <div className="font-medium">{location.address}</div>
            </div>
            {location.access && (
              <div className="sm:col-span-2">
                <div className="text-sm text-muted-foreground">アクセス</div>
                <div className="whitespace-pre-wrap">{location.access}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">並び順</div>
              <div className="font-medium">{location.sortOrder}</div>
            </div>
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
              <div className="text-sm text-muted-foreground mb-2">建物画像</div>
              <div className="relative h-64 w-full">
                <Image
                  src={location.imageUrl}
                  alt={location.name}
                  fill
                  className="rounded-lg object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
            {location.imageUrls.length > 0 && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  追加画像（{location.imageUrls.length}枚）
                </div>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  {location.imageUrls.map((url: string, index: number) => (
                    <div key={index} className="relative aspect-square">
                      <Image
                        src={url}
                        alt={`${location.name} ${index + 1}`}
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

      {/* 営業時間 */}
      {location.businessHours && Object.keys(location.businessHours).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>営業時間</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap">
              {JSON.stringify(location.businessHours, null, 2)}
            </pre>
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
                {formatDateTime(location.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">更新日時</div>
              <div className="font-medium">
                {formatDateTime(location.updatedAt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">状態</div>
              <div className="font-medium">
                <Badge variant={location.isActive ? 'secondary' : 'destructive'}>
                  {location.isActive ? 'アクティブ' : '削除済み'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 危険な操作 */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">危険な操作</CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={isPending}>
                場所を削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>場所を削除しますか？</DialogTitle>
                <DialogDescription>
                  この操作により、場所は非アクティブ状態になります。
                  紐づいているスペースがある場合は削除できません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
