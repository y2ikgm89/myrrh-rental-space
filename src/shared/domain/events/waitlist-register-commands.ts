import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  EventStatus,
  RegistrationStatus,
  TERMS_SCOPE,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "./waitlist-locks";
import { WAITLIST_OFFER_TTL_MS } from "./waitlist-offer-constants";
import { recordTermsAgreements } from "@/shared/domain/terms/commands";

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
  /**
   * 同意済み規約 ID。waitlist 登録と同一 tx 内で TermsAgreement を記録する
   * （通常申込経路と同契約。キャンセル待ちフォームも EVENT_REGISTRATION scope）。
   */
  agreedTermsIds?: readonly string[] | undefined;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
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

      // TermsAgreement は waitlist 行と同じ tx で記録する（失敗時は登録ごと rollback）。
      if (data.agreedTermsIds && data.agreedTermsIds.length > 0) {
        await recordTermsAgreements({
          scope: TERMS_SCOPE.EVENT_REGISTRATION,
          agreements: data.agreedTermsIds.map((termsId) => ({ termsId })),
          resourceId: registration.id,
          customerId: data.customerId ?? null,
          guestEmail: data.customerId ? null : data.email,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          tx,
        });
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
      const resolveConcurrentWaitlistOfferOutcome = async (
        registrationId: string,
      ): Promise<{
        registration: { id: string; status: "CONFIRMED" | "EXPIRED" };
      } | null> => {
        const current = await tx.eventRegistration.findUnique({
          where: { id: registrationId },
          select: { status: true },
        });
        if (!current) return null;
        if (current.status === RegistrationStatus.EXPIRED) {
          return {
            registration: { id: registrationId, status: "EXPIRED" as const },
          };
        }
        if (current.status === RegistrationStatus.CONFIRMED) {
          return {
            registration: { id: registrationId, status: "CONFIRMED" as const },
          };
        }
        return null;
      };

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
          ticketId: true,
          quantity: true,
          expiresAt: true,
          // Codex P1-B: per-ticket capacity recheck 用（下記参照）
          ticket: { select: { capacity: true } },
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
        if (expiredClaim.count === 0) {
          const resolved = await resolveConcurrentWaitlistOfferOutcome(
            target.id,
          );
          if (resolved) return resolved;
          throw new DomainError("既に他の処理が完了しています", "CONFLICT");
        }
        return { registration: { id: target.id, status: "EXPIRED" as const } };
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${target.eventId}))`;

      // 通常申込 (createEventRegistrationCommand) と同じ event / slot ゲートを
      // offer 確定時にも再検証する。offer 発行後に下書き化・受付停止・締切超過・
      // スロット削除が起きても、ここで黙って CONFIRMED 化しない。
      //
      // 履行不能ゲート（受付停止・締切超過・イベント非公開/削除・スロット欠落）は
      // capacity race と同型で WAITLISTED_OFFERED → EXPIRED に原子遷移し、
      // `{ status: "EXPIRED" }` を返す。DomainError を投げると Stripe webhook が
      // claim に fall through して自動返金が走らず money captured のまま残る。
      // claim count===0 は同時処理で既に EXPIRED/CONFIRMED 化済みの可能性が高いため
      // 再読込して structured result を返す（真の不整合だけ CONFLICT）。
      const expireUnfulfillableOffer = async () => {
        const claim = await tx.eventRegistration.updateMany({
          where: {
            id: target.id,
            status: RegistrationStatus.WAITLISTED_OFFERED,
          },
          data: { status: RegistrationStatus.EXPIRED },
        });
        if (claim.count === 0) {
          const resolved = await resolveConcurrentWaitlistOfferOutcome(
            target.id,
          );
          if (resolved) return resolved;
          throw new DomainError("既に他の処理が完了しています", "CONFLICT");
        }
        return {
          registration: { id: target.id, status: "EXPIRED" as const },
        };
      };

      const event = await tx.event.findFirst({
        where: {
          id: target.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: {
          id: true,
          registrationOpen: true,
          registrationDeadline: true,
        },
      });
      if (!event) return expireUnfulfillableOffer();
      if (!event.registrationOpen) return expireUnfulfillableOffer();

      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: target.slotId },
        select: {
          capacity: true,
          eventId: true,
          startAt: true,
        },
      });
      if (!slot || slot.eventId !== target.eventId)
        return expireUnfulfillableOffer();

      const deadline = event.registrationDeadline ?? slot.startAt;
      if (data.now.getTime() > deadline.getTime())
        return expireUnfulfillableOffer();

      // Capacity 再判定 (offer 中に別の CONFIRMED が入っていないか)

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
        if (claim.count === 0) {
          const resolved = await resolveConcurrentWaitlistOfferOutcome(
            target.id,
          );
          if (resolved) return resolved;
          throw new DomainError("既に他の処理が完了しています", "CONFLICT");
        }
        return { registration: { id: target.id, status: "EXPIRED" as const } };
      }

      // Codex P1-B (PR#1080 レビュー): スロット全体の容量チェックだけでは、
      // waitlist の発生原因が per-ticket 容量 (EventTicket.capacity) だった
      // ケースを見落とす。offer 中に別の通常申込がこのチケット種別の最後の枠を
      // CONFIRMED で消費していると、スロット全体には空きがあっても対象チケット
      // は実質満員 — createEventRegistrationCommand / registerWaitlistEntryCommand
      // の per-ticket capacity 判定と対になるチェックをここでも行う
      // (ticket.capacity が null = 無制限のチケットは対象外)。
      if (target.ticket.capacity != null) {
        const ticketConfirmed = await tx.eventRegistration.aggregate({
          where: {
            slotId: target.slotId,
            ticketId: target.ticketId,
            status: RegistrationStatus.CONFIRMED,
          },
          _sum: { quantity: true },
        });
        const ticketRemaining =
          target.ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
        if (target.quantity > ticketRemaining) {
          // スロット全体の判定と同じ EXPIRED 遷移（上のブロックと同型）。
          const claim = await tx.eventRegistration.updateMany({
            where: {
              id: target.id,
              status: RegistrationStatus.WAITLISTED_OFFERED,
            },
            data: { status: RegistrationStatus.EXPIRED },
          });
          if (claim.count === 0) {
            const resolved = await resolveConcurrentWaitlistOfferOutcome(
              target.id,
            );
            if (resolved) return resolved;
            throw new DomainError("既に他の処理が完了しています", "CONFLICT");
          }
          return {
            registration: { id: target.id, status: "EXPIRED" as const },
          };
        }
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
      if (claim.count === 0) {
        const resolved = await resolveConcurrentWaitlistOfferOutcome(target.id);
        if (resolved) return resolved;
        throw new DomainError("既に他の処理が完了しています", "CONFLICT");
      }

      return { registration: { id: target.id, status: "CONFIRMED" as const } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * 管理画面から特定の WAITLISTED 申込を手動で繰り上げ当選 (WAITLISTED_OFFERED) にする。
 *
 * `offerNextWaitlistEntryCommand` は「呼び出し側が既に advisory lock 728350 を保持する
 * 外側 tx の中で、(slotId, ticketId) の FIFO 先頭を自動選定する」設計（キャンセル直後の
 * 自動繰り上げ専用）。管理者の手動操作は (1) 任意の特定 registrationId を対象にする
 * (2) 外側 tx を持たない独立呼び出し、という 2 点で前提が異なるため専用コマンドとして
 * 分離する（`expireWaitlistOfferCommand` と同型: 対象 ID から eventId を読んで解決し、
 * 事前チェック読み取り → advisory lock → updateMany WHERE claim の順で処理する）。
 *
 * Idempotent: 対象が既に WAITLISTED_OFFERED（他の操作者が先に昇格させた）の場合は
 * 新規処理をせず既存の offer 情報を返す（`alreadyOffered: true`）。手動操作の UX 上、
 * 同時操作で失敗表示になるのは避けたい。CANCELLED / EXPIRED / CONFIRMED など終端 or
 * 別状態の場合は CONFLICT を throw する（ユーザー起因のミス操作として扱う）。
 *
 * 容量 (capacity) の再チェックはしない。`offerNextWaitlistEntryCommand` も同様に
 * 容量チェックをしない設計（1 キャンセル = 1 offer で収支が保たれる前提）。管理者の
 * 手動 promote は意図的なオーバーライド操作のため、BlockedDate の admin 経路が
 * `ensureDateNotBlocked` を意図的に呼ばないのと同じ思想で容量チェックを行わない。
 */
export async function adminPromoteWaitlistEntryCommand(data: {
  registrationId: string;
  now: Date;
}): Promise<{
  promoted: {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  };
  /** true = 対象は呼び出し前から既に WAITLISTED_OFFERED だった（冪等 no-op） */
  alreadyOffered: boolean;
}> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.eventRegistration.findUnique({
        where: { id: data.registrationId },
        select: {
          id: true,
          eventId: true,
          email: true,
          status: true,
          offeredAt: true,
          expiresAt: true,
        },
      });
      if (!target)
        throw new DomainError("対象の申込が見つかりません", "NOT_FOUND");

      if (target.status === RegistrationStatus.WAITLISTED_OFFERED) {
        // offeredAt/expiresAt は WAITLISTED_OFFERED への遷移と同時にのみ設定される
        // 不変条件のため非 null のはずだが、select 型は nullable のまま届くため narrow する。
        if (!target.offeredAt || !target.expiresAt) {
          throw new DomainError(
            "繰り上げ当選情報の取得に失敗しました",
            "UNEXPECTED",
          );
        }
        return {
          promoted: {
            id: target.id,
            email: target.email,
            offeredAt: target.offeredAt,
            expiresAt: target.expiresAt,
          },
          alreadyOffered: true,
        };
      }

      if (target.status !== RegistrationStatus.WAITLISTED) {
        throw new DomainError(
          "この申込はキャンセル待ち状態ではありません",
          "CONFLICT",
        );
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${target.eventId}))`;

      const expiresAt = new Date(data.now.getTime() + WAITLIST_OFFER_TTL_MS);

      // Atomic claim (二重昇格防止): WHERE に id + status: WAITLISTED の両方が揃って
      // いないと、race で 2 箇所から呼ばれたときに同じ対象を二重に昇格させてしまう。
      const claim = await tx.eventRegistration.updateMany({
        where: { id: target.id, status: RegistrationStatus.WAITLISTED },
        data: {
          status: RegistrationStatus.WAITLISTED_OFFERED,
          offeredAt: data.now,
          expiresAt,
        },
      });

      if (claim.count === 0) {
        // Race: 事前チェック読み取り後、lock 取得までの間に別操作者（cron の EXPIRED 化
        // や別 admin の promote）が先に状態を変えた。再取得して idempotent 成功 or
        // CONFLICT を判定する。
        const recheck = await tx.eventRegistration.findUnique({
          where: { id: target.id },
          select: {
            id: true,
            email: true,
            status: true,
            offeredAt: true,
            expiresAt: true,
          },
        });
        if (
          recheck?.status === RegistrationStatus.WAITLISTED_OFFERED &&
          recheck.offeredAt &&
          recheck.expiresAt
        ) {
          return {
            promoted: {
              id: recheck.id,
              email: recheck.email,
              offeredAt: recheck.offeredAt,
              expiresAt: recheck.expiresAt,
            },
            alreadyOffered: true,
          };
        }
        throw new DomainError("既に他の処理が完了しています", "CONFLICT");
      }

      return {
        promoted: {
          id: target.id,
          email: target.email,
          offeredAt: data.now,
          expiresAt,
        },
        alreadyOffered: false,
      };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
