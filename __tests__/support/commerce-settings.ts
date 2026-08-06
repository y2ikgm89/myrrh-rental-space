/**
 * `settings_commerce` の singleton 行を用意する（実 DB 統合テスト用）。
 *
 * ## なぜ要るか
 *
 * **CI の test DB は seed されない**（`prisma migrate deploy` だけ）。ローカルの
 * test DB は seed 済みなので、設定行の存在に依存するテストは**ローカルだけ緑になる**。
 *
 * 実際、領収書のイベント税率が「設定から読む・無ければ発行しない」契約になった
 * 時点で、4 つの統合テストが **CI でだけ**落ちた。設定行はインストールの一部
 * （seed が必ず作る）なので、それを前提にする経路のテストは自分で用意する。
 *
 * 行が既にあれば触らない（他テストが変えた値を踏まない）。
 */

type SingletonUpsertClient = {
  readonly settingsCommerce: {
    upsert(args: {
      where: { id: string };
      update: Record<string, never>;
      create: { id: string };
    }): Promise<unknown>;
  };
};

/** すべての設定列に `@default` があるので、id だけ与えれば既定値の行ができる。 */
export async function ensureCommerceSettings(
  prisma: SingletonUpsertClient,
): Promise<void> {
  await prisma.settingsCommerce.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
