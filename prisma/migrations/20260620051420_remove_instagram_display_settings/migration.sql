-- Instagram フィードの表示設定（レイアウト・列数・件数・キャプション等）は公開セクションの
-- section.config（instagramConfigSchema）が SSoT で、settings 行のこれらの列は管理フォームへの
-- エコー専用かつ公開描画に一切影響しない死に配線だった。接続情報（access token / account）は残し、
-- 表示設定列と専用 enum InstagramFeedLayout を撤去する。read/write 参照は同一 PR で全除去済み。
-- pre-release・単一インスタンス（min0/max1）で旧リビジョンの参照も同デプロイで消えるため big-bang を許容。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramFeedEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramFeedLayout";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramFeedColumns";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramFeedMaxItems";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramShowCaption";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "instagramShowViewAll";

DROP TYPE "InstagramFeedLayout";
