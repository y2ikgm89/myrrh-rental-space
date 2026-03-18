"use client";

/**
 * ContactForm — Dummy contact form with ScrollReveal
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import { MagneticButton } from "@/public/components/animations/MagneticButton";
import { Input, Textarea } from "@/public/components/design-system";

export function ContactForm(): ReactElement {
  return (
    <ScrollReveal>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="contact-name"
            label="お名前"
            type="text"
            placeholder="山田 太郎"
          />
          <Input
            id="contact-email"
            label="メールアドレス"
            type="email"
            placeholder="mail@example.com"
          />
        </div>

        <Input
          id="contact-subject"
          label="件名"
          type="text"
          placeholder="お問い合わせの件名"
        />

        <Textarea
          id="contact-message"
          label="お問い合わせ内容"
          rows={5}
          placeholder="お問い合わせ内容をご記入ください"
        />

        <div className="pt-2">
          <MagneticButton strength={0.2}>送信する</MagneticButton>
        </div>

        <p className="text-xs text-muted-foreground">
          ※ これはデモページです。実際の送信は行われません。
        </p>
      </form>
    </ScrollReveal>
  );
}
