"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
} from "@/admin/components/ui";
import { toast } from "sonner";
import {
  mergeCustomers,
  searchCustomersAction,
} from "@/admin/actions/customer";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";

type Props = {
  sourceCustomer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MergeCustomerDialog({
  sourceCustomer,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const [isMerging, startMergeTransition] = useTransition();

  const handleSearch = (value: string) => {
    setQuery(value);
    setSelected(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startSearchTransition(async () => {
      const found = await searchCustomersAction(value.trim());
      setResults(found.filter((c) => c.id !== sourceCustomer.id));
    });
  };

  const handleMerge = () => {
    if (!selected) return;
    startMergeTransition(async () => {
      const result = await mergeCustomers(sourceCustomer.id, selected.id);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success(
          `マージ完了: 予約${String(result.transferredReservations)}件、問い合わせ${String(result.transferredInquiries)}件、レビュー${String(result.transferredReviews)}件を移管しました`,
        );
        onOpenChange(false);
        router.push(`/admin/customers/${selected.id}`);
        router.refresh();
      }
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setResults([]);
      setSelected(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>顧客をマージ</AlertDialogTitle>
          <AlertDialogDescription>
            「{sourceCustomer.lastName} {sourceCustomer.firstName}」(
            {sourceCustomer.email})
            の予約・問い合わせ・レビューをマージ先に移管し、この顧客を削除します。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Input
            placeholder="マージ先を検索（名前・メール・電話番号）"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            disabled={isMerging}
          />

          {isSearching && (
            <p className="text-sm text-muted-foreground">検索中...</p>
          )}

          {results.length > 0 && !selected && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-muted"
                  onClick={() => setSelected(c)}
                >
                  <div>
                    <span className="font-medium">
                      {c.lastName} {c.firstName}
                    </span>
                    {c.companyName && (
                      <span className="ml-2 text-muted-foreground">
                        ({c.companyName})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.email}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-medium">マージ先:</p>
              <p className="text-sm">
                {selected.lastName} {selected.firstName} ({selected.email})
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMerging}>キャンセル</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={!selected || isMerging}
          >
            {isMerging ? "マージ中..." : "マージを実行"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
