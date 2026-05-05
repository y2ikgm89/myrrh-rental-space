"use client";

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import {
  PublicInquiryFormCard,
  type RequiredInquiryTerm,
} from "@/public/components/forms/public-inquiry-form-card";

interface ContactFormProps {
  readonly turnstileSiteKey: string | null;
  readonly defaultSubject: string | undefined;
  readonly requiredTerms: readonly RequiredInquiryTerm[];
}

export function ContactForm({
  turnstileSiteKey,
  defaultSubject,
  requiredTerms,
}: ContactFormProps): ReactElement {
  return (
    <ScrollReveal>
      <PublicInquiryFormCard
        mode="live"
        turnstileSiteKey={turnstileSiteKey}
        requiredTerms={requiredTerms}
        {...(defaultSubject !== undefined && {
          defaultSubject,
        })}
      />
    </ScrollReveal>
  );
}
