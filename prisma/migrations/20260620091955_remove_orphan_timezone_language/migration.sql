-- timezone / language は保存経路（フォーム/command）も consumer も無い orphan 列だった
-- （日付整形は date-format.ts が "Asia/Tokyo" を、html lang は layout が "ja" を固定使用）。
-- pre-release・単一インスタンスのため big-bang DROP。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "timezone";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "language";
