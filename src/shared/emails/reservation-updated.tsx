import { Hr, Link, Section, Text } from "@react-email/components";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { reservationUpdatedFixture } from "./reservation-updated.fixture";
import { CalendarLinks } from "./_shared/CalendarLinks";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
  linkDangerStyle,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  notes?: string;
  addToCalendarLinks?: AddToCalendarUrls;
  /** ゲスト向け: 期限内のみ生成される暗号化トークン付き URL */
  cancelUrl?: string;
  /** 会員向け: ログイン後の予約詳細ページ URL（マイページから取消・変更可能） */
  memberReservationUrl?: string;
  /** キャンセル受付期限の時間数（予約開始の X 時間前まで） */
  cancellationDeadlineHours?: number;
  /** 変更受付期限の時間数（予約開始の X 時間前まで）。キャンセルと独立に設定可能 */
  modificationDeadlineHours?: number;
  /** 公開中のキャンセルポリシー規約 URL。無ければ本文はプレーンテキストにフォールバックする */
  cancellationPolicyUrl?: string;
  /**
   * 予約変更に伴い再発行されたスマートロックの一時パスコード一覧。
   * spaceId や時間帯の変更で旧コードが失効した場合、新しいコードを
   * この本文で受け取れるようにする (Codex P1: comment_id=3566998624 対応)。
   */
  smartLockPasscodes?: { deviceName: string; passcode: string }[];
  footer: EmailFooterData;
};

export function ReservationUpdatedEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  notes,
  addToCalendarLinks,
  cancelUrl,
  memberReservationUrl,
  cancellationDeadlineHours,
  modificationDeadlineHours,
  cancellationPolicyUrl,
  smartLockPasscodes,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`ご予約内容が変更されました - ${spaceName}`}
      footer={footer}
    >
      <Text style={heading}>ご予約内容変更のお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        ご予約の内容が変更されましたのでお知らせいたします。
        最新のご予約内容は以下の通りです。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>予約番号:</strong> {reservationId}
        </Text>
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {reservationDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        <Text style={detailItem}>
          <strong>料金:</strong> {totalPrice}
        </Text>
        {notes && (
          <Text style={detailItem}>
            <strong>備考:</strong> {notes}
          </Text>
        )}
      </Section>

      {addToCalendarLinks && <CalendarLinks links={addToCalendarLinks} />}

      {smartLockPasscodes && smartLockPasscodes.length > 0 && (
        <Section style={detailsSection}>
          <Text style={detailsHeading}>
            スマートロック解錠用の暗証番号（再発行）
          </Text>
          <Hr style={hr} />
          <Text style={text}>
            ご予約内容の変更に伴い、暗証番号を再発行しました。
            以前お知らせした番号は無効となりましたので、以下の新しい番号を
            ご利用ください。
          </Text>
          {smartLockPasscodes.map((entry) => (
            <Text
              key={`${entry.deviceName}-${entry.passcode}`}
              style={detailItem}
            >
              <strong>{entry.deviceName}:</strong> {entry.passcode}
            </Text>
          ))}
        </Section>
      )}

      {memberReservationUrl && (
        <Section
          style={{
            backgroundColor: SECTION_VARIANT_STYLES.info.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            会員のお客様は、マイページから予約内容の変更・キャンセル・領収書の確認が
            行えます。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link
              href={memberReservationUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              マイページで予約を確認する
            </Link>
          </Text>
        </Section>
      )}

      {cancelUrl && (
        <Section
          style={{
            backgroundColor: danger.background,
            borderRadius: "8px",
            padding: "16px 20px",
            margin: "24px 0",
          }}
        >
          <Text
            style={{
              fontSize: "14px",
              color: COLOR.textMuted,
              marginBottom: "8px",
            }}
          >
            ご予約のキャンセルは下記のリンクから行えます
            {cancellationDeadlineHours !== undefined && (
              <>（予約開始の {cancellationDeadlineHours} 時間前まで有効）</>
            )}
            。
          </Text>
          <Text style={{ fontSize: "14px", lineHeight: "24px" }}>
            <Link href={cancelUrl} style={linkDangerStyle}>
              予約をキャンセルする
            </Link>
          </Text>
        </Section>
      )}

      {cancellationDeadlineHours !== undefined && (
        <Text style={text}>
          {modificationDeadlineHours !== undefined &&
          modificationDeadlineHours !== cancellationDeadlineHours ? (
            <>
              ご予約のキャンセルは、予約開始時刻の{" "}
              <strong>{cancellationDeadlineHours} 時間前まで</strong>
              、変更は <strong>{modificationDeadlineHours} 時間前まで</strong>
              にお手続きください。
            </>
          ) : (
            <>
              ご予約のキャンセル・変更は、予約開始時刻の{" "}
              <strong>{cancellationDeadlineHours} 時間前まで</strong>
              にお手続きください。
            </>
          )}
          期限を過ぎたお取消しはキャンセル料の対象となる場合が
          ございます。詳しくは
          {cancellationPolicyUrl ? (
            <Link
              href={cancellationPolicyUrl}
              style={{ color: COLOR.link, textDecoration: "underline" }}
            >
              キャンセルポリシー
            </Link>
          ) : (
            "キャンセルポリシー"
          )}
          をご確認ください。
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
}

ReservationUpdatedEmail.PreviewProps = reservationUpdatedFixture;

export default ReservationUpdatedEmail;
