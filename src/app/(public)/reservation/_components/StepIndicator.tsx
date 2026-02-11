/**
 * StepIndicator — Horizontal step progress display
 *
 * 3 steps with gold highlight on active step.
 * Server Component — no GSAP needed.
 */

import type { ReactElement } from 'react'

interface StepIndicatorProps {
  readonly currentStep: number
}

const STEPS = [
  { number: 1, label: '日時選択' },
  { number: 2, label: '情報入力' },
  { number: 3, label: '確認' },
] as const

export function StepIndicator({ currentStep }: StepIndicatorProps): ReactElement {
  return (
    <div role="group" aria-label="予約手順" className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const isActive = step.number === currentStep
        const isCompleted = step.number < currentStep

        return (
          <div key={step.number} className="flex items-center" aria-current={isActive ? 'step' : undefined}>
            <div className="flex flex-col items-center gap-2">
              {/* Circle */}
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-medium transition-all duration-300 md:h-10 md:w-10 ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'border-primary bg-primary/10 text-primary-dark'
                      : 'border-border bg-surface text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  step.number
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] tracking-wide transition-colors duration-300 ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 mb-5 h-px w-12 transition-colors duration-300 md:mx-4 md:w-16 ${
                  isCompleted ? 'bg-primary' : 'bg-border'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
