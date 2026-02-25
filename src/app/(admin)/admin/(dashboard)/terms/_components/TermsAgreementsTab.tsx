"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { getTermsAgreements } from "@/admin/actions/terms";
import type { TermsAgreementItem } from "@/shared/lib/validations/terms";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { Button } from "@/admin/components/ui";
import { toast } from "sonner";

const PER_PAGE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  termsId: string;
  initialAgreements: TermsAgreementItem[];
  initialTotal: number;
}

export function TermsAgreementsTab({
  termsId,
  initialAgreements,
  initialTotal,
}: Props) {
  const [agreements, setAgreements] =
    useState<TermsAgreementItem[]>(initialAgreements);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / PER_PAGE);

  const loadPage = (newPage: number) => {
    startTransition(async () => {
      const result = await getTermsAgreements(termsId, newPage);
      if (result.success) {
        setAgreements(result.data.agreements);
        setTotal(result.data.total);
        setPage(newPage);
      } else {
        toast.error(result.error);
      }
    });
  };

  if (total === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground">同意記録がありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">全 {total} 件</p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>バージョン</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>予約</TableHead>
              <TableHead>IPアドレス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agreements.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDateTime(a.agreedAt)}
                </TableCell>
                <TableCell className="text-sm">v{a.version}</TableCell>
                <TableCell className="text-sm">
                  {a.guestName ?? a.userName ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {a.guestEmail ?? a.userEmail ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {a.reservationId ? (
                    <Link
                      href={`/admin/reservations/${a.reservationId}`}
                      className="underline hover:no-underline"
                    >
                      {a.reservationId.slice(0, 8)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {a.ipAddress ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <nav aria-label="ページネーション" className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || isPending}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPage(page + 1)}
            disabled={page >= totalPages || isPending}
          >
            次へ
          </Button>
        </nav>
      )}
    </div>
  );
}
