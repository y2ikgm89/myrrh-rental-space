/**
 * Prisma 7 + `@prisma/adapter-pg` が実際に投げる error 形状の fixture factory。
 *
 * 各テストが自前で形状を書くと、Prisma の形状が変わったときに**古い形のまま緑**に
 * なる。実際 v6 (Rust engine) の `meta: { target: [...] }` を焼いた fixture が
 * 5 ファイルに残っていて、`isPrismaUniqueConstraintError` の v6 fallback を
 * 消すまで誰も気づかなかった。形状の SSoT をここ 1 箇所に寄せる。
 *
 * 実測（test DB / Prisma 7.10.0 + adapter-pg）。**7.9.1 までは
 * `constraint: { fields: ["stripe_refund_id"] }`（物理列名）だった**が、7.10.0 の
 * adapter は 23505 で PostgreSQL が必ず返す制約名を優先し
 * `constraint: { index: "refunds_stripe_refund_id_key" }` を返す。列名は一切入らない。
 *
 * 引数は **index 名**（`@@unique(map:)` を書いていればその名前、既定は
 * `<テーブル名>_<物理列名>_key`、主キーなら `<テーブル名>_pkey`）。
 */
export function uniqueConstraintError(
  index: string,
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
          originalMessage: `duplicate key value violates unique constraint "${index}"`,
          kind: "UniqueConstraintViolation",
          constraint: { index },
        },
      },
    },
  };
}
