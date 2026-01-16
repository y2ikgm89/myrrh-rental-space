/**
 * 決済タブ
 *
 * Stripe決済の設定を行うタブ
 * 将来的に他の決済プロバイダを追加可能
 */

import type { SettingsData } from '@/actions/admin/settings'
import { StripeSection } from '../sections'

interface PaymentTabProps {
  settings: SettingsData
}

export function PaymentTab({ settings }: PaymentTabProps) {
  return (
    <div className="space-y-6">
      <StripeSection settings={settings} />
      {/* 将来: <PayPaySection />, <GMOSection /> */}
    </div>
  )
}
