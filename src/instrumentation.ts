/**
 * Next.js Instrumentation
 *
 * サーバー起動時に1回だけ実行される。
 * システムページ + デフォルトセクションの自動保証を行う。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === 'nodejs') {
    const { bootstrapSystemPages } = await import('@/shared/lib/bootstrap')
    await bootstrapSystemPages()
  }
}
