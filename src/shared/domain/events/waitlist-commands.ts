import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  EventStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "./waitlist-locks";

const OFFER_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Register a customer to the waitlist for a specific (event, slot, ticket) combination.
 * Called from the public waitlist form when the slot/ticket is full.
 */
export async function registerWaitlistEntryCommand(data: {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  quantity: number;
  customerId?: string | null;
}) {
  if (!(await isFeatureEnabled("events"))) {
    throw new DomainError(
      "イベント機能は現在サイト全体で無効化されています",
      "VALIDATION",
    );
  }

  // 定員判定〜create を 1 つの interactive transaction に閉じ、先頭で event 単位の
  // advisory xact ロックを取って createEventRegistrationCommand / cancel 経路と直列化する。
  return prisma.$transaction(
    async (tx) => {
      // 同一 event の申込・キャンセル・promote と直列化する必要があるため 728350 を再利用
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${data.eventId}))`;

      await ensureCustomerNotBlacklisted(
        { customerId: data.customerId ?? null, email: data.email },
        tx,
      );

      const event = await tx.event.findFirst({
        where: {
          id: data.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          registrationOpen: true,
          registrationDeadline: true,
        },
      });
      if (!event)
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");
      if (!event.registrationOpen)
        throw new DomainError(
          "このイベントは申込受付を終了しています",
          "VALIDATION",
        );

      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: data.slotId },
        select: { id: true, eventId: true, capacity: true, startAt: true },
      });
      if (!slot || slot.eventId !== data.eventId)
        throw new DomainError(
          "指定されたタイムスロットが見つかりません",
          "NOT_FOUND",
        );

      const deadline = event.registrationDeadline ?? slot.startAt;
      const now = new Date();
      if (now.getTime() > deadline.getTime())
        throw new DomainError(
          "申込締切を過ぎたため受け付けできません",
          "VALIDATION",
        );

      const ticket = await tx.eventTicket.findFirst({
        where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
        select: { id: true, name: true, capacity: true },
      });
      if (!ticket)
        throw new DomainError(
          "指定されたチケット種別が見つかりません",
          "NOT_FOUND",
        );

      // Waitlist は「スロット全体 or 対象チケット種別のいずれかが満員だから」登録
      // される。スロットに空きがあっても対象チケット種別だけ満員のケースがあり得る
      // (createEventRegistrationCommand の per-ticket capacity 拒否と対になる導線 —
      // ここを見落とすと「チケットが満員です」で弾かれた顧客が waitlist にも入れず
      // 行き場を失う)。スロットとチケットの両方に空きがある場合のみ、通常の
      // CONFIRMED 経路を案内するエラーを返す (フォーム分岐との整合性ガード)。
      // interactive transaction の単一コネクションは並行クエリ不可のため、各
      // aggregate は逐次 await する (createEventRegistrationCommand と同じ制約、
      // Promise.all 不可)。
      const slotConfirmed = await tx.eventRegistration.aggregate({
        where: { slotId: data.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });
      const slotRemaining = slot.capacity - (slotConfirmed._sum.quantity ?? 0);

      const ticketConfirmed =
        ticket.capacity != null
          ? await tx.eventRegistration.aggregate({
              where: {
                eventId: event.id,
                ticketId: ticket.id,
                slotId: data.slotId,
                status: RegistrationStatus.CONFIRMED,
              },
              _sum: { quantity: true },
            })
          : null;
      const ticketRemaining =
        ticket.capacity != null && ticketConfirmed
          ? ticket.capacity - (ticketConfirmed._sum.quantity ?? 0)
          : null;

      const slotHasSpace = slotRemaining >= data.quantity;
      const ticketHasSpace =
        ticketRemaining === null || ticketRemaining >= data.quantity;
      if (slotHasSpace && ticketHasSpace) {
        throw new DomainError(
          "現在このスロットには空きがあります。通常の申込フォームからお申し込みください",
          "CONFLICT",
        );
      }

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId: data.customerId ?? null,
          status: RegistrationStatus.WAITLISTED,
          waitlistedAt: now,
        },
        select: {
          id: true,
          waitlistedAt: true,
        },
      });

      // waitlistedAt は create 時に new Date() を渡したが、列は nullable のため
      // Prisma の返却型は `Date | null` のまま。実際に非 null であることを narrow する。
      if (!registration.waitlistedAt) {
        throw new DomainError(
          "キャンセル待ちの登録に失敗しました",
          "UNEXPECTED",
        );
      }

      return {
        registration: {
          id: registration.id,
          waitlistedAt: registration.waitlistedAt,
        },
        event: { title: event.title, slug: event.slug },
      };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * Offer the next waitlist entry for a (slotId, ticketId) pair.
 * Called inside a transaction that already holds advisory lock 728350 (event registration
 * namespace) — the caller (registerWaitlistEntryCommand's own tx, or
 * applyEventRegistrationCancellation's tx) is responsible for acquiring it first.
 *
 * Selection: FIFO by waitlistedAt ASC. Atomic claim via updateMany WHERE status=WAITLISTED
 * (二重昇格防止: 同時に 2 箇所から呼ばれても updateMany の atomic UPDATE で片方しか claim できない)。
 * Returns null if no candidate exists, or if the claim lost a race.
 *
 * tx パラメータは interactive transaction 全体の型を要求せず、実際に使うメソッドだけを
 * 構造的に宣言する（`ApplyEventRegistrationCancellationTx` と同じ最小構造型パターン）。
 * これにより registration-cancel-core.ts 側の tx 型を local 拡張するだけで、この関数を
 * 追加の型変換なしにそのまま呼び出せる。
 */
export async function offerNextWaitlistEntryCommand(
  tx: {
    readonly eventRegistration: {
      findFirst(args: object): Promise<{
        id: string;
        email: string | null;
      } | null>;
      updateMany(args: object): Promise<{ count: number }>;
      findUnique(args: object): Promise<{
        id: string;
        email: string | null;
        offeredAt: Date | null;
        expiresAt: Date | null;
      } | null>;
    };
  },
  args: {
    slotId: string;
    ticketId: string;
    now: Date;
    offerTtlMs?: number;
  },
): Promise<{
  promoted: null | {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  };
}> {
  const ttl = args.offerTtlMs ?? OFFER_TTL_MS;
  const expiresAt = new Date(args.now.getTime() + ttl);

  // Pick FIFO head candidate (advisory 依存: 上位 tx 内 728350 のもとで一貫)
  const candidate = await tx.eventRegistration.findFirst({
    where: {
      slotId: args.slotId,
      ticketId: args.ticketId,
      status: RegistrationStatus.WAITLISTED,
    },
    orderBy: { waitlistedAt: "asc" },
    select: { id: true, email: true },
  });
  if (!candidate) return { promoted: null };

  // Atomic claim (二重昇格防止)
  const claim = await tx.eventRegistration.updateMany({
    where: {
      id: candidate.id,
      status: RegistrationStatus.WAITLISTED,
    },
    data: {
      status: RegistrationStatus.WAITLISTED_OFFERED,
      offeredAt: args.now,
      expiresAt,
    },
  });
  if (claim.count === 0) return { promoted: null };

  return {
    promoted: {
      id: candidate.id,
      email: candidate.email,
      offeredAt: args.now,
      expiresAt,
    },
  };
}

/**
 * Confirm a WAITLISTED_OFFERED entry as CONFIRMED after payment or click-through.
 * Rechecks capacity because between offer and confirm, another registration may have arrived.
 */
export async function confirmWaitlistOfferCommand(data: {
  registrationId: string;
  expectedCustomerId?: string | null;
  /**
   * Forward-compatible field: reserved for guest-verification symmetry with
   * `cancelEventRegistrationByToken`. Not wired into any logic yet (Task 5+).
   */
  tokenFingerprint?: string;
  now: Date;
}): Promise<{
  registration: { id: string; status: "CONFIRMED" | "EXPIRED" };
}> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.eventRegistration.findFirst({
        where: {
          id: data.registrationId,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          ...(data.expectedCustomerId !== undefined
            ? { customerId: data.expectedCustomerId }
            : {}),
        },
        select: {
          id: true,
          eventId: true,
          slotId: true,
          quantity: true,
          expiresAt: true,
        },
      });
      if (!target)
        throw new DomainError(
          "対象の繰り上げ当選申込が見つかりません",
          "NOT_FOUND",
        );
      if (
        !target.expiresAt ||
        target.expiresAt.getTime() < data.now.getTime()
      ) {
        // Race: expired between findFirst と now、または期限切れ
        const expiredClaim = await tx.eventRegistration.updateMany({
          where: {
            id: target.id,
            status: RegistrationStatus.WAITLISTED_OFFERED,
          },
          data: {
            status: RegistrationStatus.EXPIRED,
          },
        });
        if (expiredClaim.count === 0)
          throw new DomainError("既に他の処理が完了しています", "CONFLICT");
        return { registration: { id: target.id, status: "EXPIRED" as const } };
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${target.eventId}))`;

      // Capacity 再判定 (offer 中に別の CONFIRMED が入っていないか)
      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: target.slotId },
        select: { capacity: true },
      });
      if (!slot)
        throw new DomainError("タイムスロットが見つかりません", "NOT_FOUND");

      const confirmedSum = await tx.eventRegistration.aggregate({
        where: { slotId: target.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });
      const remaining = slot.capacity - (confirmedSum._sum.quantity ?? 0);
      if (target.quantity > remaining) {
        // 空きが再度消失 → EXPIRED 化 → 呼び出し側で再度 waitlist に戻すか案内
        const claim = await tx.eventRegistration.updateMany({
          where: {
            id: target.id,
            status: RegistrationStatus.WAITLISTED_OFFERED,
          },
          data: { status: RegistrationStatus.EXPIRED },
        });
        if (claim.count === 0)
          throw new DomainError("既に他の処理が完了しています", "CONFLICT");
        return { registration: { id: target.id, status: "EXPIRED" as const } };
      }

      const claim = await tx.eventRegistration.updateMany({
        where: {
          id: target.id,
          status: RegistrationStatus.WAITLISTED_OFFERED,
        },
        data: {
          status: RegistrationStatus.CONFIRMED,
        },
      });
      if (claim.count === 0)
        throw new DomainError("既に他の処理が完了しています", "CONFLICT");

      return { registration: { id: target.id, status: "CONFIRMED" as const } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * Explicitly expire a WAITLISTED_OFFERED entry (called from cron / admin manual expire).
 * Idempotent: returns `{registration: null}` if the entry is no longer in OFFERED state.
 */
export async function expireWaitlistOfferCommand(data: {
  registrationId: string;
  now: Date;
}): Promise<{ registration: { id: string; status: "EXPIRED" } | null }> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.eventRegistration.findFirst({
        where: {
          id: data.registrationId,
          status: RegistrationStatus.WAITLISTED_OFFERED,
        },
        select: { id: true, eventId: true },
      });
      if (!target) return { registration: null };

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${target.eventId}))`;

      const claim = await tx.eventRegistration.updateMany({
        where: {
          id: target.id,
          status: RegistrationStatus.WAITLISTED_OFFERED,
        },
        data: { status: RegistrationStatus.EXPIRED },
      });
      if (claim.count === 0) return { registration: null };

      return { registration: { id: target.id, status: "EXPIRED" as const } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

export const WAITLIST_OFFER_TTL_MS = OFFER_TTL_MS;
