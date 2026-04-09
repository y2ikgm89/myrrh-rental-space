"use client";

import { useState } from "react";
import { IconGitMerge } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { MergeCustomerDialog } from "./MergeCustomerDialog";

type Props = {
  customer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
  };
};

export function CustomerDetailActions({ customer }: Props) {
  const [mergeOpen, setMergeOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)}>
        <IconGitMerge className="mr-2 h-4 w-4" />
        マージ
      </Button>
      <MergeCustomerDialog
        sourceCustomer={customer}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
    </>
  );
}
