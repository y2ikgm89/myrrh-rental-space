"use client";

import { useState, useTransition } from "react";
import { IconGitMerge } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { toast } from "sonner";
import { findDuplicateCandidateForCustomer } from "@/admin/actions/customer";
import { isMutationError } from "@/shared/lib/mutation-result";
import { RISK_FLAG_REASON } from "@/shared/lib/validations/enums/helpers";
import type { CustomerSearchResult } from "@/shared/domain/customers/types";
import { MergeCustomerDialog } from "./MergeCustomerDialog";

type Props = {
  customer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
    flagReasons: string[];
  };
};

export function CustomerDetailActions({ customer }: Props) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [initialCandidate, setInitialCandidate] =
    useState<CustomerSearchResult | null>(null);
  const [isLoading, startTransition] = useTransition();

  const handleMergeClick = () => {
    // DUPLICATE_CANDIDATE フラグがある場合のみ、事前に候補を検索する
    if (customer.flagReasons.includes(RISK_FLAG_REASON.DUPLICATE_CANDIDATE)) {
      startTransition(async () => {
        const result = await findDuplicateCandidateForCustomer(customer.id);
        if (isMutationError(result)) {
          toast.error("重複候補の取得に失敗しました");
        } else {
          setInitialCandidate(result.candidate);
        }
        setMergeOpen(true);
      });
    } else {
      // フラグが無い場合は、従来通り即座にダイアログを開く
      setInitialCandidate(null);
      setMergeOpen(true);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleMergeClick}
        disabled={isLoading}
      >
        <IconGitMerge className="mr-2 h-4 w-4" />
        {isLoading ? "候補検索中..." : "マージ"}
      </Button>
      <MergeCustomerDialog
        sourceCustomer={customer}
        {...(initialCandidate && { initialCandidate })}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
    </>
  );
}
