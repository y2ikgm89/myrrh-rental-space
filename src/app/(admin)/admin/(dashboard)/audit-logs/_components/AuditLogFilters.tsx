'use client'

import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { Button } from '@/admin/components/ui/button'
import { Input } from '@/admin/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import { AuditAction } from '@/shared/generated/prisma/enums'
import { getFormString } from '@/shared/lib/utils'

const ACTION_OPTIONS: { value: AuditAction | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'CREATE', label: '作成' },
  { value: 'UPDATE', label: '更新' },
  { value: 'DELETE', label: '削除' },
  { value: 'PUBLISH', label: '公開' },
  { value: 'UNPUBLISH', label: '非公開' },
  { value: 'LOGIN_SUCCESS', label: 'ログイン成功' },
  { value: 'LOGIN_FAILED', label: 'ログイン失敗' },
  { value: 'PERMISSION_DENIED', label: '権限拒否' },
  { value: 'PASSWORD_CHANGE', label: 'パスワード変更' },
  { value: 'ROLE_CHANGE', label: 'ロール変更' },
]

const RESOURCE_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'space', label: 'スペース' },
  { value: 'reservation', label: '予約' },
  { value: 'customer', label: '顧客' },
  { value: 'inquiry', label: 'お問い合わせ' },
  { value: 'post', label: '投稿' },
  { value: 'news', label: 'お知らせ' },
  { value: 'page', label: '固定ページ' },
  { value: 'faq', label: 'FAQ' },
  { value: 'settings', label: '設定' },
  { value: 'user', label: 'ユーザー' },
  { value: 'auth', label: '認証' },
]

export function AuditLogFilters() {
  const [params, setParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      action: parseAsString.withDefault(''),
      resource: parseAsString.withDefault(''),
      dateFrom: parseAsString.withDefault(''),
      dateTo: parseAsString.withDefault(''),
    },
    { history: 'push', shallow: false }
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const newAction = getFormString(formData, 'action')
    const newResource = getFormString(formData, 'resource')
    const newDateFrom = getFormString(formData, 'dateFrom')
    const newDateTo = getFormString(formData, 'dateTo')

    void setParams({
      action: newAction === 'ALL' ? null : newAction || null,
      resource: newResource === 'ALL_RESOURCES' ? null : newResource || null,
      dateFrom: newDateFrom || null,
      dateTo: newDateTo || null,
      page: 1,
    })
  }

  const handleReset = () => {
    void setParams({
      action: null,
      resource: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-4">
      <Select name="action" defaultValue={params.action || 'ALL'}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="アクション" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select name="resource" defaultValue={params.resource || 'ALL_RESOURCES'}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="リソース" />
        </SelectTrigger>
        <SelectContent>
          {RESOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value || 'ALL_RESOURCES'}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        name="dateFrom"
        defaultValue={params.dateFrom}
        className="w-[160px]"
        placeholder="開始日"
      />

      <Input
        type="date"
        name="dateTo"
        defaultValue={params.dateTo}
        className="w-[160px]"
        placeholder="終了日"
      />

      <Button type="submit" variant="secondary">
        検索
      </Button>

      <Button type="button" variant="ghost" onClick={handleReset}>
        リセット
      </Button>
    </form>
  )
}
