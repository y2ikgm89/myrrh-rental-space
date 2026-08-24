import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  WAITLIST_XACT_LOCK_NAMESPACE,
  tryAcquireWaitlistPromoteLease,
  releaseWaitlistPromoteLease,
} from "./waitlist-locks";
import { WAITLIST_OFFER_TTL_MS } from "./waitlist-offer-constants";

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
      findFirst(args: {
        where: Prisma.EventRegistrationWhereInput;
        orderBy?: Prisma.EventRegistrationOrderByWithRelationInput;
        select: Prisma.EventRegistrationSelect;
      }): Promise<{
        id: string;
        email: string | null;
      } | null>;
      updateMany(args: {
        where: Prisma.EventRegistrationWhereInput;
        data: Prisma.EventRegistrationUncheckedUpdateManyInput;
      }): Promise<{ count: number }>;
      findUnique(args: {
        where: Prisma.EventRegistrationWhereUniqueInput;
        select: Prisma.EventRegistrationSelect;
      }): Promise<{
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
  const ttl = args.offerTtlMs ?? WAITLIST_OFFER_TTL_MS;
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
 * Explicitly expire a WAITLISTED_OFFERED entry (called from admin manual expire only —
 * the cron path uses {@link expireAndPromoteWaitlistForEventCommand} instead).
 * Idempotent: returns `{registration: null}` if the entry is no longer in OFFERED state.
 *
 * `email` / `name` は admin 手動 expire の呼び出し元
 * (`adminExpireWaitlistOfferAction`) が `sendEventWaitlistExpired` 送信 / toast 表示に
 * 必要とするため select に含める。tx 内で既に読んでいる行に列を足すだけで追加の
 * DB round-trip は発生しない。
 *
 * Codex P1-C (PR#1080 レビュー): 対象が `paymentStatus: PENDING`（Stripe checkout
 * 進行中）の場合は `DomainError("CONFLICT")` を throw し、EXPIRED 化を拒否する。
 * cron 側 (`expireAndPromoteWaitlistForEventCommand`) は Codex review Critical #1
 * (defense-in-depth #2) で既にこのガードを持つが、admin 手動経路にはこれまで
 * 存在しなかった。admin が決済処理中の offer を EXPIRED 化すると、後続の
 * `checkout.session.completed` webhook が呼ぶ `confirmWaitlistOfferCommand` は
 * `status: WAITLISTED_OFFERED` を要求するため対象を見つけられず confirm できない
 * （money captured / 確認不能の orphan payment）。throw は
 * `prisma.$transaction` コールバック内で行う（`confirmWaitlistOfferCommand` /
 * `adminPromoteWaitlistEntryCommand` と同じ本ファイルの既存方針。
 * `cancelEventRegistrationWithClaim`（registration-cancel-core 経由）が
 * tx 内 throw を避けているのは高頻度な顧客操作向けの別事情で、低頻度な admin
 * 単発操作であるこの関数には適用しない）。
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
        select: {
          id: true,
          eventId: true,
          email: true,
          name: true,
          paymentStatus: true,
        },
      });
      if (!target) return { registration: null };

      if (target.paymentStatus === PaymentStatus.PENDING) {
        throw new DomainError(
          "決済処理中の繰り上げ当選は期限切れにできません。Stripeダッシュボードで決済セッションをキャンセルしてから再度お試しください。",
          "CONFLICT",
        );
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${target.eventId}))`;

      const claim = await tx.eventRegistration.updateMany({
        where: {
          id: target.id,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          // pre-check (上) と claim の間で顧客が checkout を開始する race を
          // 塞ぐ defense-in-depth（cron 側と同じ二重ガード方針）。
          paymentStatus: { not: PaymentStatus.PENDING },
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
 * **ロックの二重使い分け**（`waitlist-locks.ts` の JSDoc と同じ契約）:
 * - row lease (`events.waitlist_promote_leased_until`): この event の走査
 *   バッチ全体を他プロセス（別 cron 起動・手動再実行の重複）と直列化する。
 *   `UPDATE ... WHERE` で原子的に取得し、TTL で自己回復する。acquire / release
 *   は作業 ITX の外（`prisma`）で行い、ITX timeout 後の P2028 に依存しない。
 * - 728350 (`WAITLIST_XACT_LOCK_NAMESPACE`, xact lock): candidate ごとに
 *   `registerWaitlistEntryCommand` / `applyEventRegistrationCancellation` と
 *   同じ namespace を再取得し、通常の申込・キャンセル経路と直列化する。
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
 * lease を獲得できなかった場合（他プロセスがこの event を処理中）は
 * 空の結果を返す。保持していない lease を release してはいけないため、
 * その場合は release も呼ばない。
 */
type ExpireAndPromoteResult = {
  expired: { id: string; name: string; email: string | null }[];
  offered: {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  }[];
};

/**
 * 1 event の ITX に載せる candidate 上限。
 * 長時間 cron 停止後の初回で無制限に積むと 20s timeout で全件 ROLLBACK し、
 * バックログが永久に消化されない（監査 N-07）。残りは次 cron で処理する。
 */
export const WAITLIST_EXPIRE_CANDIDATE_BATCH = 25;

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
}): Promise<ExpireAndPromoteResult> {
  const candidates = args.candidates.slice(0, WAITLIST_EXPIRE_CANDIDATE_BATCH);
  const empty: ExpireAndPromoteResult = {
    expired: [],
    offered: [],
  };

  // リースの基準は**このイベントの処理を始める瞬間**（監査 A-64）。
  //
  // 以前は `args.now`（cron リクエスト先頭で 1 回だけ取った時刻）を渡していたため、
  // イベントを 1 件処理するごとに残り TTL が削られ、2 件目以降は
  // 「作業 tx の timeout (20s) より短いリース」になりうた。
  // TTL 30s の根拠（`waitlist-locks.ts`）は取得時刻基準でなければ成立しない。
  //
  // `args.now` は候補判定の述語（`expiresAt < now`）専用に残す —
  // そちらは古い方が保守的で正しい。
  const leasedUntil = await tryAcquireWaitlistPromoteLease(
    prisma,
    args.eventId,
  );
  if (leasedUntil === null) {
    return empty;
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const expired: { id: string; name: string; email: string | null }[] =
          [];
        const offered: {
          id: string;
          email: string | null;
          offeredAt: Date;
          expiresAt: Date;
        }[] = [];

        for (const candidate of candidates) {
          // 1 candidate の処理を savepoint（Prisma のネスト $transaction）に
          // 隔離する。savepoint を使わず tx を直接 abort させると、Postgres は
          // トランザクションを aborted 状態にし、以降の candidate が 25P02 で
          // 失敗する（waitlist-session-lock-leak.test.ts が回帰ガード）。
          try {
            const result = await tx.$transaction(async (tx2) => {
              await tx2.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${args.eventId}))`;

              const claim = await tx2.eventRegistration.updateMany({
                where: {
                  id: candidate.id,
                  status: RegistrationStatus.WAITLISTED_OFFERED,
                  expiresAt: { lt: args.now },
                  // Codex review Critical #1 (defense-in-depth #2) — JSDoc 上部参照
                  paymentStatus: { not: PaymentStatus.PENDING },
                },
                data: { status: RegistrationStatus.EXPIRED },
              });
              if (claim.count === 0) return null;

              return offerNextWaitlistEntryCommand(tx2, {
                slotId: candidate.slotId,
                ticketId: candidate.ticketId,
                now: args.now,
              });
            });

            if (result === null) continue;
            expired.push({
              id: candidate.id,
              name: candidate.name,
              email: candidate.email,
            });
            if (result.promoted) offered.push(result.promoted);
          } catch (candidateError) {
            // savepoint rollback 済み（このcandidateの書込みのみ取消）。
            // 次回 cron 実行で再試行されるため、ここで batch 全体を止めない。
            logError(normalizeError(candidateError), {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.MEDIUM,
              context: {
                operation: "expireAndPromoteWaitlistForEventCommand",
                eventId: args.eventId,
                registrationId: candidate.id,
              },
            });
          }
        }

        return { expired, offered };
      },
      // 1 event に複数 candidate が溜まるケース（長時間 cron 未実行後の初回実行等）を
      // 見込み、単発コマンド (5s/10s) より余裕を持たせる。
      { maxWait: 5000, timeout: 20000 },
    );
  } finally {
    await releaseWaitlistPromoteLease(prisma, args.eventId, leasedUntil);
  }
}

