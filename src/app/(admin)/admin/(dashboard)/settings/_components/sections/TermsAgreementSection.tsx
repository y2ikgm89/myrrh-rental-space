'use client'

/**
 * 規約同意設定セクション
 *
 * 予約フォームでの規約同意チェックボックスの設定
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
  Checkbox,
} from '@/components/admin/ui'
import { updateTermsAgreementSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import { useRefreshOnSuccess } from '../hooks'

interface TermsAgreementSectionProps {
  settings: SettingsData
}

export function TermsAgreementSection({ settings }: TermsAgreementSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    termsAgreementEnabled: settings.termsAgreementEnabled,
    termsAgreementText: settings.termsAgreementText || '',
    requireTermsAgreement: settings.requireTermsAgreement,
    requirePrivacyAgreement: settings.requirePrivacyAgreement,
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTermsAgreementSettings({
        termsAgreementEnabled: formData.termsAgreementEnabled,
        termsAgreementText: formData.termsAgreementText || null,
        requireTermsAgreement: formData.requireTermsAgreement,
        requirePrivacyAgreement: formData.requirePrivacyAgreement,
      })
      handleResult(result)
    })
  }

  // デフォルト文言を生成
  const getDefaultText = () => {
    const items = []
    if (formData.requireTermsAgreement) items.push('利用規約')
    if (formData.requirePrivacyAgreement) items.push('プライバシーポリシー')
    return items.length > 0 ? `${items.join('と')}に同意します` : '規約に同意します'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>規約同意設定</CardTitle>
        <CardDescription>
          予約フォームでの利用規約・プライバシーポリシーへの同意確認を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="termsAgreementEnabled"
            checked={formData.termsAgreementEnabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, termsAgreementEnabled: checked })
            }
            disabled={isPending}
          />
          <Label htmlFor="termsAgreementEnabled" className="cursor-pointer">
            予約時に規約同意を求める
          </Label>
        </div>

        {formData.termsAgreementEnabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="termsAgreementText">同意文言（カスタム）</Label>
              <Input
                id="termsAgreementText"
                value={formData.termsAgreementText}
                onChange={(e) =>
                  setFormData({ ...formData, termsAgreementText: e.target.value })
                }
                placeholder={getDefaultText()}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合は「{getDefaultText()}」が表示されます
              </p>
            </div>

            <div className="space-y-3">
              <Label>対象規約</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requireTermsAgreement"
                    checked={formData.requireTermsAgreement}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, requireTermsAgreement: checked })
                    }
                    disabled={isPending}
                  />
                  <Label htmlFor="requireTermsAgreement" className="cursor-pointer font-normal">
                    利用規約への同意を必須にする
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="requirePrivacyAgreement"
                    checked={formData.requirePrivacyAgreement}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, requirePrivacyAgreement: checked })
                    }
                    disabled={isPending}
                  />
                  <Label htmlFor="requirePrivacyAgreement" className="cursor-pointer font-normal">
                    プライバシーポリシーへの同意を必須にする
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                選択した規約へのリンクがチェックボックスと共に表示されます
              </p>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '規約同意設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
