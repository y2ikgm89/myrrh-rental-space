import { Resend } from 'resend'
import { SITE_DEFAULTS } from './constants'

export const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com'
export const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || SITE_DEFAULTS.name

/**
 * Check if email functionality is enabled
 */
export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY
}

/**
 * Get Resend client instance (lazy initialization)
 * Returns null if RESEND_API_KEY is not set
 */
let resendInstance: Resend | null = null

export function getResendClient(): Resend | null {
  if (!isEmailEnabled()) {
    return null
  }

  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY)
  }

  return resendInstance
}

/**
 * Get formatted from address
 */
export function getFromAddress(): string {
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`
}
