import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Container } from "@/public/components/design-system/container";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { LocationChapter } from "../_components/location-chapter";
import { getPublishedLocationForAccessBySlug } from "@/shared/domain/locations/public-queries";
import { getLocationJsonLdDataBySlug } from "@/public/lib/seo";
import { LocationLocalBusinessJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";

interface PageProps {
  readonly params: Promise<{ locationSlug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { locationSlug } = await params;
  const location = await getPublishedLocationForAccessBySlug(locationSlug);
  if (!location) return { title: "拠点が見つかりません" };

  const baseUrl = getBaseUrl();
  const description =
    location.description ??
    `${location.name}のアクセス情報・営業時間・設備をご案内します`;

  return {
    title: `${location.name} - アクセス`,
    description,
    alternates: {
      canonical: `${baseUrl}/access/${locationSlug}`,
    },
    openGraph: {
      title: `${location.name} - アクセス`,
      description,
      url: `${baseUrl}/access/${locationSlug}`,
      images: location.imageUrl ? [location.imageUrl] : undefined,
    },
  };
}

async function LocationJsonLdSection({
  slug,
}: {
  readonly slug: string;
}): Promise<ReactElement | null> {
  const data = await getLocationJsonLdDataBySlug(slug);
  return data ? <LocationLocalBusinessJsonLd {...data} /> : null;
}

export default async function LocationDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  const { locationSlug } = await params;

  const location = await getPublishedLocationForAccessBySlug(locationSlug);

  if (!location) notFound();

  return (
    <PageLayout
      variant="content"
      cta={
        <SiteCTA
          label="Contact"
          title="ご不明な点はお気軽にどうぞ"
          buttonText="お問い合わせ"
          buttonHref="/contact"
        />
      }
    >
      <Suspense fallback={null}>
        <LocationJsonLdSection slug={locationSlug} />
      </Suspense>
      <section className="pt-12 pb-[var(--space-lg)] md:pt-20">
        <Container>
          <ScrollReveal>
            <LocationChapter
              anchorId={location.slug}
              index={1}
              location={location}
              googleMapsUrl={null}
              showSectionDivider={false}
            />
          </ScrollReveal>
        </Container>
      </section>
    </PageLayout>
  );
}
