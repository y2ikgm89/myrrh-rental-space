'use client'

/**
 * 基本情報セクション
 *
 * サイト名、ロゴ、ファビコン、OGP画像などの基本設定
 */

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
} from '@/admin/components/ui'
import { updateBasicInfo } from '@/admin/actions/settings'
import type { SettingsData } from '@/admin/actions/settings'
import { useRefreshOnSuccess } from '../hooks'

interface BasicInfoSectionProps {
  settings: SettingsData
}

export function BasicInfoSection({ settings }: BasicInfoSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    siteName: settings.siteName || '',
    siteDescription: settings.siteDescription || '',
    faviconUrl: settings.faviconUrl || '',
    defaultOgpImageUrl: settings.defaultOgpImageUrl || '',
    headerLogoUrl: settings.headerLogoUrl || '',
    footerCopyright: settings.footerCopyright || '',
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateBasicInfo({
        siteName: formData.siteName || null,
        siteDescription: formData.siteDescription || null,
        faviconUrl: formData.faviconUrl || null,
        defaultOgpImageUrl: formData.defaultOgpImageUrl || null,
        headerLogoUrl: formData.headerLogoUrl || null,
        footerCopyright: formData.footerCopyright || null,
      })
      handleResult(result)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本情報</CardTitle>
        <CardDescription>サイトの基本的な情報を設定します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="siteName">サイト名</Label>
            <Input
              id="siteName"
              value={formData.siteName}
              onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
              placeholder="Myrrh Rental Space"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footerCopyright">フッターコピーライト</Label>
            <Input
              id="footerCopyright"
              value={formData.footerCopyright}
              onChange={(e) => setFormData({ ...formData, footerCopyright: e.target.value })}
              placeholder="2024 Myrrh Rental Space"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteDescription">サイト説明</Label>
          <Textarea
            id="siteDescription"
            value={formData.siteDescription}
            onChange={(e) => setFormData({ ...formData, siteDescription: e.target.value })}
            placeholder="サイトの説明文"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="headerLogoUrl">ヘッダーロゴURL</Label>
            <Input
              id="headerLogoUrl"
              value={formData.headerLogoUrl}
              onChange={(e) => setFormData({ ...formData, headerLogoUrl: e.target.value })}
              placeholder="/images/logo.svg"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="faviconUrl">ファビコンURL</Label>
            <Input
              id="faviconUrl"
              value={formData.faviconUrl}
              onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
              placeholder="/favicon.ico"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultOgpImageUrl">OGP画像URL</Label>
            <Input
              id="defaultOgpImageUrl"
              value={formData.defaultOgpImageUrl}
              onChange={(e) => setFormData({ ...formData, defaultOgpImageUrl: e.target.value })}
              placeholder="/images/ogp.jpg"
              disabled={isPending}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '基本情報を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
