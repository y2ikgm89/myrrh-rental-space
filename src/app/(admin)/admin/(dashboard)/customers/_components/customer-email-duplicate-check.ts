"use client";

import { useState } from "react";
import { z } from "zod";

const checkEmailResponseSchema = z.object({
  duplicateCandidate: z.boolean(),
  unlinkedDuplicateCandidate: z.boolean(),
});

type UseCustomerEmailDuplicateCheckOptions = {
  excludeId?: string;
  originalEmail?: string;
};

export function useCustomerEmailDuplicateCheck({
  excludeId,
  originalEmail,
}: UseCustomerEmailDuplicateCheckOptions = {}) {
  const [duplicateCandidate, setDuplicateCandidate] = useState(false);
  const [unlinkedDuplicateCandidate, setUnlinkedDuplicateCandidate] =
    useState(false);

  function reset() {
    setDuplicateCandidate(false);
    setUnlinkedDuplicateCandidate(false);
  }

  async function checkEmail(email: string) {
    if (!email || email === originalEmail) {
      reset();
      return;
    }

    try {
      const params = new URLSearchParams({ email });
      if (excludeId) {
        params.set("excludeId", excludeId);
      }

      const response = await fetch(
        `/api/admin/customers/check-email?${params.toString()}`,
      );
      if (!response.ok) {
        reset();
        return;
      }

      const parsed = checkEmailResponseSchema.safeParse(await response.json());
      setDuplicateCandidate(parsed.success && parsed.data.duplicateCandidate);
      setUnlinkedDuplicateCandidate(
        parsed.success && parsed.data.unlinkedDuplicateCandidate,
      );
    } catch {
      // Candidate lookup failure must not block saving. The server action still
      // enforces the unlinked guest duplicate constraint.
      reset();
    }
  }

  return {
    duplicateCandidate,
    unlinkedDuplicateCandidate,
    checkEmail,
    resetEmailDuplicateCheck: reset,
  };
}