/** 1 回の backfill で 1 組あたり offer する上限（ITX を短く保つ）。 */
const WAITLIST_BACKFILL_MAX_PER_GROUP = 20;

export type WaitlistBackfillResult = {
  readonly offered: readonly {
    id: string;
    email: string | null;
    offeredAt: Date;
    expiresAt: Date;
  }[];
};

/**
 * 空いている席の数だけキャンセル待ちを FIFO で offer する（backfill）。
 *
 * ## なぜ要るのか
 *
 * 既存の繰り上げは「1 イベントにつき 1 件」しか出さない。
 * `quantity: 3` の申込がキャンセルされると 3 席空くのに offer は 1 件で、
 * **残り 2 席は次のキャンセルが来るまで誰にも案内されない**。
 * `waitlist-expire` cron も期限切れ offer にしか反応しないので拾えない。
 *
 * この関数は原因を問わず「いま空いている席」を見るので、キャンセル・
 * 未払い期限切れ・管理者の定員引き上げ・手動 expire のどれで空いても効く。
 *
 * ## 空き席の数え方
 *
 * `capacity - CONFIRMED の quantity 合計 - WAITLISTED_OFFERED の quantity 合計`。
 *
 * **未処理の offer を差し引くのが要点。** DB の定員トリガー
 * （`assert_event_capacity_not_exceeded`）は `CONFIRMED` しか数えないので、
 * offer 中の席は DB 上「空き」に見える。差し引かないと同じ席を二重に案内し、
 * 全員が確定した瞬間に定員トリガーが最後の 1 人を弾く
 * ——「当選しました」と伝えた相手が確定時にエラーになる。
 *
 * スロット定員とチケット定員の両方を見て、小さいほうを採る。
 *
 * ## 数量が収まらない人は飛ばさず止める
 *
 * FIFO 先頭の `quantity` が残り空席を超えたら、そこで打ち切る。飛ばして
 * 後ろの小さい申込を先に案内すると「順番にご案内しています」が嘘になる。
 * 大人数の待機者は、その人数ぶん空くまで先頭のまま待つ。
 *
 * ## ロック
 *
 * 呼び出しごとに event 単位の行リースを取り、ITX 内で advisory xact lock
 * 728350 を取る（`expireAndPromoteWaitlistForEventCommand` と同じ規律）。
 * `offerNextWaitlistEntryCommand` は「空いた枠に 1 件」を前提とする別契約
 * （空き容量を数えない）なので再利用せず、claim を直接書いている。
 * 二重昇格の防止は同じ `updateMany WHERE status=WAITLISTED` で行う。
 */
