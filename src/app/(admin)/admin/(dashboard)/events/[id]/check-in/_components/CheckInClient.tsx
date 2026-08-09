"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCalendarUser,
  IconRefresh,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { Button, Input } from "@/admin/components/ui";
import { toast } from "sonner";
import {
  createAdminProxyRegistration,
  createWalkInRegistration,
  toggleEventRegistrationCheckIn,
} from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { CheckInRow } from "./CheckInRow";
import { ProxyRegistrationDialog } from "./ProxyRegistrationDialog";
import { WalkInDialog } from "./WalkInDialog";

type Attendee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  quantity: number;
  attendedAt: string | null;
  createdAt: string;
  ticket: { id: string; name: string };
};

type Ticket = {
  id: string;
  name: string;
  price: number;
};

type SlotInfo = {
  id: string;
  startAt: string;
  endAt: string;
};

type Props = {
  readonly eventId: string;
  readonly initialAttendees: Attendee[];
  readonly tickets: Ticket[];
  readonly slots: SlotInfo[];
};

/**
 * 出席打刻のローカル上書き（registration id → 出席日時 / 未出席なら null）。
 *
 * 一覧そのものを state に写し取らない。かつては `useState(initialAttendees)` で
 * 写し取り、サーバーから新しい props が届いたら **`key` を付け替えて subtree ごと
 * remount** することで同期していた。だがその remount は、同じ subtree にある
 * **ダイアログの開閉状態と `useActionState` の結果を道連れに捨てる**。
 *
 * 代行登録 / 当日参加は成功すると `invalidateEventCaches()` により新しい参加者
 * 一覧が返るので `key` が必ず変わる。つまり**成功したときに限って**
 * `ProxyRegistrationDialog` / `WalkInDialog` が unmount され、
 * `lastResult` を見て発火するはずの成功ハンドラが**一度も呼ばれない**。
 * 完了トーストも `router.refresh()` も実行されず、ダイアログは「成功したから」
 * ではなく「state が消えたから」閉じていた（実測: nightly の
 * `events-proxy-registration` が 7 連続失敗。登録自体は毎回成功していた）。
 *
 * 打刻だけを id 単位の上書きとして持ち、表示はサーバー props から**導出**する。
 * 新しい props はそのまま反映されるので、remount も同期用 effect も要らない。
 */
type AttendanceOverrides = ReadonlyMap<string, string | null>;

