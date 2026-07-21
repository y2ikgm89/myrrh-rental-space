import { Hr, Link, Section, Text } from "@react-email/components";
import { reservationRefundFixture } from "./reservation-refund.fixture";
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
  /** 今回返金した金額 (フォーマット済み文字列、例 "¥3,000") */
  refundAmount: string;
  /** 累積返金額 (フォーマット済み文字列、部分返金の履歴込み) */
  cumulativeRefundAmount: string;
  /** 予約の元請求額 (フォーマット済み文字列) */
  originalTotal: string;
  /** 完全返金なら true (残額 0 円)、部分返金なら false */
  isFullyRefunded: boolean;
  /** 管理者入力の返金理由。無い場合は文面から省略。 */
  reason?: string;
  /** 会員向け: マイページの予約履歴 URL。ゲスト予約なら undefined。 */
  memberReservationUrl?: string;
  footer: EmailFooterData;
};

export function ReservationRefundEmail({
  customerName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  reservationId,
  refundAmount,
  cumulativeRefundAmount,
  originalTotal,
  isFullyRefunded,
  reason,
  memberReservationUrl,
  footer,
}: Props) {
  const surface = SECTION_VARIANT_STYLES.warning;

  return (
    <EmailLayout preview={`ご返金のお知らせ - ${spaceName}`} footer={footer}>
      <Text style={heading}>ご返金のお知らせ</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        以下のご予約について、
        {isFullyRefunded ? "全額を返金" : "一部を返金"}
        いたしました。Stripe からの返金処理には、ご利用のカード会社により 通常
        5〜10 営業日程度かかることがございます。
      </Text>

      <Section
        style={{
          backgroundColor: surface.background,
          borderRadius: "8px",
          padding: "20px",
          margin: "24px 0",
        }}
      >
        <Text style={{ ...detailsHeading, color: surface.heading }}>
          返金内訳
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
        <Text style={detailItem}>
          <strong>今回の返金額:</strong> {refundAmount}
        </Text>
        {!isFullyRefunded && (
          <Text style={detailItem}>
            <strong>返金累計額:</strong> {cumulativeRefundAmount} /{" "}
            {originalTotal}
          </Text>
        )}
        {reason && (
          <Text style={detailItem}>
            <strong>返金理由:</strong> {reason}
          </Text>
        )}
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
        ご返金額の反映日についてご不明な点がございましたら、
        ご利用のカード会社まで直接お問い合わせください。
        当サービスへのお問い合わせは、以下の連絡先までお願いいたします。
      </Text>
    </EmailLayout>
  );
}

ReservationRefundEmail.PreviewProps = reservationRefundFixture;

export default ReservationRefundEmail;
