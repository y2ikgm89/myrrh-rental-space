"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { IconCalendarUser, IconUserPlus } from "@tabler/icons-react";
import {
  createAdminProxyRegistration,
  createWalkInRegistration,
} from "@/admin/actions/event-registration";
import { ProxyRegistrationDialog } from "../check-in/_components/ProxyRegistrationDialog";
import { WalkInDialog } from "../check-in/_components/WalkInDialog";

interface RegisterParticipantButtonProps {
  readonly eventId: string;
  // events/[id]/check-in/page.tsx が CheckInClient に渡している tickets/slots と
  // 同じ形（isAvailable な ticket のみ、slot は startAt/endAt を ISO 文字列化済み）。
  readonly tickets: { id: string; name: string; price: number }[];
  readonly slots: { id: string; startAt: string; endAt: string }[];
}

export function RegisterParticipantButton({
  eventId,
  tickets,
  slots,
}: RegisterParticipantButtonProps) {
  const router = useRouter();
  const [proxyOpen, setProxyOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  function handleProxySuccess() {
    setProxyOpen(false);
    router.refresh();
    toast.success("事前代行登録を受け付けました");
  }

  function handleWalkInSuccess() {
    setWalkInOpen(false);
    router.refresh();
    toast.success("当日参加を受け付けました");
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setProxyOpen(true)}>
        <IconCalendarUser className="mr-2 h-4 w-4" />
        代行登録
      </Button>
      <Button size="sm" onClick={() => setWalkInOpen(true)}>
        <IconUserPlus className="mr-2 h-4 w-4" />
        当日参加
      </Button>

      <ProxyRegistrationDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleProxySuccess}
        action={createAdminProxyRegistration}
      />
      <WalkInDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        eventId={eventId}
        tickets={tickets}
        slots={slots}
        onSuccess={handleWalkInSuccess}
        action={createWalkInRegistration}
      />
    </>
  );
}
