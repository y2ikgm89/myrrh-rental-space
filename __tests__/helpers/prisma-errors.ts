/**
 * Prisma 7 + `@prisma/adapter-pg` が実際に投げる error 形状の fixture factory。
 *
 * 各テストが自前で形状を書くと、Prisma の形状が変わったときに**古い形のまま緑**に
 * なる。実際 v6 (Rust engine) の `meta: { target: [...] }` を焼いた fixture が
 * 5 ファイルに残っていて、`isPrismaUniqueConstraintError` の v6 fallback を
 * 消すまで誰も気づかなかった。形状の SSoT をここ 1 箇所に寄せる。
 *
 * 実測（test DB / Prisma 7.9.1 + adapter-pg）。create / createMany / update /
 * upsert / `$transaction` / 複合 unique / partial unique index の 7 形すべてで
 * この形状になり、`meta.target` は一度も現れない。
 *
 * `fields` は **物理列名**（Prisma の field 名ではない）。`Refund.stripeRefundId`
 * なら `["stripe_refund_id"]`。
 */
export function uniqueConstraintError(
  fields: readonly string[],
  modelName?: string,
): { readonly code: "P2002"; readonly meta: Record<string, unknown> } {
  return {
    code: "P2002",
    meta: {
      ...(modelName === undefined ? {} : { modelName }),
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  };
}
