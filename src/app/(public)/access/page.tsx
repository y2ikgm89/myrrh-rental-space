/**
 * /access — アクセスページ（セクションベース）
 *
 * Hero はセクションシステムから描画。
 * Google Maps 埋め込み + 交通案内 + 駐車場情報 + ビジネス情報。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  IconMapPin,
  IconTrain,
  IconCar,
  IconExternalLink,
} from "@tabler/icons-react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { Section } from "@/public/components/design-system/section";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { getBusinessInfo } from "@/public/data/business";
import { BusinessInfo } from "../contact/_components/business-info";
import { AccessMap } from "./_components/access-map";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("access");
}

async function AccessInfoSection(): Promise<ReactElement> {
  const info = await getBusinessInfo();

  const hasAccessInfo = Boolean(info.accessInfo);
  const hasParkingInfo = Boolean(info.parkingInfo);
  const hasGoogleMapsUrl = Boolean(info.googleMapsUrl);

  if (!hasAccessInfo && !hasParkingInfo && !hasGoogleMapsUrl) {
    return <></>;
  }

  return (
    <ScrollReveal delay={0.1}>
      <div className="space-y-6">
        {/* 交通案内 */}
        {hasAccessInfo && (
          <div className="border border-border p-6">
            <div className="flex items-center gap-2">
              <IconTrain className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                交通案内
              </p>
            </div>
            <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {info.accessInfo}
            </div>
          </div>
        )}

        {/* 駐車場情報 */}
        {hasParkingInfo && (
          <div className="border border-border p-6">
            <div className="flex items-center gap-2">
              <IconCar className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                駐車場
              </p>
            </div>
            <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {info.parkingInfo}
            </div>
          </div>
        )}

        {/* Google Maps で開くボタン */}
        {hasGoogleMapsUrl && (
          <a
            href={info.googleMapsUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center border border-foreground px-5 py-2.5 text-base text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground"
          >
            <IconMapPin className="mr-2 h-4 w-4" />
            Google Maps で開く
            <IconExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </ScrollReveal>
  );
}

export default async function AccessPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("access");

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "cta",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={
        <SiteCTA
          label="Contact"
          title="ご不明な点はお気軽にどうぞ"
          buttonText="お問い合わせ"
          buttonHref="/contact"
        />
      }
    >
      {/* 情報セクション（2カラム） */}
      <section className="pt-10 md:pt-14">
        <Container>
          <div className="mb-8 text-center md:mb-12">
            <ScrollReveal>
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Information
              </span>
              <Heading level={2} className="mt-4 italic">
                ご案内
              </Heading>
            </ScrollReveal>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            {/* 左: 交通案内・駐車場・Google Maps ボタン */}
            <Suspense fallback={null}>
              <AccessInfoSection />
            </Suspense>

            {/* 右: ビジネス情報（住所・電話・営業時間・設備） */}
            <ScrollReveal delay={0.2}>
              <Suspense fallback={null}>
                <BusinessInfo />
              </Suspense>
            </ScrollReveal>
          </div>
        </Container>
      </section>

      {/* 地図セクション（フル幅） */}
      <Section>
        <Container>
          <ScrollReveal>
            <div className="overflow-hidden rounded-lg">
              <Suspense
                fallback={
                  <div className="flex h-[400px] items-center justify-center bg-surface">
                    <p className="text-sm text-muted-foreground">
                      地図を読み込み中...
                    </p>
                  </div>
                }
              >
                <AccessMap />
              </Suspense>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
