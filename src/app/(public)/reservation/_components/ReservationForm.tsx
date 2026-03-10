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
import { MagneticButton } from "@/public/components/animations/MagneticButton";
import { StepIndicator } from "./StepIndicator";
import { DURATION, EASE } from "@/public/lib/animations";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary";

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
        <div>
          <label
            htmlFor="reservation-date"
            className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
          >
            ご利用日
          </label>
          <input id="reservation-date" type="date" className={INPUT_CLASS} />
        </div>
        <div>
          <label
            htmlFor="reservation-timeslot"
            className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
          >
            時間帯
          </label>
          <select id="reservation-timeslot" className={INPUT_CLASS}>
            <option>10:00 - 13:00 (3時間)</option>
            <option>13:00 - 17:00 (4時間)</option>
            <option>17:00 - 21:00 (4時間)</option>
            <option>10:00 - 21:00 (終日)</option>
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="reservation-capacity"
          className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
        >
          利用人数
        </label>
        <input
          id="reservation-capacity"
          type="number"
          min={1}
          max={100}
          defaultValue={10}
          className={INPUT_CLASS}
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
        <div>
          <label
            htmlFor="reservation-name"
            className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
          >
            お名前
          </label>
          <input
            id="reservation-name"
            type="text"
            placeholder="山田 太郎"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label
            htmlFor="reservation-email"
            className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
          >
            メールアドレス
          </label>
          <input
            id="reservation-email"
            type="email"
            placeholder="mail@example.com"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="reservation-phone"
          className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
        >
          電話番号
        </label>
        <input
          id="reservation-phone"
          type="tel"
          placeholder="03-1234-5678"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor="reservation-notes"
          className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
        >
          備考
        </label>
        <textarea
          id="reservation-notes"
          rows={3}
          placeholder="ご要望などございましたらお書きください"
          className={INPUT_CLASS}
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
      <div className="rounded-lg border border-primary/20 bg-card p-5 md:p-8">
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
            <span className="font-heading text-xl text-primary-dark">
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
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-2xl px-5 md:px-8">
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
    </section>
  );
}
