'use client'

/**
 * APIキータブ
 *
 * 外部サービスAPIキーの管理タブ
 */

import { useEffect, useState } from 'react'
import {
  getResendConfig,
  getTurnstileConfig,
  getGoogleMapsConfig,
  getCustomApiKeys,
} from '@/actions/admin/api-keys'
import {
  ResendSection,
  TurnstileSection,
  GoogleMapsSection,
  CustomApiKeysSection,
} from '../sections'
import type {
  ResendConfig,
  TurnstileConfig,
  GoogleMapsConfig,
  CustomApiKeyData,
} from '@/types/api-keys'

// =============================================================================
// Main Component
// =============================================================================

export function ApiKeysTab() {
  const [isLoading, setIsLoading] = useState(true)
  const [resendConfig, setResendConfig] = useState<ResendConfig | null>(null)
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileConfig | null>(null)
  const [googleMapsConfig, setGoogleMapsConfig] = useState<GoogleMapsConfig | null>(null)
  const [customApiKeys, setCustomApiKeys] = useState<CustomApiKeyData[]>([])

  const loadConfigs = async () => {
    try {
      const [resend, turnstile, googleMaps, custom] = await Promise.all([
        getResendConfig(),
        getTurnstileConfig(),
        getGoogleMapsConfig(),
        getCustomApiKeys(),
      ])
      setResendConfig(resend)
      setTurnstileConfig(turnstile)
      setGoogleMapsConfig(googleMaps)
      setCustomApiKeys(custom)
    } catch (error) {
      console.error('Failed to load API key configs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">外部サービスAPIキー</h2>
          <p className="text-sm text-muted-foreground">
            外部サービスとの連携に必要なAPIキーを管理します
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border bg-muted"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">外部サービスAPIキー</h2>
        <p className="text-sm text-muted-foreground">
          外部サービスとの連携に必要なAPIキーを管理します。
          すべてのシークレットキーは暗号化して保存されます。
        </p>
      </div>

      {resendConfig && (
        <ResendSection config={resendConfig} />
      )}

      {turnstileConfig && (
        <TurnstileSection config={turnstileConfig} />
      )}

      {googleMapsConfig && (
        <GoogleMapsSection config={googleMapsConfig} />
      )}

      <CustomApiKeysSection keys={customApiKeys} />
    </div>
  )
}
