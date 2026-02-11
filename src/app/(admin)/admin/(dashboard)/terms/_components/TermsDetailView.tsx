'use client'

/**
 * 規約詳細ビュー
 *
 * 規約の基本情報編集とバージョン管理を提供
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import { TermsForm } from './TermsForm'
import { TermsVersionForm } from './TermsVersionForm'
import {
  publishTermsVersion,
  archiveTermsVersion,
  deleteTermsVersion,
} from '@/admin/actions/terms'
import type { TermsDetail } from '@/shared/lib/validations/terms'
import type { BusinessInfo } from '@/shared/lib/terms-templates'

interface TermsDetailViewProps {
  terms: TermsDetail
  businessInfo: BusinessInfo
}

export function TermsDetailView({ terms, businessInfo }: TermsDetailViewProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState('versions')
  const [showNewVersionDialog, setShowNewVersionDialog] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null)

  const handlePublish = (versionId: string) => {
    startTransition(async () => {
      const result = await publishTermsVersion(versionId)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleArchive = (versionId: string) => {
    startTransition(async () => {
      const result = await archiveTermsVersion(versionId)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDeleteVersion = (versionId: string) => {
    setDeletingVersionId(versionId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteVersion = () => {
    if (!deletingVersionId) return

    startTransition(async () => {
      const result = await deleteTermsVersion(deletingVersionId)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setDeleteDialogOpen(false)
      setDeletingVersionId(null)
    })
  }

  const getStatusBadge = (status: string, isCurrentVersion: boolean) => {
    if (isCurrentVersion) {
      return <Badge className="bg-success">現在のバージョン</Badge>
    }

    switch (status) {
      case 'DRAFT':
        return <Badge variant="outline">下書き</Badge>
      case 'PUBLISHED':
        return <Badge variant="secondary">公開済み</Badge>
      case 'ARCHIVED':
        return <Badge variant="secondary" className="opacity-60">アーカイブ</Badge>
      default:
        return null
    }
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions">バージョン管理</TabsTrigger>
          <TabsTrigger value="settings">基本設定</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>バージョン一覧</CardTitle>
                <CardDescription>
                  {terms.versions.length}件のバージョン
                </CardDescription>
              </div>
              <Button onClick={() => setShowNewVersionDialog(true)}>
                新しいバージョンを作成
              </Button>
            </CardHeader>
            <CardContent>
              {terms.versions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p>バージョンがありません</p>
                  <p className="text-sm mt-1">
                    新しいバージョンを作成して規約内容を追加してください
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {terms.versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between py-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            バージョン {version.version}
                          </span>
                          {getStatusBadge(version.status, version.isCurrentVersion)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          作成:{' '}
                          {formatDistanceToNow(new Date(version.createdAt), {
                            addSuffix: true,
                            locale: ja,
                          })}
                          {version.publishedAt && (
                            <>
                              {' '}
                              · 公開:{' '}
                              {formatDistanceToNow(new Date(version.publishedAt), {
                                addSuffix: true,
                                locale: ja,
                              })}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {version.status === 'DRAFT' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePublish(version.id)}
                              disabled={isPending}
                            >
                              公開
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={`/admin/terms/${terms.id}/versions/${version.id}/edit`}>
                                編集
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleDeleteVersion(version.id)}
                              disabled={isPending}
                            >
                              削除
                            </Button>
                          </>
                        )}
                        {version.status === 'PUBLISHED' && !version.isCurrentVersion && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePublish(version.id)}
                              disabled={isPending}
                            >
                              現在に設定
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchive(version.id)}
                              disabled={isPending}
                            >
                              アーカイブ
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a href={`/admin/terms/${terms.id}/versions/${version.id}`}>
                            プレビュー
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 使用状況 */}
          <Card>
            <CardHeader>
              <CardTitle>使用状況</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{terms._count?.spaces ?? 0}</p>
                  <p className="text-sm text-muted-foreground">使用中のスペース</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{terms._count?.agreements ?? 0}</p>
                  <p className="text-sm text-muted-foreground">同意記録</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <TermsForm terms={terms} />
        </TabsContent>
      </Tabs>

      {/* New Version Dialog */}
      <Dialog open={showNewVersionDialog} onOpenChange={setShowNewVersionDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新しいバージョンを作成</DialogTitle>
            <DialogDescription>
              規約の新しいバージョンを作成します。作成後、公開することで有効になります。
            </DialogDescription>
          </DialogHeader>
          <TermsVersionForm
            termsId={terms.id}
            termsType={terms.type}
            businessInfo={businessInfo}
            onSuccess={() => {
              setShowNewVersionDialog(false)
              router.refresh()
            }}
            onCancel={() => setShowNewVersionDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Version Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>バージョンを削除</DialogTitle>
            <DialogDescription>
              このバージョンを削除しますか？下書き状態のバージョンのみ削除できます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteVersion}
              disabled={isPending}
            >
              {isPending ? '削除中...' : '削除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
