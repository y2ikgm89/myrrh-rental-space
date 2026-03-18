"use client";

/**
 * ReservationForm — 3-step dummy reservation form
 *
 * Step 1: Date/time/capacity selection
 * Step 2: Name/contact info
 * Step 3: Confirmation
 *
 * GSAP animation on step transitions.
 */

import { useState, useRef, type ReactElement } from "react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { Input, Select, Textarea } from "@/public/components/design-system";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { DURATION, EASE } from "@/public/lib/animations";

const TIMESLOT_OPTIONS = [
  { value: "10-13", label: "10:00 - 13:00 (3時間)" },
  { value: "13-17", label: "13:00 - 17:00 (4時間)" },
  { value: "17-21", label: "17:00 - 21:00 (4時間)" },
  { value: "10-21", label: "10:00 - 21:00 (終日)" },
] as const;

function DateTimeStep({
  onNext,
}: {
  readonly onNext: () => void;
}): ReactElement {
  return (
    <div>
      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        日時・人数を選択
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        <Input id="reservation-date" label="ご利用日" type="date" />
        <Select
          id="reservation-timeslot"
          label="時間帯"
          options={TIMESLOT_OPTIONS}
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-capacity"
          label="利用人数"
          type="number"
          min={1}
          max={100}
          defaultValue={10}
        />
      </div>

      <div className="mt-8">
        <MagneticButton onClick={onNext} strength={0.2}>
          次のステップへ
        </MagneticButton>
      </div>
    </div>
  );
}

function InfoStep({
  onNext,
  onBack,
}: {
  readonly onNext: () => void;
  readonly onBack: () => void;
}): ReactElement {
  return (
    <div>
      <h2 className="mb-6 font-heading text-xl tracking-tight md:text-2xl">
        お客様情報
      </h2>

      <div className="grid gap-5 md:grid-cols-2">
        <Input
          id="reservation-name"
          label="お名前"
          type="text"
          placeholder="山田 太郎"
        />
        <Input
          id="reservation-email"
          label="メールアドレス"
          type="email"
          placeholder="mail@example.com"
        />
      </div>

      <div className="mt-5">
        <Input
          id="reservation-phone"
          label="電話番号"
          type="tel"
          placeholder="03-1234-5678"
        />
      </div>

      <div className="mt-5">
        <Textarea
          id="reservation-notes"
          label="備考"
          rows={3}
          placeholder="ご要望などございましたらお書きください"
        />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          戻る
        </button>
        <MagneticButton onClick={onNext} strength={0.2}>
          確認画面へ
        </MagneticButton>
      </div>
    </div>
  );
}

function ConfirmationStep({
  onBack,
}: {
  readonly onBack: () => void;
}): ReactElement {
  return (
    <div>
      <div className="rounded-lg border border-accent/20 bg-card p-5 md:p-8">
        <h3 className="font-heading text-xl tracking-tight">予約内容の確認</h3>

        <div className="mt-6 space-y-4">
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">ご利用日</span>
            <span className="text-sm font-medium">2026年3月15日 (日)</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">時間帯</span>
            <span className="text-sm font-medium">13:00 - 17:00 (4時間)</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">利用人数</span>
            <span className="text-sm font-medium">10名</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-muted-foreground">お名前</span>
            <span className="text-sm font-medium">山田 太郎</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="font-heading text-base">概算金額</span>
            <span className="font-heading text-xl text-accent">
              &yen;32,000
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          戻る
        </button>
        <MagneticButton strength={0.35}>予約を確定する</MagneticButton>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        ※ これはデモページです。実際の予約は行われません。
      </p>
    </div>
  );
}

export function ReservationForm(): ReactElement {
  const [step, setStep] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionPreference();

  const animateTransition = () => {
    const content = contentRef.current;
    if (!content) return;

    const stepContent = content.querySelector("[data-step]");
    if (!stepContent) return;

    const reduced = !motionOk.current;
    gsap.fromTo(
      stepContent,
      { opacity: 0, y: reduced ? 0 : 20 },
      {
        opacity: 1,
        y: 0,
        duration: reduced ? DURATION.fast : DURATION.normal,
        ease: EASE.outQuart,
      },
    );
  };

  const goNext = () => {
    setStep((prev) => Math.min(3, prev + 1));
    animateTransition();
  };

  const goBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    animateTransition();
  };

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-10 md:mb-12">
        <StepIndicator currentStep={step} />
      </div>

      {/* Form content */}
      <div ref={contentRef}>
        <div data-step="">
          {step === 1 && <DateTimeStep onNext={goNext} />}
          {step === 2 && <InfoStep onNext={goNext} onBack={goBack} />}
          {step === 3 && <ConfirmationStep onBack={goBack} />}
        </div>
      </div>
    </div>
  );
}
