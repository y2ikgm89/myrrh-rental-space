import "server-only";

type ReservationLockClient = {
  readonly $executeRaw: (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
};

/**
 * Reservation overlap checks are read-before-write. Serialize all mutations for
 * the same space so two transactions cannot both observe an empty interval.
 */
export async function lockReservationSpaceForTransaction(
  tx: ReservationLockClient,
  spaceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728351::int4, hashtext(${spaceId}))`;
}
