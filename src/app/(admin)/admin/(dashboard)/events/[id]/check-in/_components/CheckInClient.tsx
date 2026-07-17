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

export function CheckInClient({
  eventId,
  initialAttendees,
  tickets,
  slots,
}: Props) {
  return (
    <CheckInClientState
      key={getAttendeeSnapshotKey(initialAttendees)}
      eventId={eventId}
      initialAttendees={initialAttendees}
      tickets={tickets}
      slots={slots}
    />
  );
}

function getAttendeeSnapshotKey(attendees: readonly Attendee[]) {
  return JSON.stringify(
    attendees.map((attendee) => [
      attendee.id,
      attendee.attendedAt,
      attendee.quantity,
      attendee.name,
      attendee.email,
      attendee.phone,
      attendee.ticket.id,
      attendee.ticket.name,
    ]),
  );
}

function CheckInClientState({
  eventId,
  initialAttendees,
  tickets,
  slots,
}: Props) {
  const router = useRouter();
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [query, setQuery] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
    const previousAttendedAt = target.attendedAt;
    const willAttend = previousAttendedAt === null;
    const optimisticAt = willAttend ? new Date().toISOString() : null;

    // 楽観更新
    setAttendees((prev) =>
      prev.map((a) =>
        a.id === registrationId ? { ...a, attendedAt: optimisticAt } : a,
      ),
    );

    startTransition(async () => {
      const result = await toggleEventRegistrationCheckIn({
        registrationId,
        eventId,
        attended: willAttend,
      });
      if (isMutationError(result)) {
        // ロールバック
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === registrationId
              ? { ...a, attendedAt: previousAttendedAt }
              : a,
          ),
        );
        toast.error(result.error);
        return;
      }
      // server canonical 値で確定
      setAttendees((prev) =>
        prev.map((a) =>
          a.id === registrationId
            ? {
                ...a,
                attendedAt: result.attendedAt
                  ? result.attendedAt.toString()
                  : null,
              }
            : a,
        ),
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
      <div className="sticky top-16 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:mx-0 sm:rounded-lg sm:border">
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
              onClick={() => router.refresh()}
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
