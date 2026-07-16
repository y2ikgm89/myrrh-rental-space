-- Phase B.1 オンライン開催イベント: Event に開催形態 (format) / 会議 URL (meetingUrl) /
-- 会議 URL 発行元 (meetingProvider) を追加し、Settings.googleCalendarMeetEnabled
-- (site-wide Meet 自動発行トグル) を per-event meetingProvider に完全置換する。
--
-- 契約:
-- - 既存 Event は全て format=OFFLINE で初期化される (物理会場のみ運用と同一挙動)。
-- - CHECK 制約 event_online_meeting_url_required: ONLINE/HYBRID かつ MANUAL provider の
--   場合のみ meetingUrl 必須。OFFLINE、または GOOGLE_MEET provider (発行前は null 許容) は対象外。
--
-- Spec: docs/superpowers/specs/2026-07-16-online-events-phase-b1-design.md

-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('MANUAL', 'GOOGLE_MEET');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "format" "EventFormat" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN     "meetingProvider" "MeetingProvider" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "meetingUrl" VARCHAR(500);

-- CHECK: ONLINE/HYBRID + MANUAL provider は meetingUrl 必須。既存行は全て format=OFFLINE
-- で初期化されるため違反なし (safe)。
ALTER TABLE "events" ADD CONSTRAINT "event_online_meeting_url_required" CHECK (
  ("format" = 'OFFLINE')
  OR ("meetingProvider" = 'GOOGLE_MEET')
  OR ("meetingUrl" IS NOT NULL)
);

-- AlterTable
-- Google Meet 自動発行を site-wide toggle から per-event Event.meetingProvider に
-- 完全置換する破壊的変更。この migration は main への merge で計画ダウンタイム deploy を
-- トリガーする (deploy workflow が DROP COLUMN を検知して scaling=0 停止 + 310 秒 drain)。
-- 旧参照コード (settings.googleCalendarMeetEnabled 読み書き) は同 PR 内の後続 task で除去する。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarMeetEnabled";
