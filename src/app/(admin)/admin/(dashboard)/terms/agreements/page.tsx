import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
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
import { LoadingState } from "@/admin/components/LoadingState";
import { getAdminAgreements, getAdminTermsList } from "@/admin/queries/terms";
import { TermsAgreementsFilters } from "./_components/TermsAgreementsFilters";
import {
  TERMS_TYPE_LABELS,
  TERMS_SCOPE_LABELS,
  isTermsScope,
} from "@/shared/lib/validations/terms";
import { loadAdminTermsAgreementsSearchParams } from "@/shared/lib/nuqs";
import { formatDateTimeShort } from "@/shared/lib/date-format";

export const metadata: Metadata = {
  title: "規約同意記録 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

async function TermsAgreementsFiltersWrapper() {
  await connection();
  const terms = await getAdminTermsList();
  return (
    <TermsAgreementsFilters
      termsOptions={terms.map((t) => ({ id: t.id, title: t.title }))}
    />
  );
}

async function TermsAgreementsList({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await loadAdminTermsAgreementsSearchParams(searchParams);
  const scope = isTermsScope(params.scope) ? params.scope : undefined;

  const { items, total } = await getAdminAgreements({
    page: params.page,
    perPage: params.perPage,
    ...(scope !== undefined && { scope }),
    ...(params.termsId !== "" && { termsId: params.termsId }),
    ...(params.guestEmail !== "" && {
      guestEmailKeyword: params.guestEmail,
    }),
  });

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));

  return (
    <>
      <p className="text-muted-foreground">
        合計 {total.toLocaleString()} 件の同意記録（証跡）
      </p>

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
            currentPage={params.page}
            totalPages={totalPages}
            total={total}
            perPage={params.perPage}
            defaultPerPage={50}
          />
        </>
      )}
    </>
  );
}

export default async function AdminTermsAgreementsPage({
  searchParams,
}: PageProps) {
  const params = await loadAdminTermsAgreementsSearchParams(searchParams);
  const scope = isTermsScope(params.scope) ? params.scope : undefined;

  // Round-4 audit Finding #19: CSV export も一覧と同じ filter を引き継ぐ
  // (AuditLogFilters.tsx / reservations の export href と同型パターン)。
  const exportParams = new URLSearchParams();
  if (scope !== undefined) exportParams.set("scope", scope);
  if (params.termsId) exportParams.set("termsId", params.termsId);
  if (params.guestEmail) exportParams.set("guestEmail", params.guestEmail);
  const exportHref = `/api/admin/export/terms-agreements${
    exportParams.size > 0 ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            規約同意記録
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/terms">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              規約一覧に戻る
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>CSV エクスポート</a>
          </Button>
        </div>
      </div>

      <Suspense fallback={<LoadingState variant="inline" />}>
        <TermsAgreementsFiltersWrapper />
      </Suspense>

      <Suspense fallback={<LoadingState />}>
        <TermsAgreementsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
