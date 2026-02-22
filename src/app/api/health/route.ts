/**
 * ヘルスチェックAPI
 *
 * Cloud Run / Load Balancerからのヘルスチェックリクエストに応答します。
 * データベース接続の確認も行います。
 *
 * @module api/health
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'

/**
 * Health check endpoint for Cloud Run / Load Balancer
 * GET /api/health
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Database connectivity check
    await prisma.$queryRaw`SELECT 1`

    const responseTime = Date.now() - startTime

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        database: 'connected',
        version: process.env['npm_package_version'] || '0.1.0',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.CRITICAL,
      context: { operation: 'healthCheck' },
    })

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }
}
