/**
 * Config Form Registry
 *
 * SectionType → React.lazy コンポーネントのマッピング。
 * 各フォームは default export を持つため React.lazy 互換。
 */

import { lazy, type ComponentType } from "react";
import { SectionType } from "@/shared/lib/validations/section";
import type { ConfigFormProps, ConfigFormSavePayload } from "./shared";

export type { ConfigFormProps, ConfigFormSavePayload };
export { FormActions } from "./shared";

const HeroConfigForm = lazy(() => import("./HeroConfigForm"));
const HeroParallaxConfigForm = lazy(() => import("./HeroParallaxConfigForm"));
const CustomConfigForm = lazy(() => import("./CustomConfigForm"));
const ConceptConfigForm = lazy(() => import("./ConceptConfigForm"));
const ContactFormConfigForm = lazy(() => import("./ContactFormConfigForm"));
const SpaceListConfigForm = lazy(() => import("./SpaceListConfigForm"));
const SpaceShowcaseConfigForm = lazy(() => import("./SpaceShowcaseConfigForm"));
const NewsListConfigForm = lazy(() => import("./NewsListConfigForm"));
const PostListConfigForm = lazy(() => import("./PostListConfigForm"));
const FaqListConfigForm = lazy(() => import("./FaqListConfigForm"));
const FeaturesConfigForm = lazy(() => import("./FeaturesConfigForm"));
const CtaConfigForm = lazy(() => import("./CtaConfigForm"));
const GalleryConfigForm = lazy(() => import("./GalleryConfigForm"));
const TestimonialConfigForm = lazy(() => import("./TestimonialConfigForm"));
const MapConfigForm = lazy(() => import("./MapConfigForm"));
const EmbedConfigForm = lazy(() => import("./EmbedConfigForm"));
const InstagramConfigForm = lazy(() => import("./InstagramConfigForm"));

export const configFormRegistry: Partial<
  Record<SectionType, ComponentType<ConfigFormProps>>
> = {
  [SectionType.HERO]: HeroConfigForm,
  [SectionType.HERO_PARALLAX]: HeroParallaxConfigForm,
  [SectionType.CUSTOM]: CustomConfigForm,
  [SectionType.CONCEPT]: ConceptConfigForm,
  [SectionType.CONTACT_FORM]: ContactFormConfigForm,
  [SectionType.SPACE_LIST]: SpaceListConfigForm,
  [SectionType.SPACE_SHOWCASE]: SpaceShowcaseConfigForm,
  [SectionType.NEWS_LIST]: NewsListConfigForm,
  [SectionType.POST_LIST]: PostListConfigForm,
  [SectionType.FAQ_LIST]: FaqListConfigForm,
  [SectionType.FEATURES]: FeaturesConfigForm,
  [SectionType.CTA]: CtaConfigForm,
  [SectionType.GALLERY]: GalleryConfigForm,
  [SectionType.TESTIMONIAL]: TestimonialConfigForm,
  [SectionType.MAP]: MapConfigForm,
  [SectionType.EMBED]: EmbedConfigForm,
  [SectionType.INSTAGRAM]: InstagramConfigForm,
};
