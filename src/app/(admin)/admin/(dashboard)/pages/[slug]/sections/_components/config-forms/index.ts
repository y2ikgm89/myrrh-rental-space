/**
 * Config Form Registry
 *
 * SectionType → React.lazy コンポーネントのマッピング。
 * 各フォームは default export を持つため React.lazy 互換。
 */

import { lazy, type ComponentType } from 'react'
import { SectionType } from '@/shared/lib/validations/section'
import type { ConfigFormProps, ConfigFormSavePayload } from './shared'

export type { ConfigFormProps, ConfigFormSavePayload }
export { FormActions } from './shared'

const HeroConfigForm = lazy(() => import('./HeroConfigForm'))
const CustomConfigForm = lazy(() => import('./CustomConfigForm'))
const ContactFormConfigForm = lazy(() => import('./ContactFormConfigForm'))
const SpaceListConfigForm = lazy(() => import('./SpaceListConfigForm'))
const NewsListConfigForm = lazy(() => import('./NewsListConfigForm'))
const PostListConfigForm = lazy(() => import('./PostListConfigForm'))
const FaqListConfigForm = lazy(() => import('./FaqListConfigForm'))
const CtaConfigForm = lazy(() => import('./CtaConfigForm'))
const GalleryConfigForm = lazy(() => import('./GalleryConfigForm'))
const TestimonialConfigForm = lazy(() => import('./TestimonialConfigForm'))
const MapConfigForm = lazy(() => import('./MapConfigForm'))
const EmbedConfigForm = lazy(() => import('./EmbedConfigForm'))

export const configFormRegistry: Partial<Record<SectionType, ComponentType<ConfigFormProps>>> = {
  [SectionType.HERO]: HeroConfigForm,
  [SectionType.CUSTOM]: CustomConfigForm,
  [SectionType.CONTACT_FORM]: ContactFormConfigForm,
  [SectionType.SPACE_LIST]: SpaceListConfigForm,
  [SectionType.NEWS_LIST]: NewsListConfigForm,
  [SectionType.POST_LIST]: PostListConfigForm,
  [SectionType.FAQ_LIST]: FaqListConfigForm,
  [SectionType.CTA]: CtaConfigForm,
  [SectionType.GALLERY]: GalleryConfigForm,
  [SectionType.TESTIMONIAL]: TestimonialConfigForm,
  [SectionType.MAP]: MapConfigForm,
  [SectionType.EMBED]: EmbedConfigForm,
}
