import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { ensureCustomerNotBlacklisted } from "@/shared/domain/customers/guard";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import {
  WAITLIST_XACT_LOCK_NAMESPACE,
  tryAcquireWaitlistPromoteSessionLock,
  releaseWaitlistPromoteSessionLock,
} from "./waitlist-locks";

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

      const expiresAt = new Date(data.now.getTime() + OFFER_TTL_MS);

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

/**
 * Explicitly expire a WAITLISTED_OFFERED entry (called from cron / admin manual expire).
 * Idempotent: returns `{registration: null}` if the entry is no longer in OFFERED state.
 *
 * `email` / `name` は admin 手動 expire の呼び出し元
 * (`adminExpireWaitlistOfferAction`) が `sendEventWaitlistExpired` 送信 / toast 表示に
 * 必要とするため select に含める。tx 内で既に読んでいる行に列を足すだけで追加の
 * DB round-trip は発生しない。
 */
export async function expireWaitlistOfferCommand(data: {
  registrationId: string;
  now: Date;
}): Promise<{
  registration: {
    id: string;
    status: "EXPIRED";
    email: string | null;
    name: string;
  } | null;
}> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.eventRegistration.findFirst({
        where: {
          id: data.registrationId,
          status: RegistrationStatus.WAITLISTED_OFFERED,
        },
        select: { id: true, eventId: true, email: true, name: true },
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

      return {
        registration: {
          id: target.id,
          status: "EXPIRED" as const,
          email: target.email,
          name: target.name,
        },
      };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * cron `/api/cron/waitlist-expire` 用: 1 event 分の「期限切れ WAITLISTED_OFFERED を
 * EXPIRED 化 → 空いた (slotId, ticketId) 枠に次の WAITLISTED を FIFO promote」を
 * まとめて処理する。呼び出し側 (route.ts) は候補を eventId でグルーピングし、
 * event ごとにこの関数を呼ぶ。
 *
 * **advisory lock の二重使い分け**（`.claude/rules/business-domain.md` 「Waitlist FIFO
 * promote」節 / `waitlist-locks.ts` の JSDoc と同じ契約）:
 * - 728354 (`WAITLIST_PROMOTE_LOCK_NAMESPACE`, session lock): この event の走査
 *   バッチ全体を他プロセス（別 cron 起動・手動再実行の重複）と直列化する。session
 *   lock は物理 connection scope のため、acquire ($transaction 開始直後) → 全
 *   candidate 処理 → release (finally) を **同一 $transaction コールバック**
 *   (= 同一物理 connection) に閉じるのが呼び出し側の責務。この関数はその契約を
 *   自己完結させる（tx を外に漏らさない）。
 * - 728350 (`WAITLIST_XACT_LOCK_NAMESPACE`, xact lock): candidate ごとに
 *   `registerWaitlistEntryCommand` / `applyEventRegistrationCancellation` と
 *   同じ namespace を再取得し、通常の申込・キャンセル経路と直列化する。728354
 *   の内側にネストしても namespace が異なるため自己デッドロックしない。
 *
 * EXPIRED 遷移は `updateMany` の WHERE (id + status:WAITLISTED_OFFERED +
 * expiresAt<now + **paymentStatus not PENDING**) で atomic claim する。
 * `paymentStatus: {not: PENDING}` (Codex review Critical #1, defense-in-depth
 * #2): Stripe checkout session が live（決済処理中）の行は EXPIRED 化しない。
 * 呼び出し側 `findExpiredWaitlistOfferCandidates` の select 時点で同じ条件で
 * 既に除外しているが、その query 実行からこの updateMany 到達までの間に顧客が
 * checkout を開始して paymentStatus が UNPAID/FAILED → PENDING に遷移する race
 * を塞ぐため、claim 直前でも同じガードを再 assert する。除外しないと「cron が
 * offer を先に EXPIRED 化 → 直後に顧客が Stripe 決済を完了」というレースで
 * money captured なのに `confirmWaitlistOfferCommand` が WAITLISTED_OFFERED を
 * 見つけられず webhook 側が severity LOW で静かに skip する事故になる。
 * PENDING の行は webhook handler（`checkout.session.completed` /
 * `async_payment_succeeded` / `expired` / `async_payment_failed`）が確定 or
 * 失敗させるまでそのまま残し、cron の対象にはしない。claim できなかった
 * candidate (`confirmWaitlistOfferCommand` 等の別経路が先に処理済みの race、
 * または上記 PENDING 除外) は黙って skip する。claim できた場合のみ同じ tx 内で
 * `offerNextWaitlistEntryCommand` を呼び FIFO promote を試みる（`promoted: null`
 * = 待機者なし、は正常系）。
 *
 * session lock を獲得できなかった場合（他プロセスがこの event を処理中）は
 * 空の結果を返して commit する。保持していないロックを release してはいけない
 * ため、その場合は release も呼ばない。
 */
export async function expireAndPromoteWaitlistForEventCommand(args: {
  eventId: string;
  candidates: readonly {
    id: string;
    slotId: string;
    ticketId: string;
    name: string;
    email: string | null;
  }[];
  now: Date;
}): Promise<{
  expired: { id: string; name: string; email: string | null }[];
  offered: {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  }[];
}> {
  return prisma.$transaction(
    async (tx) => {
      const expired: { id: string; name: string; email: string | null }[] = [];
      const offered: {
        id: string;
        email: string | null;
        offeredAt: Date;
        expiresAt: Date;
      }[] = [];

      const acquired = await tryAcquireWaitlistPromoteSessionLock(
        tx,
        args.eventId,
      );
      if (!acquired) {
        return { expired, offered };
      }

      try {
        for (const candidate of args.candidates) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${args.eventId}))`;

          const claim = await tx.eventRegistration.updateMany({
            where: {
              id: candidate.id,
              status: RegistrationStatus.WAITLISTED_OFFERED,
              expiresAt: { lt: args.now },
              // Codex review Critical #1 (defense-in-depth #2) — JSDoc 上部参照
              paymentStatus: { not: PaymentStatus.PENDING },
            },
            data: { status: RegistrationStatus.EXPIRED },
          });
          if (claim.count === 0) continue;

          expired.push({
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
          });

          const { promoted } = await offerNextWaitlistEntryCommand(tx, {
            slotId: candidate.slotId,
            ticketId: candidate.ticketId,
            now: args.now,
          });
          if (promoted) offered.push(promoted);
        }
      } finally {
        await releaseWaitlistPromoteSessionLock(tx, args.eventId);
      }

      return { expired, offered };
    },
    // 1 event に複数 candidate が溜まるケース（長時間 cron 未実行後の初回実行等）を
    // 見込み、単発コマンド (5s/10s) より余裕を持たせる。
    { maxWait: 5000, timeout: 20000 },
  );
}

export const WAITLIST_OFFER_TTL_MS = OFFER_TTL_MS;
