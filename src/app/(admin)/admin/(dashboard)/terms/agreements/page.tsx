import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { IconArrowLeft } from "@tabler/icons-react";
import {
  Badge,
  Button,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/admin/components/ui";
import { getAdminAgreements } from "@/shared/domain/terms/admin-queries";
import {
  TERMS_TYPE_LABELS,
  TERMS_SCOPE_LABELS,
  isTermsScope,
} from "@/shared/lib/validations/terms";
import type { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { formatDateTimeShort } from "@/shared/lib/date-format";

export const metadata: Metadata = {
  title: "規約同意記録 | Myrrh Rental Space",
};

const DEFAULT_PER_PAGE = 50;

function parsePositiveInt(
  value: string | string[] | undefined,
): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseScope(
  value: string | string[] | undefined,
): TermsScope | undefined {
  if (typeof value !== "string") return undefined;
  return isTermsScope(value) ? value : undefined;
}

function parseString(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

export default async function AdminTermsAgreementsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();

  const sp = await searchParams;
  const page = parsePositiveInt(sp["page"]) ?? 1;
  const perPage = parsePositiveInt(sp["perPage"]) ?? DEFAULT_PER_PAGE;
  const scope = parseScope(sp["scope"]);
  const termsId = parseString(sp["termsId"]);
  const guestEmailKeyword = parseString(sp["guestEmail"]);

  const { items, total } = await getAdminAgreements({
    page,
    perPage,
    ...(scope !== undefined && { scope }),
    ...(termsId !== undefined && { termsId }),
    ...(guestEmailKeyword !== undefined && { guestEmailKeyword }),
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));

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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/terms">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              規約一覧に戻る
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/api/admin/export/terms-agreements?${new URLSearchParams({
                ...(scope !== undefined && { scope: String(scope) }),
                ...(termsId !== undefined && { termsId }),
                ...(guestEmailKeyword !== undefined && {
                  guestEmail: guestEmailKeyword,
                }),
              }).toString()}`}
            >
              CSV エクスポート
            </Link>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            まだ同意記録がありません
          </p>
        </div>
      ) : (
        <>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>同意日時</TableHead>
                  <TableHead>規約</TableHead>
                  <TableHead className="hidden md:table-cell">画面</TableHead>
                  <TableHead>同意者</TableHead>
                  <TableHead className="hidden lg:table-cell">IP</TableHead>
                  <TableHead className="hidden font-mono lg:table-cell">
                    Hash
                  </TableHead>
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
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">
                        {TERMS_SCOPE_LABELS[item.scope]}
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
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {item.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell
                      className="hidden font-mono text-xs text-muted-foreground lg:table-cell"
                      title={item.contentHash}
                    >
                      {item.contentHash.slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            total={total}
            perPage={perPage}
            defaultPerPage={DEFAULT_PER_PAGE}
          />
        </>
      )}
    </div>
  );
}
