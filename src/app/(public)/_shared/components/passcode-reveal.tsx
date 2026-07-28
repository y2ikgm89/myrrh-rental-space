"use client";

import { useState, useTransition, type ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { revealReservationPasscodesAction } from "@/public/actions/reveal-reservation-passcodes";
import type { PasscodeRevealState } from "@/shared/domain/smart-lock/passcode-reveal-state";
import { isMutationError } from "@/shared/lib/mutation-result";

type RevealedPasscode = {
  readonly deviceName: string;
  readonly passcode: string;
};

interface PasscodeRevealProps {
  readonly reservationId: string;
  readonly initialState: PasscodeRevealState;
}

const STATUS_MESSAGES: Record<
  Exclude<PasscodeRevealState["status"], "unavailable" | "visible">,
  string
> = {
  pending:
    "解錠番号を発行しています。しばらくしてから「再表示」を押して再度お試しください。",
  outside_window: "この予約の解錠番号の表示期間外です。",
};

export function PasscodeReveal({
  reservationId,
  initialState,
}: PasscodeRevealProps): ReactElement | null {
  if (initialState.status === "unavailable") {
    return null;
  }

  if (initialState.status === "pending") {
    return (
      <PasscodeRevealInteractive
        reservationId={reservationId}
        initialResolvedStatus="pending"
      />
    );
  }

  if (initialState.status === "outside_window") {
    return (
      <PasscodeRevealSection>
        <p className="text-sm text-muted-foreground">
          {STATUS_MESSAGES.outside_window}
        </p>
      </PasscodeRevealSection>
    );
  }

  return <PasscodeRevealInteractive reservationId={reservationId} />;
}

function PasscodeRevealInteractive({
  reservationId,
  initialResolvedStatus = "idle",
}: {
  readonly reservationId: string;
  readonly initialResolvedStatus?: "idle" | "pending";
}): ReactElement | null {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passcodes, setPasscodes] = useState<
    readonly RevealedPasscode[] | null
  >(null);
  const [resolvedStatus, setResolvedStatus] = useState<
    "idle" | "pending" | "outside_window" | "unavailable"
  >(initialResolvedStatus);

  function handleReveal(): void {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await revealReservationPasscodesAction(reservationId);
      if (isMutationError(result)) {
        setErrorMessage(result.error);
        return;
      }

      switch (result.status) {
        case "visible":
          setPasscodes(result.passcodes);
          setResolvedStatus("idle");
          break;
        case "pending":
          setResolvedStatus("pending");
          break;
        case "outside_window":
          setResolvedStatus("outside_window");
          break;
        case "unavailable":
          setResolvedStatus("unavailable");
          break;
        default: {
          const _exhaustive: never = result.status;
          return _exhaustive;
        }
      }
    });
  }

  if (resolvedStatus === "unavailable") {
    return null;
  }

  if (resolvedStatus === "pending") {
    return (
      <PasscodeRevealSection>
        <p className="text-sm text-muted-foreground">
          {STATUS_MESSAGES.pending}
        </p>
        <Button
          type="button"
          onClick={handleReveal}
          disabled={isPending}
          className="mt-3 w-full sm:w-auto"
        >
          {isPending ? "取得中..." : "再表示"}
        </Button>
        {errorMessage !== null && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </PasscodeRevealSection>
    );
  }

  if (resolvedStatus === "outside_window") {
    return (
      <PasscodeRevealSection>
        <p className="text-sm text-muted-foreground">
          {STATUS_MESSAGES.outside_window}
        </p>
      </PasscodeRevealSection>
    );
  }

  if (passcodes !== null) {
    return (
      <PasscodeRevealSection>
        <ul className="space-y-3">
          {passcodes.map((entry) => (
            <PasscodeEntry key={entry.deviceName} entry={entry} />
          ))}
        </ul>
      </PasscodeRevealSection>
    );
  }

  return (
    <PasscodeRevealSection>
      <p className="mb-3 text-sm text-muted-foreground">
        スマートロックの解錠番号は、表示ボタンを押すと確認できます。
      </p>
      <Button
        type="button"
        onClick={handleReveal}
        disabled={isPending}
        className="w-full sm:w-auto"
      >
        {isPending ? "取得中..." : "解錠番号を表示"}
      </Button>
      {errorMessage !== null && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </PasscodeRevealSection>
  );
}

function PasscodeEntry({
  entry,
}: {
  readonly entry: RevealedPasscode;
}): ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy(): void {
    void navigator.clipboard
      .writeText(entry.passcode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setCopied(false);
      });
  }

  return (
    <li className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{entry.deviceName}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg tracking-widest text-foreground">
          {entry.passcode}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-foreground underline underline-offset-4 hover:text-accent"
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
    </li>
  );
}

function PasscodeRevealSection({
  children,
}: {
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <div className="border-t border-border px-4 py-4 sm:px-6">
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        スマートロック
      </p>
      {children}
    </div>
  );
}
