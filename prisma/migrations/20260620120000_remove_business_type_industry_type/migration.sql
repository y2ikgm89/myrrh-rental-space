-- 事業者情報 Settings.businessType / Settings.industryType を撤去
-- 理由: 公開側 read-path がゼロ（admin の保存 UI のみ）の dead column。
-- pre-release / single-instance 構成 (Cloud Run min0/max1) で big-bang DROP を許容。

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "businessType";

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "industryType";
