/**
 * お知らせバー設定のZodスキーマ
 *
 * 定義そのものは `@/shared/lib/validations/announcement-bar` が持つ（監査 A-18）。
 * 以前はここと `shared/domain/settings/announcement-bar.ts` に**同名・本文同一**の
 * zod があり、片方だけ直すと保存できない設定項目が無言で増えた。
 */

export {
  announcementBarCarouselSettingsSchema,
  type AnnouncementBarCarouselSettingsInput,
} from "@/shared/lib/validations/announcement-bar";
