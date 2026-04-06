"use client";

import { useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from "@/admin/components/ui";
import { RegistrationStatusBadge } from "@/admin/components/status-badges";
import { adminCancelRegistration } from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RegistrationStatus } from "@generated/prisma/enums";

type Registration = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  numberOfPeople: number;
  status: RegistrationStatus;
  cancelledAt: string | null;
  createdAt: string;
};

interface EventRegistrationTableProps {
  readonly registrations: Registration[];
}

export function EventRegistrationTable({
  registrations,
}: EventRegistrationTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCancel(registrationId: string) {
    startTransition(async () => {
      const result = await adminCancelRegistration(registrationId);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("申込をキャンセルしました");
        router.refresh();
      }
    });
  }

  if (registrations.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        参加申込はまだありません
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead className="hidden md:table-cell">メール</TableHead>
              <TableHead>参加人数</TableHead>
              <TableHead className="whitespace-nowrap">ステータス</TableHead>
              <TableHead className="hidden lg:table-cell">申込日時</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrations.map((reg) => (
              <TableRow key={reg.id}>
                <TableCell className="font-medium">{reg.name}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {reg.email}
                </TableCell>
                <TableCell>{reg.numberOfPeople}名</TableCell>
                <TableCell className="whitespace-nowrap">
                  <RegistrationStatusBadge status={reg.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {formatDateTimeShort(reg.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {reg.status === "CONFIRMED" ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleCancel(reg.id)}
                    >
                      キャンセル
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
