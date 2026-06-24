import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/admin/components/ui";
import { getAdminAgreements } from "@/shared/domain/terms/admin-queries";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";
import { formatDateTimeShort } from "@/shared/lib/date-format";

export const metadata: Metadata = {
  title: "規約同意記録 | Myrrh Rental Space",
};

const CONTEXT_LABELS: Record<string, string> = {
  reservation: "予約",
  inquiry: "問い合わせ",
  signup: "サインアップ",
};

export default async function AdminTermsAgreementsPage() {
  const { items, total } = await getAdminAgreements({ perPage: 100 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            規約同意記録
          </h1>
          <p className="text-muted-foreground">
            合計 {total.toLocaleString()} 件の同意記録（証跡）
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/terms">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            規約一覧に戻る
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            まだ同意記録がありません
          </p>
        </div>
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>同意日時</TableHead>
                <TableHead>規約</TableHead>
                <TableHead>コンテキスト</TableHead>
                <TableHead>同意者</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="font-mono">Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTimeShort(item.agreedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.terms.title}</div>
                    <Badge variant="secondary" className="text-xs">
                      {TERMS_TYPE_LABELS[item.terms.type] ?? item.terms.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CONTEXT_LABELS[item.context] ?? item.context}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.customer ? (
                      <Link
                        href={`/admin/customers/${item.customer.id}`}
                        className="text-sm hover:underline"
                      >
                        {item.customer.lastName} {item.customer.firstName}
                        <div className="text-xs text-muted-foreground">
                          {item.customer.email}
                        </div>
                      </Link>
                    ) : item.guestEmail ? (
                      <div className="text-sm">
                        <Badge variant="outline" className="text-xs">
                          ゲスト
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {item.guestEmail}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.contentHash.slice(0, 12)}…
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </div>
  );
}
