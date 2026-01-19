'use client'

/**
 * スタッフ招待フォーム
 *
 * メールアドレスを入力して招待メールを送信
 * スタッフ自身がパスワードを設定するフロー
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/admin/components/ui/button'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import { sendInvitation } from '@/admin/actions/staff-invitation'

// スタッフ用ロール（管理画面アクセス可能なロールのみ）
type StaffRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER'
const STAFF_ROLES: readonly StaffRole[] = ['ADMIN', 'EDITOR', 'VIEWER']

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: 'スーパー管理者',
  ADMIN: '管理者',
  EDITOR: '編集者',
  VIEWER: '閲覧者',
}

const inviteSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z.string().max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'] as const),
})

type InviteFormData = z.infer<typeof inviteSchema>

export function InviteForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      name: '',
      role: 'EDITOR',
    },
  })

  const currentRole = watch('role')

  async function onSubmit(data: InviteFormData) {
    setIsSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await sendInvitation({
        email: data.email,
        name: data.name || undefined,
        role: data.role,
      })

      if (result.success) {
        setSuccess(true)
        reset()
        // 3秒後にスタッフ一覧へ戻る
        setTimeout(() => {
          router.push('/admin/staff')
          router.refresh()
        }, 3000)
      } else {
        setError(result.error ?? 'エラーが発生しました')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-md bg-green-50 p-6 text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-green-800">招待メールを送信しました</h3>
        <p className="mt-2 text-sm text-green-700">
          スタッフにメールが届き、パスワードを設定するとログインできるようになります。
        </p>
        <p className="mt-4 text-xs text-green-600">
          スタッフ一覧に戻ります...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-medium">招待フローについて</p>
        <p className="mt-1">
          メールアドレスを入力して招待を送信すると、スタッフ宛に招待メールが届きます。
          スタッフは自分でパスワードを設定してログインできるようになります。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            {...register('email')}
            placeholder="staff@example.com"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">名前（任意）</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="山田 太郎"
          />
          <p className="text-xs text-muted-foreground">
            未入力の場合、メールアドレスから自動生成されます
          </p>
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">ロール *</Label>
        <Select
          value={currentRole}
          onValueChange={(value: StaffRole) => setValue('role', value)}
        >
          <SelectTrigger className="w-full md:w-1/2">
            <SelectValue placeholder="ロールを選択" />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {STAFF_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {currentRole === 'SUPER_ADMIN' && 'システム全体の管理権限（ユーザー管理、監査ログ含む）'}
          {currentRole === 'ADMIN' && 'コンテンツ管理全般（ユーザー管理除く）'}
          {currentRole === 'EDITOR' && '割り当てられたページのみ編集可能'}
          {currentRole === 'VIEWER' && '閲覧のみ（編集不可）'}
        </p>
        {errors.role && (
          <p className="text-sm text-destructive">{errors.role.message}</p>
        )}
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '送信中...' : '招待メールを送信'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          キャンセル
        </Button>
      </div>
    </form>
  )
}
