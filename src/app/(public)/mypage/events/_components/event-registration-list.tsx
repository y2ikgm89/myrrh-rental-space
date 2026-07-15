"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Stack } from "@/public/components/design-system/stack";
import { Badge } from "@/public/components/design-system/badge";
import { Button } from "@/public/components/design-system/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/public/components/design-system/dialog";
import { cancelEventRegistration } from "@/public/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import {
  CANCELLABLE_REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { isValidRegistrationStatus } from "@/shared/lib/validations/enums/guards";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { getAppUrl } from "@/shared/lib/constants";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/shared/components/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventRegistrationListItem {
  readonly id: string;
  readonly quantity: number;
  readonly status: string;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly waitlistedAt: string | null;
  readonly offeredAt: string | null;
  readonly expiresAt: string | null;
  readonly paymentStatus: string;
  readonly slotId: string;
  readonly ticketId: string;
  readonly event: {
    readonly id: string;
    readonly title: string;
    readonly slug: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly location: string | null;
    readonly status: string;
  };
}

interface EventRegistrationListProps {
  readonly registrations: readonly EventRegistrationListItem[];
  readonly emptyMessage: string;
  readonly showBrowseCta?: boolean;
  readonly turnstileSiteKey: string | null;
  /** RSC render 時点の ISO 時刻。WAITLISTED_OFFERED カウントダウンの hydration-safe な初期値算出に使う。 */
  readonly nowIso: string;
  /**
   * registrationId → Receipt.serialNo の対応表。発行済みの場合のみ含まれる。
   * 領収書 (適格請求書) ダウンロードリンクを出すかを決める。
   * Foundation gap analysis (2026-07-15) task #8。
   */
  readonly receiptSerialNoMap: Readonly<Record<string, string>>;
  /**
   * registrationId → FIFO waitlist 位置 (1-indexed) の対応表。
   * WAITLISTED / WAITLISTED_OFFERED の registration のみ含まれる。
   * event-waitlist-emails.ts の computeWaitlistPosition と同 SSoT
   * (WAITLIST_ACTIVE_STATUSES + waitlistedAt lte 自分)。
   */
  readonly waitlistPositionMap: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type BadgeVariant = "default" | "success" | "warning" | "info";

// public Badge は 4 variant のみ（admin の status-badges.tsx とは別 SSoT）。
// EXPIRED は CANCELLED と同じ "default"（終端・中立）に寄せる。
const REGISTRATION_STATUS_VARIANTS: Record<RegistrationStatus, BadgeVariant> = {
  [RegistrationStatus.CONFIRMED]: "success",
  [RegistrationStatus.CANCELLED]: "default",
  [RegistrationStatus.WAITLISTED]: "warning",
  [RegistrationStatus.WAITLISTED_OFFERED]: "info",
  [RegistrationStatus.EXPIRED]: "default",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventRegistrationList({
  registrations,
  emptyMessage,
  showBrowseCta = false,
  turnstileSiteKey,
  nowIso,
  receiptSerialNoMap,
  waitlistPositionMap,
}: EventRegistrationListProps) {
  if (registrations.length === 0) {
    return (
      <div className="space-y-4 py-12 text-center md:py-16">
        <p className="text-muted-foreground">{emptyMessage}</p>
        {showBrowseCta && (
          <Button
            variant="editorial"
            size="sm"
            href="/events"
            className="w-full sm:w-auto"
          >
            イベントを探す
          </Button>
        )}
      </div>
    );
  }

  return (
    <Stack gap="md">
      {registrations.map((registration) => (
        <EventRegistrationCard
          key={registration.id}
          registration={registration}
          turnstileSiteKey={turnstileSiteKey}
          nowIso={nowIso}
          receiptSerialNo={receiptSerialNoMap[registration.id] ?? null}
          waitlistPosition={waitlistPositionMap[registration.id] ?? null}
        />
      ))}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function EventRegistrationCard({
  registration,
  turnstileSiteKey,
  nowIso,
  receiptSerialNo,
  waitlistPosition,
}: {
  readonly registration: EventRegistrationListItem;
  readonly turnstileSiteKey: string | null;
  readonly nowIso: string;
  readonly receiptSerialNo: string | null;
  readonly waitlistPosition: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const status = isValidRegistrationStatus(registration.status)
    ? registration.status
    : null;

  // CANCELLABLE_REGISTRATION_STATUSES は意図的に狭い literal union 型のまま
  // export されている（registration-cancel-core.ts と同じ理由）ため `.includes()`
  // ではなく `.some()` で比較する。
  //
  // Codex P1-D (PR#1080 レビュー): WAITLISTED_OFFERED + paymentStatus: PENDING
  // （Stripe checkout 進行中）はキャンセル対象から除外する。顧客が checkout を
  // 開いた状態でこの画面からキャンセルすると、行が CANCELLED になり Stripe
  // session は生きたまま残る。決済が完了すると webhook の
  // `confirmWaitlistOfferCommand` は `status: WAITLISTED_OFFERED` を要求するため
  // 対象を見つけられず confirm できない（money captured / 確認不能の orphan
  // payment）。P1-C（admin 手動 expire の同種ガード）と対になる修正。
  const isPendingWaitlistOffer =
    status === RegistrationStatus.WAITLISTED_OFFERED &&
    registration.paymentStatus === PaymentStatus.PENDING;
  const canCancel =
    status !== null &&
    CANCELLABLE_REGISTRATION_STATUSES.some((s) => s === status) &&
    !isPendingWaitlistOffer;

  const handleConfirmCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelEventRegistration(
        registration.id,
        turnstileToken || undefined,
      );
      if (isMutationError(result)) {
        setError(result.error);
        turnstileRef.current?.reset();
      } else {
        setCancelDialogOpen(false);
        router.refresh();
      }
    });
  };

  const statusLabel = status
    ? REGISTRATION_STATUS_LABELS[status]
    : registration.status;
  const statusVariant: BadgeVariant = status
    ? REGISTRATION_STATUS_VARIANTS[status]
    : "default";

  return (
    <article
      aria-label={`${registration.event.title}の申込: ${statusLabel}`}
      className="border border-border p-4 sm:p-6"
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        {/* min-w-0 + break-words で長 title の overflow を防止し、
            Link 自体に min-h-11 を付けて 44px タップ標的を担保。 */}
        <Link
          href={`/events/${registration.event.slug}`}
          className="inline-flex min-h-11 min-w-0 items-center break-words text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
        >
          {registration.event.title}
        </Link>
        <Badge variant={statusVariant} className="shrink-0">
          {statusLabel}
        </Badge>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
        <div>
          <dt className="sr-only">日時</dt>
          <dd>
            {formatEventDateTimeRange(
              registration.event.startTime,
              registration.event.endTime,
            )}
          </dd>
        </div>
        {registration.event.location && (
          <div>
            <dt className="sr-only">場所</dt>
            <dd>{registration.event.location}</dd>
          </div>
        )}
        <div>
          <dt className="inline">参加人数: </dt>
          <dd className="inline">{registration.quantity}名</dd>
        </div>
      </dl>

      {registration.status === RegistrationStatus.WAITLISTED && (
        <div className="mt-4 border-t border-border pt-3">
          {/* Foundation gap analysis task #8: waitlist 順位表示 (mypage UI)。
            event-waitlist-emails.ts の computeWaitlistPosition と同 SSoT
            (WAITLIST_ACTIVE_STATUSES + waitlistedAt lte) で bulk 計算した値を
            props で受け取る。位置が算出できない場合 (waitlistedAt null 等) は
            順位表示なしのフォールバックメッセージのみ。 */}
          {waitlistPosition !== null ? (
            <p className="text-sm text-muted-foreground">
              現在
              <span className="mx-1 font-medium text-foreground tabular-nums">
                {waitlistPosition}
              </span>
              番目です。順番が来ましたら、メールでご連絡します。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              順番が来ましたら、メールでご連絡します。
            </p>
          )}
        </div>
      )}

      {registration.status === RegistrationStatus.WAITLISTED_OFFERED &&
        registration.expiresAt !== null && (
          <div className="mt-4 border-t border-border pt-3">
            <OfferCountdown
              expiresAt={registration.expiresAt}
              nowIso={nowIso}
            />
            {waitlistPosition !== null && (
              <p className="mt-2 text-sm text-muted-foreground">
                （現在の待機列順位:
                <span className="mx-1 font-medium text-foreground tabular-nums">
                  {waitlistPosition}
                </span>
                番目 / 前方の繰り上げ当選者を含みます）
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              確定用のリンクをメールでお送りしています。期限内にメール記載のリンクからお手続きください。
            </p>
            {isPendingWaitlistOffer && (
              <p className="mt-2 text-sm text-muted-foreground" role="status">
                決済処理中のため、この繰り上げ当選はキャンセルできません。決済を完了するか、Stripeで決済セッションをキャンセルしてから再度お試しください。
              </p>
            )}
          </div>
        )}

      {registration.status === RegistrationStatus.CONFIRMED && (
        <div className="mt-4 border-t border-border pt-3">
          <AddToCalendar
            urls={buildAddToCalendarUrls({
              summary: registration.event.title,
              description: [
                `申込ID: ${registration.id.slice(0, 8).toUpperCase()}`,
                `イベント: ${registration.event.title}`,
                `参加人数: ${registration.quantity}名`,
              ].join("\n"),
              startTime: new Date(registration.event.startTime),
              endTime: new Date(registration.event.endTime),
              ...(registration.event.location != null
                ? { location: registration.event.location }
                : {}),
              icsDownloadUrl: `${getAppUrl()}/api/calendar/event/${registration.id}`,
            })}
          />
        </div>
      )}

      {/* 領収書 DL リンク (Receipt 発行済のみ表示)。Route Handler は
        Better Auth session 経由で ownership 検証、Link コンポーネントは
        page 遷移用のため API route には使わない。Foundation task #8。 */}
      {receiptSerialNo && (
        <div className="mt-4 border-t border-border pt-3">
          <a
            href={`/api/receipts/${receiptSerialNo}/pdf`}
            download={`receipt-${receiptSerialNo}.pdf`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            領収書をダウンロード
          </a>
        </div>
      )}

      {canCancel && (
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              setError(null);
              setTurnstileToken("");
              setCancelDialogOpen(true);
            }}
          >
            申込をキャンセル
          </Button>

          <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>申込キャンセルの確認</DialogTitle>
                <DialogDescription>
                  「{registration.event.title}」の申込をキャンセルしますか？
                  この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>

              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                action={TURNSTILE_ACTIONS.mypage_event_registration_cancel}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />

              {error != null && (
                <div
                  className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* JSX 順 = visual 順 (Dialog primitive 修正後)。
               *  mobile 縦並びで「閉じる」=上、「キャンセル」(destructive) = 下 (thumb-zone)。 */}
              <DialogFooter
                role="group"
                aria-label="イベント申込キャンセル操作"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelDialogOpen(false)}
                  disabled={isPending}
                  className="w-full sm:w-auto"
                >
                  閉じる
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmCancel}
                  disabled={isPending}
                  className="w-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90 sm:w-auto"
                >
                  {isPending ? "キャンセル中..." : "キャンセルする"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// WAITLISTED_OFFERED countdown
// ---------------------------------------------------------------------------

const COUNTDOWN_TICK_MS = 60_000;

/**
 * WAITLISTED_OFFERED の確定期限（24h）までの残り時間を表示する。
 *
 * 初期値は `expiresAt`（サーバー算出）と `nowIso`（RSC render 時点の literal
 * 値。`page.tsx` 参照）から算出するため、SSR 出力と client hydration の
 * 初回描画が完全一致する（両者とも同じ literal 文字列から計算するだけで、
 * どちらも独自に `Date.now()` を呼ばない）。以降は mount 後の `useEffect` 内
 * `setInterval` でのみ実時計を参照して更新する
 * （`NotificationPollingProvider.tsx` の polling と同型のパターン）。
 */
function OfferCountdown({
  expiresAt,
  nowIso,
}: {
  readonly expiresAt: string;
  readonly nowIso: string;
}) {
  // 初期値は `nowIso`（SSR render 時点の literal 値）から算出するため、これで
  // 既に正確（1 tick 分＝最大 60 秒のずれは許容範囲）。mount 直後に client の
  // `Date.now()` で即座に上書きしない（`@eslint-react/set-state-in-effect` が
  // 警告する effect 内即時 setState パターンを避ける。かつては `tick()` を
  // effect 内で即呼びしていたが、E2E の frozen browser clock
  // (`page.clock.install`) 下ではサーバー実時計ベースの `expiresAt` と食い違い
  // 表示が乱れる副作用もあった）。
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(expiresAt).getTime() - new Date(nowIso).getTime(),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <p className="text-sm font-medium text-info" aria-live="polite">
      {formatOfferCountdown(remainingMs)}
    </p>
  );
}

function formatOfferCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "まもなく確定期限になります";
  }
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `確定期限まで残り${String(hours)}時間${String(minutes)}分`;
  }
  return `確定期限まで残り${String(minutes)}分`;
}
