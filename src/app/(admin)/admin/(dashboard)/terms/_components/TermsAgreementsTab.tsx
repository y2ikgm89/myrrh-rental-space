"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  adminTermsAgreementsResponseSchema,
  type TermsAgreementItem,
} from "@/shared/lib/validations/terms";
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

async function fetchTermsAgreements(
  termsId: string,
  page: number,
): Promise<{ agreements: TermsAgreementItem[]; total: number }> {
  const response = await fetch(
    `/admin/api/terms/${termsId}/agreements?page=${page}`,
    {
      credentials: "same-origin",
    },
  );

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "同意記録の取得に失敗しました";
    throw new Error(message);
  }

  const parsed = adminTermsAgreementsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("同意記録の取得に失敗しました");
  }

  return {
    agreements: parsed.data.agreements,
    total: parsed.data.total,
  };
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
      try {
        const result = await fetchTermsAgreements(termsId, newPage);
        setAgreements(result.agreements);
        setTotal(result.total);
        setPage(newPage);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "同意記録の取得に失敗しました";
        toast.error(message);
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
