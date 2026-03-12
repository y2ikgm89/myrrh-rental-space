/**
 * Admin-safe section registration (side-effect import).
 *
 * Registers section metadata into the admin registry WITHOUT importing
 * server-only dependencies (domain queries, etc.). This file is safe
 * to import from "use client" components.
 *
 * For the 5 sections with server-only dataLoaders (space-list,
 * space-showcase, news-list, post-list, faq-list), we import only
 * their config.ts files which contain schema + meta without any
 * server-only dependencies.
 *
 * For the 12 safe sections, we import their definition.ts directly
 * since they have no server-only imports.
 */
import { registerSectionMeta } from "@/shared/lib/sections/admin-registry";

// --- 12 safe definitions (no server-only dataLoader) ---
import { heroDefinition } from "@/public/components/sections/standard/hero";
import { heroParallaxDefinition } from "@/public/components/sections/standard/hero-parallax";
import { customDefinition } from "@/public/components/sections/standard/custom";
import { conceptDefinition } from "@/public/components/sections/standard/concept";
import { featuresDefinition } from "@/public/components/sections/standard/features";
import { testimonialDefinition } from "@/public/components/sections/standard/testimonial";
import { galleryDefinition } from "@/public/components/sections/standard/gallery";
import { ctaDefinition } from "@/public/components/sections/standard/cta";
import { contactFormDefinition } from "@/public/components/sections/standard/contact-form";
import { mapDefinition } from "@/public/components/sections/standard/map";
import { embedDefinition } from "@/public/components/sections/standard/embed";
import { instagramDefinition } from "@/public/components/sections/standard/instagram";

// --- 5 config-only metas (server-only dataLoader avoided) ---
import { spaceListMeta } from "@/public/components/sections/standard/space-list/config";
import { spaceShowcaseMeta } from "@/public/components/sections/standard/space-showcase/config";
import { newsListMeta } from "@/public/components/sections/standard/news-list/config";
import { postListMeta } from "@/public/components/sections/standard/post-list/config";
import { faqListMeta } from "@/public/components/sections/standard/faq-list/config";

// Register safe definitions (SectionDefinition is a structural superset of SectionMeta)
registerSectionMeta(heroDefinition);
registerSectionMeta(heroParallaxDefinition);
registerSectionMeta(customDefinition);
registerSectionMeta(conceptDefinition);
registerSectionMeta(featuresDefinition);
registerSectionMeta(testimonialDefinition);
registerSectionMeta(galleryDefinition);
registerSectionMeta(ctaDefinition);
registerSectionMeta(contactFormDefinition);
registerSectionMeta(mapDefinition);
registerSectionMeta(embedDefinition);
registerSectionMeta(instagramDefinition);

// Register config-only metas
registerSectionMeta(spaceListMeta);
registerSectionMeta(spaceShowcaseMeta);
registerSectionMeta(newsListMeta);
registerSectionMeta(postListMeta);
registerSectionMeta(faqListMeta);
