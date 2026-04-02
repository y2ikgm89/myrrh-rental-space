import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import type { TaxSettings } from "@/shared/lib/pricing/types";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import { TaxDisplayMode, TaxInputMode } from "@generated/prisma/enums";
import { isValidTaxDisplayMode } from "@/shared/lib/validations/enums/guards";

function parseTaxDisplayMode(value: string): TaxDisplayMode {
  return isValidTaxDisplayMode(value) ? value : TaxDisplayMode.tax_included;
}

export async function getPublicTaxSettings(): Promise<TaxSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findFirst({
        select: {
          taxStandardRate: true,
          taxReducedRate: true,
          taxDisplayModeAdmin: true,
          taxDisplayModePublic: true,
          taxInputMode: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicTaxSettings",
  });

  if (!result) return DEFAULT_TAX_SETTINGS;

  const plain = toPlainObject(result);

  return {
    standardRate: plain.taxStandardRate,
    reducedRate: plain.taxReducedRate,
    displayModeAdmin: parseTaxDisplayMode(plain.taxDisplayModeAdmin),
    displayModePublic: parseTaxDisplayMode(plain.taxDisplayModePublic),
    inputMode:
      plain.taxInputMode === TaxInputMode.tax_included
        ? TaxInputMode.tax_included
        : TaxInputMode.tax_excluded,
  };
}
