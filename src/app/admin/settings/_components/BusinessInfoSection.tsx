'use client'

import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui'
import { updateBusinessInfo } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'

interface BusinessInfoSectionProps {
  settings: SettingsData
  onUpdate: () => void
}

const BUSINESS_TYPES = [
  { value: 'individual', label: '個人事業主' },
  { value: 'corporation', label: '法人' },
  { value: 'llc', label: '合同会社' },
  { value: 'npo', label: 'NPO法人' },
  { value: 'other', label: 'その他' },
]

const INDUSTRY_TYPES = [
  { value: 'rental_space', label: 'レンタルスペース' },
  { value: 'event_venue', label: 'イベント会場' },
  { value: 'coworking', label: 'コワーキングスペース' },
  { value: 'meeting_room', label: '貸会議室' },
  { value: 'studio', label: 'スタジオ' },
  { value: 'other', label: 'その他' },
]

export function BusinessInfoSection({ settings, onUpdate }: BusinessInfoSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    businessName: settings.businessName || '',
    businessNameKana: settings.businessNameKana || '',
    representativeName: settings.representativeName || '',
    businessType: settings.businessType || '',
    industryType: settings.industryType || '',
    establishedDate: settings.establishedDate
      ? new Date(settings.establishedDate).toISOString().split('T')[0]
      : '',
    registrationNumber: settings.registrationNumber || '',
    invoiceNumber: settings.invoiceNumber || '',
    businessDescription: settings.businessDescription || '',
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateBusinessInfo({
        businessName: formData.businessName || null,
        businessNameKana: formData.businessNameKana || null,
        representativeName: formData.representativeName || null,
        businessType: formData.businessType || null,
        industryType: formData.industryType || null,
        establishedDate: formData.establishedDate || null,
        registrationNumber: formData.registrationNumber || null,
        invoiceNumber: formData.invoiceNumber || null,
        businessDescription: formData.businessDescription || null,
      })
      if (!result.success) {
        alert(result.error)
      } else {
        onUpdate()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>事業者情報</CardTitle>
        <CardDescription>事業者の基本情報を設定します（特定商取引法表示などに使用）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="businessName">会社名・屋号</Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              placeholder="株式会社サンプル"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessNameKana">会社名・屋号（カナ）</Label>
            <Input
              id="businessNameKana"
              value={formData.businessNameKana}
              onChange={(e) => setFormData({ ...formData, businessNameKana: e.target.value })}
              placeholder="カブシキガイシャサンプル"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="representativeName">代表者名</Label>
            <Input
              id="representativeName"
              value={formData.representativeName}
              onChange={(e) => setFormData({ ...formData, representativeName: e.target.value })}
              placeholder="山田 太郎"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessType">事業形態</Label>
            <Select
              value={formData.businessType}
              onValueChange={(value) => setFormData({ ...formData, businessType: value })}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="industryType">業種</Label>
            <Select
              value={formData.industryType}
              onValueChange={(value) => setFormData({ ...formData, industryType: value })}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="establishedDate">設立日</Label>
            <Input
              id="establishedDate"
              type="date"
              value={formData.establishedDate}
              onChange={(e) => setFormData({ ...formData, establishedDate: e.target.value })}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">法人番号</Label>
            <Input
              id="registrationNumber"
              value={formData.registrationNumber}
              onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
              placeholder="1234567890123"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">インボイス登録番号</Label>
            <Input
              id="invoiceNumber"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
              placeholder="T1234567890123"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="businessDescription">事業概要</Label>
          <Textarea
            id="businessDescription"
            value={formData.businessDescription}
            onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
            placeholder="事業内容の説明..."
            rows={3}
            disabled={isPending}
          />
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '事業者情報を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
