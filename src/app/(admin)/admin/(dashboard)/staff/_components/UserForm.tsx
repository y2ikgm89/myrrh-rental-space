'use client'

import { useRouter } from 'next/navigation'
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
import { useFormAction } from '@/admin/hooks'
import { createUser, updateUser, type UserData } from '@/admin/actions/user'
import { Role } from '@/shared/generated/prisma/enums'

// ロールラベル（クライアント用ローカル定義）
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'スーパー管理者',
  ADMIN: '管理者',
  EDITOR: '編集者',
  VIEWER: '閲覧者',
  USER: 'ユーザー',
}

type FormData = {
  email: string
  password: string
  name: string
  role: Role
}

type RoleValue = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'USER'
const ROLE_VALUES: readonly RoleValue[] = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER']

const createSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上必要です'),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.enum(ROLE_VALUES),
})

const updateSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上必要です').or(z.literal('')),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.enum(ROLE_VALUES),
})

type Props =
  | { mode: 'create'; user?: never }
  | { mode: 'edit'; user: UserData }

export function UserForm({ mode, user }: Props) {
  const router = useRouter()
  const isEdit = mode === 'edit'

  const { form, isPending, onSubmit } = useFormAction(
    isEdit ? updateSchema : createSchema,
    async (data) => {
      if (isEdit) {
        return updateUser(user.id, {
          email: data.email,
          name: data.name,
          role: data.role as Role,
          password: data.password || undefined,
        })
      }
      return createUser(data as FormData)
    },
    {
      redirectTo: isEdit ? `/admin/staff/${user.id}` : '/admin/staff',
      refresh: true,
      defaultValues: isEdit
        ? {
            email: user.email,
            password: '',
            name: user.name || '',
            role: user.role,
          }
        : {
            email: '',
            password: '',
            name: '',
            role: 'USER',
          },
    }
  )

  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form

  const currentRole = watch('role')

  return (
    <form onSubmit={onSubmit} className="space-y-6">

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">名前 *</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="山田 太郎"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            {...register('email')}
            placeholder="example@example.com"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">
            パスワード {isEdit ? '(変更する場合のみ入力)' : '*'}
          </Label>
          <Input
            id="password"
            type="password"
            {...register('password')}
            placeholder={isEdit ? '変更しない場合は空欄' : '8文字以上'}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">ロール *</Label>
          <Select
            value={currentRole}
            onValueChange={(value: Role) => setValue('role', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="ロールを選択" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_VALUES.map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {currentRole === 'SUPER_ADMIN' && 'システム全体の管理権限（ユーザー管理、監査ログ含む）'}
            {currentRole === 'ADMIN' && 'コンテンツ管理全般（ユーザー管理除く）'}
            {currentRole === 'EDITOR' && '割り当てられたページのみ編集可能'}
            {currentRole === 'VIEWER' && '閲覧のみ（編集不可）'}
            {currentRole === 'USER' && '公開ユーザー（管理画面アクセス不可）'}
          </p>
          {errors.role && (
            <p className="text-sm text-destructive">{errors.role.message}</p>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? '保存中...' : isEdit ? '更新' : '作成'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
      </div>
    </form>
  )
}
