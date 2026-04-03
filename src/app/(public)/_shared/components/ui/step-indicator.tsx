import type { ReactElement } from "react";
import { IconCheck } from "@tabler/icons-react";

interface Step {
  readonly number: number;
  readonly label: string;
}

interface StepIndicatorProps {
  readonly currentStep: number;
  readonly steps: readonly Step[];
}

export function StepIndicator({
  currentStep,
  steps,
}: StepIndicatorProps): ReactElement {
  return (
    <div
      role="group"
      aria-label="予約手順"
      className="flex items-center justify-center gap-0"
    >
      {steps.map((step, i) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;

        return (
          <div
            key={step.number}
            className="flex items-center"
            aria-current={isActive ? "step" : undefined}
          >
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-10 w-10 items-center justify-center border text-sm transition-colors duration-200 ${
                  isActive
                    ? "border-accent bg-accent/5 text-accent"
                    : isCompleted
                      ? "border-accent bg-accent/5 text-accent"
                      : "border-border text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <IconCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`text-[11px] uppercase tracking-[0.18em] transition-colors duration-300 ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
              <div
                className={`mx-3 mb-5 h-px w-12 transition-colors duration-300 md:mx-4 md:w-16 ${
                  isCompleted ? "bg-accent" : "bg-border"
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
