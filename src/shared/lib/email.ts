import 'server-only'
import { Resend } from 'resend'
import { SITE_DEFAULTS } from './constants'
import { serverEnv } from '@/shared/lib/env/server'

export const EMAIL_FROM = serverEnv.EMAIL_FROM ?? 'noreply@example.com'
export const EMAIL_FROM_NAME = serverEnv.EMAIL_FROM_NAME ?? SITE_DEFAULTS.name

/**
 * Check if email functionality is enabled
 */
export function isEmailEnabled(): boolean {
  return !!serverEnv.RESEND_API_KEY
}

/**
 * Get Resend client instance (lazy initialization)
 * Returns null if RESEND_API_KEY is not set
 */
let resendInstance: Resend | null = null

export function getResendClient(): Resend | null {
  const apiKey = serverEnv.RESEND_API_KEY
  if (!apiKey) return null

  if (!resendInstance) {
    resendInstance = new Resend(apiKey)
  }

  return resendInstance
}

/**
 * Get formatted from address
 */
export function getFromAddress(): string {
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`
}
