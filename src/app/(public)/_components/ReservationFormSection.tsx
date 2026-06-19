/**
 * ReservationFormSection — async Server Component
 *
 * 既存 `reservation/_components/reservation-form.tsx` (CC) を内包し、必要な
 * 公開クエリ（locations / business-hours / turnstile / customer session /
 * required-terms）を fetch してフォームに供給する。
 *
 * Configurable（schema 参照）:
 * - `defaultSpaceId`: URL `?spaceId=` 未指定時の事前選択スペース ID
 * - `requireLogin`: true のとき未ログイン顧客は `/login` へリダイレクト
 * - `skipStep1` / `enableCoupon`: schema には保存されるが form 側未対応
 */

import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";

import { getPublishedLocationsWithSpaces } from "@/shared/domain/locations/public-queries";
import {
  getBusinessHoursSettingsQuery,
  getReservationRuleSettings,
} from "@/shared/domain/reservations/availability";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { CUSTOMER_PLACEHOLDER_NAME } from "@/shared/domain/customers/link";
import { getRequiredTermsAtReservation } from "@/shared/domain/terms/queries";

import type { ReservationFormConfig } from "@/shared/lib/sections/definitions/reservation-form/schema";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

import { ReservationForm } from "../reservation/_components/reservation-form";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";

interface ReservationFormSectionProps {
  readonly config: ReservationFormConfig;
  readonly style: SectionStylePayload;
  /**
   * URL `?spaceId=` から取得した値（SectionRenderer で parse 済）。
   * 優先度: URL > config.defaultSpaceId > undefined。
   */
  readonly searchParamSpaceId?: string | undefined;
}

export async function ReservationFormSection({
  config,
  style,
  searchParamSpaceId,
}: ReservationFormSectionProps): Promise<ReactElement> {
  const [
    locations,
    businessHours,
    turnstileSiteKey,
    user,
    requiredTerms,
    reservationRules,
  ] = await Promise.all([
    getPublishedLocationsWithSpaces(),
    getBusinessHoursSettingsQuery(),
    getTurnstileSiteKey(),
    getCurrentCustomerUser(),
    getRequiredTermsAtReservation(),
    getReservationRuleSettings(),
  ]);

  if (config.requireLogin && !user) {
    redirect("/login?redirect=/reservation");
  }

  const customer = user ? await getCustomerByUserId(user.id) : null;

  const prefillData = customer
    ? {
        lastName:
          customer.lastName === CUSTOMER_PLACEHOLDER_NAME
            ? ""
            : customer.lastName,
        firstName: customer.firstName,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        companyName: customer.companyName,
      }
    : undefined;

  const candidateSpaceId =
    searchParamSpaceId ?? (config.defaultSpaceId || undefined);
  const initialSpaceId =
    candidateSpaceId &&
    locations.some((loc) => loc.spaces.some((s) => s.id === candidateSpaceId))
      ? candidateSpaceId
      : undefined;

  const hasTitle = config.title.length > 0;
  const hasDescription = config.description.length > 0;
  const hasHeader = hasTitle || hasDescription;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasHeader && (
        <div className="mb-10 text-center md:mb-14">
          {config.sectionLabel && (
            <ScrollReveal>
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            </ScrollReveal>
          )}
          {hasTitle && (
            <div className="mt-4" style={getTitleStyle(style)}>
              <Heading
                level={2}
                className={cn("tracking-tight", getTitleClasses(style))}
              >
                <SplitText>
                  <PortableTextSpans spans={config.title} />
                </SplitText>
              </Heading>
            </div>
          )}
          {hasDescription && (
            <div className="mt-3 text-sm text-muted-foreground md:text-base [&_p]:mt-0 [&_p+p]:mt-3">
              <PortableText blocks={config.description} />
            </div>
          )}
        </div>
      )}

      <div className="mx-auto max-w-4xl">
        <ReservationForm
          key={initialSpaceId ?? ""}
          locations={locations}
          businessHours={businessHours}
          turnstileSiteKey={turnstileSiteKey}
          minReservationDuration={reservationRules.minReservationDuration}
          maxReservationDuration={reservationRules.maxReservationDuration}
          prefillData={prefillData}
          initialSpaceId={initialSpaceId}
          requiredTerms={requiredTerms}
        />
      </div>
    </SectionWrapper>
  );
}
