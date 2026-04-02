"use client";

import { createContext, use } from "react";
import type { ReactNode } from "react";
import type { TaxDisplayMode } from "@generated/prisma/enums";

export interface PublicTaxDisplay {
  readonly standardRate: number;
  readonly reducedRate: number;
  readonly displayMode: TaxDisplayMode;
}

const TaxSettingsContext = createContext<PublicTaxDisplay | undefined>(
  undefined,
);

export function TaxSettingsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PublicTaxDisplay;
}) {
  return <TaxSettingsContext value={value}>{children}</TaxSettingsContext>;
}

export function useTaxSettings(): PublicTaxDisplay {
  const ctx = use(TaxSettingsContext);
  if (ctx === undefined)
    throw new Error("useTaxSettings must be used within TaxSettingsProvider");
  return ctx;
}
