-- append-only テーブルを外部キーの参照アクションで書き換えられないようにする。
--
-- PostgreSQL の `ON DELETE SET NULL` は**参照している側のテーブルに実 UPDATE を発行する**。
-- audit_logs / terms_agreements / inquiry_status_history には行レベル BEFORE UPDATE の
-- append-only trigger があるので、この UPDATE は `RAISE EXCEPTION` に当たり、
-- **親の DELETE が丸ごと rollback する**。実測（BEGIN ... ROLLBACK で確認）:
--
--   DELETE FROM "user"      -> ERROR: audit_logs is append-only; UPDATE is not allowed
--   DELETE FROM "customers" -> ERROR: terms_agreements is append-only; UPDATE is not allowed
--
-- 壊れている本番導線は 2 本:
--   * 顧客アカウント削除 — mypage の削除申請が audit_logs に自分の userId で 1 行書く
--     （mypage/_shared/actions/account.ts）。その後 Better Auth の削除確定が
--     `tx.user.delete`（customers/customer-lifecycle-commands.ts:162）に到達して落ちる。
--   * 顧客マージ — `tx.customer.delete`（同 :349）。対象は「予約履歴のあるゲスト顧客」なので
--     terms_agreements 行を必ず持つ。admin 経路とマイページ自己統合の両方が該当する。
--
-- ## 方針: 証跡テーブルは FK の書き換え対象にしない
--
-- SET NULL を「許可」するのは誤り。audit_logs の entryHash は userId を含めて計算されるので、
-- NULL 化はハッシュ chain の改ざん検知をその行について壊す。terms_agreements の customerId を
-- NULL 化すれば「誰が同意したか」という証跡そのものが消える。どちらも append-only trigger の
-- 判断（拒否）が正しく、FK 側の参照アクションが誤っている。
--
-- RESTRICT へ倒す案も採らない。それは「監査ログのある利用者は二度と削除できない」に等しく、
-- 上記 2 本の導線を別のかたちで塞ぐだけになる。証跡は「その時点で誰が何をしたか」の記録であり、
-- 対象が後に削除されても記述は真のまま残るべきなので、参照は論理参照へ落とす。
-- 列そのものと索引（audit_logs_userId_idx / terms_agreements_customerId_idx）は残すため、
-- 既存のフィルタ・絞り込みは従来どおり動く。
--
-- ## 残す FK は ON UPDATE も NO ACTION にする
--
-- 親の主キーが変わると `ON UPDATE CASCADE` が子を UPDATE するため、これも同じ trigger に
-- 当たる。今は主キーを更新する経路が無く潜在だが、「append-only テーブルへ UPDATE を発行しうる
-- 参照アクションは持たない」という不変条件を DB 側で言い切れる形にしておく。
-- DELETE 側は据え置く: RESTRICT（refunds / terms_agreements.termsId）はそもそも子を触らず、
-- inquiry_status_history.inquiryId の CASCADE はデータ保持 purge が bypass GUC
-- `myrrh.inquiry_status_history_mutation_bypass` を立てた状態でだけ通る正規経路である。

-- === 1. 証跡テーブルからの FK を撤去（列と索引は残す） =======================
-- squawk-ignore ban-drop-column
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";
-- squawk-ignore ban-drop-column
ALTER TABLE "terms_agreements" DROP CONSTRAINT "terms_agreements_customerId_fkey";
-- squawk-ignore ban-drop-column
ALTER TABLE "inquiry_status_history" DROP CONSTRAINT "inquiry_status_history_changedById_fkey";

-- === 2. 残す FK は ON UPDATE NO ACTION へ =====================================
ALTER TABLE "terms_agreements" DROP CONSTRAINT "terms_agreements_termsId_fkey";
ALTER TABLE "terms_agreements"
  ADD CONSTRAINT "terms_agreements_termsId_fkey"
  FOREIGN KEY ("termsId") REFERENCES "terms_documents"("id")
  ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_reservationId_fkey";
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
  ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_eventRegistrationId_fkey";
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_eventRegistrationId_fkey"
  FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id")
  ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE "inquiry_status_history" DROP CONSTRAINT "inquiry_status_history_inquiryId_fkey";
ALTER TABLE "inquiry_status_history"
  ADD CONSTRAINT "inquiry_status_history_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id")
  ON UPDATE NO ACTION ON DELETE CASCADE;
