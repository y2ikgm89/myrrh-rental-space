'use client'

/**
 * 権限マトリクスセクション
 *
 * ロール別のリソースアクセス権限を表示
 */

import Link from 'next/link'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui'
import { Role } from '@/shared/generated/prisma/enums'
import {
  ROLE_PERMISSIONS,
  RESOURCE_LABELS,
  ACTION_LABELS,
  ROLE_LABELS,
  type Resource,
  type Action,
} from '@/admin/lib/permissions-constants'
import { Check, X } from 'lucide-react'

// =============================================================================
// Constants
// =============================================================================

const RESOURCES: Resource[] = [
  'space',
  'reservation',
  'customer',
  'inquiry',
  'blog',
  'news',
  'page',
  'faq',
  'settings',
  'user',
  'auditLog',
  'navigation',
  'announcementBar',
]

const ACTIONS: Action[] = ['create', 'read', 'update', 'delete', 'publish', 'manage']

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER]

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'システム全体の管理権限。ユーザー管理、監査ログ、全設定へのアクセス。',
  ADMIN: 'コンテンツ管理全般。ユーザー管理と監査ログ以外の全機能。',
  EDITOR: '割り当てられたページのみ編集可能。新規作成・削除は不可。',
  VIEWER: '閲覧のみ。編集・削除などの操作は不可。',
  USER: '公開サイトのユーザーアカウント。管理画面へのアクセス権限なし。',
}

const ROLE_VARIANTS: Record<Role, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SUPER_ADMIN: 'destructive',
  ADMIN: 'default',
  EDITOR: 'secondary',
  VIEWER: 'outline',
  USER: 'outline',
}

// =============================================================================
// Component
// =============================================================================

export function PermissionsSection() {
  return (
    <div className="space-y-6">
      {/* ロール説明 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ADMIN_ROLES.map((role) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant={ROLE_VARIANTS[role]}>{ROLE_LABELS[role]}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 権限マトリクス */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>権限マトリクス</CardTitle>
              <CardDescription>
                各ロールが持つリソースへのアクセス権限
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/admin/users">ユーザー管理</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">リソース</TableHead>
                  <TableHead className="w-[100px]">アクション</TableHead>
                  {ADMIN_ROLES.map((role) => (
                    <TableHead key={role} className="text-center w-[100px]">
                      {ROLE_LABELS[role]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {RESOURCES.map((resource) =>
                  ACTIONS.map((action, actionIndex) => {
                    // このリソース×アクションの組み合わせが存在するかチェック
                    const hasAnyPermission = ADMIN_ROLES.some((role) =>
                      ROLE_PERMISSIONS[role].includes(`${resource}:${action}`)
                    )

                    if (!hasAnyPermission) return null

                    return (
                      <TableRow key={`${resource}-${action}`}>
                        {actionIndex === 0 ? (
                          <TableCell
                            rowSpan={ACTIONS.filter((a) =>
                              ADMIN_ROLES.some((r) =>
                                ROLE_PERMISSIONS[r].includes(`${resource}:${a}`)
                              )
                            ).length}
                            className="font-medium align-top"
                          >
                            {RESOURCE_LABELS[resource]}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-muted-foreground">
                          {ACTION_LABELS[action]}
                        </TableCell>
                        {ADMIN_ROLES.map((role) => {
                          const hasPermission = ROLE_PERMISSIONS[role].includes(
                            `${resource}:${action}`
                          )
                          return (
                            <TableCell key={role} className="text-center">
                              {hasPermission ? (
                                <Check className="h-4 w-4 text-green-600 mx-auto" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 補足情報 */}
      <Card>
        <CardHeader>
          <CardTitle>補足情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">EDITOR ロールについて</h3>
            <p className="text-sm text-muted-foreground">
              EDITORロールは、割り当てられたページのみ編集可能です。
              ユーザー詳細ページで「割り当てページ」を設定してください。
            </p>
          </div>
          <div>
            <h3 className="font-medium mb-2">USER ロールについて</h3>
            <p className="text-sm text-muted-foreground">
              USERロールは公開サイトのユーザーアカウントです。管理画面へのアクセス権限はありません。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
