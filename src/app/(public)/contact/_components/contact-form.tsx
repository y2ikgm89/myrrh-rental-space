"use client";

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { PublicInquiryFormCard } from "@/public/components/forms/public-inquiry-form-card";

interface ContactFormProps {
  readonly turnstileSiteKey: string | null;
  readonly defaultSubject: string | undefined;
}

export function ContactForm({
  turnstileSiteKey,
  defaultSubject,
}: ContactFormProps): ReactElement {
  return (
    <ScrollReveal>
      <PublicInquiryFormCard
        mode="live"
        turnstileSiteKey={turnstileSiteKey}
        {...(defaultSubject !== undefined && {
          defaultSubject,
        })}
      />
    </ScrollReveal>
  );
}
