import { Hr, Link, Section, Text } from "@react-email/components";
import { reservationCancelledFixture } from "./reservation-cancelled.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  SECTION_VARIANT_STYLES,
  detailItem,
  detailsHeading,
  heading,
  hr,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  reservationId: string;
  /** 会員向け: ログイン後の予約詳細ページ URL（マイページから履歴確認が可能） */
  memberReservationUrl?: string;
  /** 公開中のキャンセルポリシー規約 URL。無ければ本文はプレーンテキストにフォールバックする */
  cancellationPolicyUrl?: string;
  footer: EmailFooterData;
};

export function ReservationCancelledEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  reservationId,
  memberReservationUrl,
  cancellationPolicyUrl,
  footer,
}: Props) {
  const danger = SECTION_VARIANT_STYLES.danger;

  return (
    <EmailLayout
      preview={`予約キャンセルのお知らせ - ${spaceName}`}
      footer={footer}
    >
      <Text style={heading}>予約キャンセルのお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>以下のご予約がキャンセルされました。</Text>

      <Section
        style={{
          backgroundColor: danger.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: danger.heading }}>
          キャンセルされた予約
        </Text>
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
      </Section>

      {memberReservationUrl && (
        <Text style={text}>
          <Link
            href={memberReservationUrl}
            style={{ color: COLOR.link, textDecoration: "underline" }}
          >
            マイページで予約履歴を確認する
          </Link>
        </Text>
      )}

      <Hr style={hr} />

      <Text style={text}>
        キャンセル料金や払い戻し条件については、当サービスの
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
        をご確認ください。ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>

      <Text style={text}>またのご利用を心よりお待ちしております。</Text>
    </EmailLayout>
  );
}

ReservationCancelledEmail.PreviewProps = reservationCancelledFixture;

export default ReservationCancelledEmail;
