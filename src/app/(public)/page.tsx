/**
 * Homepage — 統一テンプレート (Page Template Architecture)
 *
 * 全公開ページと同じく `getPageSectionsWithFallback("home")` + `<SectionRenderer>` で描画する。
 * PageHero は order=-1 の `page-hero` Section として SectionRenderer に統合済み。
 *
 * WebSite JSON-LD は root layout の GraphJsonLd（Organization + WebSite）が唯一の
 * 発行元。ここでは重複出力しない。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { SectionStack } from "@/public/components/sections/section-stack";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("home");

  return <SectionStack sections={sections} pageSlug="home" />;
}
