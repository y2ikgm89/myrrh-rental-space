"use client";

/**
 * ReservationForm — 3-step reservation form with real submission
 *
 * Step 1: Space + date/time selection
 * Step 2: Customer information
 * Step 3: Confirmation + submit
 *
 * GSAP animation on step transitions.
 */

import { useState, useRef, type ReactElement } from "react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { StepIndicator } from "@/public/components/ui/step-indicator";
import { DURATION, EASE } from "@/public/lib/animations";
import { usePublicForm } from "@/public/hooks/use-public-form";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import { submitReservation } from "@/public/actions/reservation";
import { isMutationError } from "@/shared/lib/mutation-result";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DateTimeStep } from "./date-time-step";
import { CustomerStep } from "./customer-step";
import { ConfirmationStep } from "./confirmation-step";

type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string | null;
};

export function ReservationForm({
  spaces,
}: {
  readonly spaces: readonly SpaceOption[];
}): ReactElement {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionPreference();

  const { form, isPending, onSubmit } = usePublicForm(
    publicReservationSchema,
    async (data) => {
      setErrorMessage(null);
      const result = await submitReservation(data);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
      } else {
        setSubmitted(true);
      }
      return result;
    },
  );

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

  const goNext = async () => {
    if (step === 1) {
      const isValid = await form.trigger([
        "spaceId",
        "date",
        "startTime",
        "endTime",
        "numberOfGuests",
      ] as const);
      if (!isValid) return;
    } else if (step === 2) {
      const isValid = await form.trigger([
        "lastName",
        "firstName",
        "email",
        "phoneNumber",
        "notes",
      ] as const);
      if (!isValid) return;
    }
    setStep((prev) => Math.min(3, prev + 1));
    animateTransition();
  };

  const goBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    animateTransition();
  };

  if (submitted) {
    return (
      <ScrollReveal>
        <div className="rounded-lg border border-accent/20 bg-surface p-8 text-center">
          <h2 className="font-heading text-xl tracking-tight">
            ご予約を受け付けました
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            予約内容を確認の上、担当者よりご連絡いたします。
            <br />
            確定後に確認メールをお送りします。
          </p>
        </div>
      </ScrollReveal>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-10 md:mb-12">
        <StepIndicator currentStep={step} />
      </div>
      <div ref={contentRef}>
        <div data-step="">
          {step === 1 && (
            <DateTimeStep form={form} spaces={spaces} onNext={goNext} />
          )}
          {step === 2 && (
            <CustomerStep form={form} onNext={goNext} onBack={goBack} />
          )}
          {step === 3 && (
            <ConfirmationStep
              form={form}
              spaces={spaces}
              isPending={isPending}
              errorMessage={errorMessage}
              onBack={goBack}
            />
          )}
        </div>
      </div>
    </form>
  );
}
