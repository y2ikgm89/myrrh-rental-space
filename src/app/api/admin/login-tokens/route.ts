/**
 * ワンタイムログイントークン生成API
 *
 * 管理者がスタッフにログインURLを共有するためのワンタイムトークンを生成
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

/**
 * ワンタイムトークンを生成
 */
export async function POST(): Promise<NextResponse> {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 32バイトのランダムトークンを生成（Base64エンコード）
    const token = randomBytes(32).toString('base64url')

    // 有効期限: 30日後（有効期限内であれば複数回使用可能）
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // データベースに保存
    const loginToken = await prisma.loginToken.create({
      data: {
        token,
        createdBy: session.user.id,
        expiresAt,
      },
    })

    // ログインURLを生成
    const baseUrl =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      'http://localhost:3000'
    const loginUrl = `${baseUrl}/admin/login?token=${token}`

    return NextResponse.json({
      token: loginToken.token,
      loginUrl,
      expiresAt: loginToken.expiresAt.toISOString(),
    })
  } catch (error: unknown) {
    console.error('Error generating login token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * アクティブなトークン一覧を取得
 */
export async function GET(): Promise<NextResponse> {
  try {
    // 認証チェック
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 有効期限が切れていないトークンを取得（有効期限内であれば複数回使用可能）
    const tokens = await prisma.loginToken.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // 最新50件
    })

    return NextResponse.json({
      tokens: tokens.map((token) => ({
        id: token.id,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        usedAt: token.usedAt?.toISOString() || null,
      })),
    })
  } catch (error: unknown) {
    console.error('Error fetching login tokens:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