export async function offerWaitlistUpToCapacityForEventCommand(args: {
  eventId: string;
  groups: readonly { slotId: string; ticketId: string }[];
  now: Date;
}): Promise<WaitlistBackfillResult> {
  const empty: WaitlistBackfillResult = { offered: [] };
  if (args.groups.length === 0) return empty;

  const leasedUntil = await tryAcquireWaitlistPromoteLease(
    prisma,
    args.eventId,
  );
  if (leasedUntil === null) return empty;

  try {
    return await prisma.$transaction(
      async (tx) => {
        const offered: {
          id: string;
          email: string | null;
          offeredAt: Date;
          expiresAt: Date;
        }[] = [];

        for (const group of args.groups) {
          // 1 組の失敗で batch 全体を落とさない（expire 側と同じ savepoint 分離）。
          try {
            const groupOffers = await tx.$transaction(async (tx2) => {
              await tx2.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${args.eventId}))`;

              const slot = await tx2.eventTimeSlot.findUnique({
                where: { id: group.slotId },
                select: { capacity: true },
              });
              if (!slot) return [];

              const ticket = await tx2.eventTicket.findUnique({
                where: { id: group.ticketId },
                select: { capacity: true },
              });
              if (!ticket) return [];

              // interactive transaction は単一コネクションなので並行クエリ不可。
              // 逐次 await する（`registerWaitlistEntryCommand` と同じ制約）。
              const slotConfirmed = await tx2.eventRegistration.aggregate({
                where: {
                  slotId: group.slotId,
                  status: RegistrationStatus.CONFIRMED,
                },
                _sum: { quantity: true },
              });
              const slotHeld = await tx2.eventRegistration.aggregate({
                where: {
                  slotId: group.slotId,
                  status: RegistrationStatus.WAITLISTED_OFFERED,
                },
                _sum: { quantity: true },
              });
              let free =
                slot.capacity -
                (slotConfirmed._sum.quantity ?? 0) -
                (slotHeld._sum.quantity ?? 0);

              if (ticket.capacity !== null) {
                const ticketConfirmed = await tx2.eventRegistration.aggregate({
                  where: {
                    slotId: group.slotId,
                    ticketId: group.ticketId,
                    status: RegistrationStatus.CONFIRMED,
                  },
                  _sum: { quantity: true },
                });
                const ticketHeld = await tx2.eventRegistration.aggregate({
                  where: {
                    slotId: group.slotId,
                    ticketId: group.ticketId,
                    status: RegistrationStatus.WAITLISTED_OFFERED,
                  },
                  _sum: { quantity: true },
                });
                const ticketFree =
                  ticket.capacity -
                  (ticketConfirmed._sum.quantity ?? 0) -
                  (ticketHeld._sum.quantity ?? 0);
                free = Math.min(free, ticketFree);
              }

              const claimed: {
                id: string;
                email: string | null;
                offeredAt: Date;
                expiresAt: Date;
              }[] = [];

              for (let i = 0; i < WAITLIST_BACKFILL_MAX_PER_GROUP; i++) {
                if (free <= 0) break;

                const head = await tx2.eventRegistration.findFirst({
                  where: {
                    slotId: group.slotId,
                    ticketId: group.ticketId,
                    status: RegistrationStatus.WAITLISTED,
                  },
                  orderBy: { waitlistedAt: "asc" },
                  select: { id: true, email: true, quantity: true },
                });
                if (!head) break;
                // 収まらないなら飛ばさず止める（FIFO の公平性）。
                if (head.quantity > free) break;

                const expiresAt = new Date(
                  args.now.getTime() + WAITLIST_OFFER_TTL_MS,
                );
                const claim = await tx2.eventRegistration.updateMany({
                  where: {
                    id: head.id,
                    status: RegistrationStatus.WAITLISTED,
                  },
                  data: {
                    status: RegistrationStatus.WAITLISTED_OFFERED,
                    offeredAt: args.now,
                    expiresAt,
                  },
                });
                if (claim.count === 0) break;

                claimed.push({
                  id: head.id,
                  email: head.email,
                  offeredAt: args.now,
                  expiresAt,
                });
                free -= head.quantity;
              }

              return claimed;
            });

            offered.push(...groupOffers);
          } catch (groupError) {
            logError(normalizeError(groupError), {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.MEDIUM,
              context: {
                operation: "offerWaitlistUpToCapacityForEventCommand",
                eventId: args.eventId,
                slotId: group.slotId,
                ticketId: group.ticketId,
              },
            });
          }
        }

        return { offered };
      },
      { maxWait: 5000, timeout: 20000 },
    );
  } finally {
    await releaseWaitlistPromoteLease(prisma, args.eventId, leasedUntil);
  }
}