export function CheckInClient({
  eventId,
  initialAttendees,
  tickets,
  slots,
}: Props) {
  const router = useRouter();
  const [attendanceOverrides, setAttendanceOverrides] =
    useState<AttendanceOverrides>(() => new Map());
  const [query, setQuery] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const attendees: Attendee[] = initialAttendees.map((attendee) =>
    attendanceOverrides.has(attendee.id)
      ? {
          ...attendee,
          attendedAt: attendanceOverrides.get(attendee.id) ?? null,
        }
      : attendee,
  );

  function overrideAttendance(
    registrationId: string,
    attendedAt: string | null,
  ) {
    setAttendanceOverrides((prev) =>
      new Map(prev).set(registrationId, attendedAt),
    );
  }

  /**
   * 楽観更新を**厳密に取り消す**（打刻失敗時のロールバック）。
   *
   * 値を書き戻すだけでは足りない。上書きが**無かった**行に上書きを作ってしまうと、
   * その後サーバーから新しい props が来ても（ダイアログ成功後の `router.refresh()`、
   * 別の管理者の打刻）**古い値で覆い続ける** — 一覧を props から導出する設計が
   * そこだけ効かなくなる。無かったなら「無い」に戻す。
   */
  function restoreAttendance(
    registrationId: string,
    hadOverride: boolean,
    previousOverride: string | null,
  ) {
    setAttendanceOverrides((prev) => {
      const next = new Map(prev);
      if (hadOverride) next.set(registrationId, previousOverride);
      else next.delete(registrationId);
      return next;
    });
  }

  /**
   * 明示的な再読込ではローカル上書きを捨てる。
   * 「取り直したのに自分の古い打刻が勝つ」を防ぐ（サーバーが真とする操作）。
   */
  function handleManualRefresh() {
    setAttendanceOverrides(new Map());
    router.refresh();
  }

  const totalQuantity = attendees.reduce((sum, a) => sum + a.quantity, 0);
  const attendedQuantity = attendees.reduce(
    (sum, a) => sum + (a.attendedAt !== null ? a.quantity : 0),
    0,
  );
  const attendedRegistrationCount = attendees.filter(
    (a) => a.attendedAt !== null,
  ).length;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAttendees = normalizedQuery
    ? attendees.filter((a) => {
        if (a.name.toLowerCase().startsWith(normalizedQuery)) return true;
        if (a.email?.toLowerCase().includes(normalizedQuery)) return true;
        return false;
      })
    : attendees;

  function handleToggle(registrationId: string) {
    const target = attendees.find((a) => a.id === registrationId);
    if (!target) return;
    const willAttend = target.attendedAt === null;
    // 失敗したら「楽観更新の直前の状態」へ戻す。この action は cache を無効化
    // しないので `initialAttendees` は最初の打刻より前のまま止まっており、
    // 単に上書きを消すと 2 回目の失敗が 1 回目の成功まで巻き戻して**永続状態の
    // 逆**を表示する。かといって値だけ書き戻すと、上書きが無かった行に上書きを
    // 作ってしまい、以後サーバー props を覆い続ける。**在/無ごと**覚える。
    const hadOverride = attendanceOverrides.has(registrationId);
    const previousOverride = attendanceOverrides.get(registrationId) ?? null;

    // 楽観更新
    overrideAttendance(
      registrationId,
      willAttend ? new Date().toISOString() : null,
    );

    startTransition(async () => {
      const result = await toggleEventRegistrationCheckIn({
        registrationId,
        eventId,
        attended: willAttend,
      });
      if (isMutationError(result)) {
        restoreAttendance(registrationId, hadOverride, previousOverride);
        toast.error(result.error);
        return;
      }
      // server canonical 値で確定（この action は cache を無効化しないので、
      // 打刻の記録はこのローカル上書きだけが持つ）
      overrideAttendance(
        registrationId,
        result.attendedAt ? result.attendedAt.toString() : null,
      );
      toast.success(
        willAttend ? "出席を記録しました" : "出席を取り消しました",
        {
          duration: 5000,
          action: {
            label: "取消",
            onClick: () => {
              handleToggle(registrationId);
            },
          },
        },
      );
    });
  }

  function handleWalkInSuccess() {
    setWalkInOpen(false);
    router.refresh();
    toast.success("当日参加を受け付けました");
  }

  function handleProxySuccess() {
    setProxyOpen(false);
    router.refresh();
    toast.success("事前代行登録を受け付けました");
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー: 進捗カウンタ + 操作 */}
      {/* 背景は 95% で固定（`supports-[backdrop-filter]:bg-background/60` は使わない）。
          sticky bar はスクロールで任意のコンテンツの上に重なるため下地を選べず、60% だと
          実効コントラストが下地次第で AA を割る。95% なら最悪の下地でも 5.36:1。
          `admin-overlay-surface-contrast.test.ts` が機械強制する。 */}
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {attendedQuantity}
            </span>
            <span className="text-muted-foreground">
              / {totalQuantity} 名チェック済
            </span>
            {normalizedQuery && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                表示中 {filteredAttendees.length} 件
              </span>
            )}
            <span className="ml-2 text-xs text-muted-foreground">
              申込 {attendedRegistrationCount} / {attendees.length} 件
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isPending}
              aria-label="一覧を再取得"
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              再読込
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProxyOpen(true)}
            >
              <IconCalendarUser className="mr-2 h-4 w-4" />
              代行登録
            </Button>
            <Button size="sm" onClick={() => setWalkInOpen(true)}>
              <IconUserPlus className="mr-2 h-4 w-4" />
              当日参加
            </Button>
          </div>
        </div>
        <div className="mt-3 relative">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            placeholder="氏名 (前方一致) またはメール (部分一致) で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
      </div>

      {/* リスト */}
      {attendees.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          確定済の参加申込がまだありません
        </p>
      ) : filteredAttendees.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          検索条件に該当する参加者がいません
        </p>
      ) : (
        <ul className="space-y-2">
          {filteredAttendees.map((a) => (
            <li key={a.id}>
              <CheckInRow
                attendee={a}
                disabled={isPending}
                onToggle={() => handleToggle(a.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <WalkInDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleWalkInSuccess}
        action={createWalkInRegistration}
      />

      <ProxyRegistrationDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleProxySuccess}
        action={createAdminProxyRegistration}
      />
    </div>
  );
}
