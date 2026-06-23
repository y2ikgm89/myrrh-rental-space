import { Hr, Link, Section, Text } from "@react-email/components";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { reservationReminderFixture } from "./reservation-reminder.fixture";
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
  messageText,
  text,
} from "./_shared/styles";

type Props = {
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  notes?: string;
  /** ゲスト向け: 期限内のみ生成される暗号化トークン付きキャンセル URL */
  cancelUrl?: string;
  /** 会員向け: マイページの予約詳細 URL */
  memberReservationUrl?: string;
  /** キャンセル受付期限の時間数（予約開始の X 時間前まで） */
  cancellationDeadlineHours?: number;
  footer: EmailFooterData;
};

export function ReservationReminderEmail({
  customerName,
  spaceName,
  startTime,
  endTime,
  location,
  notes,
  cancelUrl,
  memberReservationUrl,
  cancellationDeadlineHours,
  footer,
}: Props) {
  const reservationDate = format(startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTimeFormatted = format(startTime, "HH:mm", { locale: ja });
  const endTimeFormatted = format(endTime, "HH:mm", { locale: ja });
  const danger = SECTION_VARIANT_STYLES.danger;
  const info = SECTION_VARIANT_STYLES.info;

  return (
    <EmailLayout
      preview={`明日のご予約リマインダー: ${spaceName}`}
      footer={footer}
    >
      <Text style={heading}>ご予約リマインダー</Text>

      <Text style={text}>{customerName} 様</Text>

      <Text style={text}>
        明日のご予約についてお知らせいたします。当日は時間に余裕をもってお越しください。
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>ご予約内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>スペース:</strong> {spaceName}
        </Text>
        <Text style={detailItem}>
          <strong>日時:</strong> {reservationDate} {startTimeFormatted} -{" "}
          {endTimeFormatted}
        </Text>
        {location ? (
          <Text style={detailItem}>
            <strong>場所:</strong> {location}
          </Text>
        ) : null}
        {notes ? (
          <>
            <Text style={detailItem}>
              <strong>備考:</strong>
            </Text>
            <Text
              style={{
                ...messageText,
                backgroundColor: COLOR.surface,
                padding: "12px",
                borderRadius: "4px",
                border: `1px solid ${COLOR.border}`,
              }}
            >
              {notes}
            </Text>
          </>
        ) : null}
      </Section>

      {memberReservationUrl && (
        <Section
          style={{
            backgroundColor: info.background,
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
            会員のお客様は、マイページから予約内容のご確認・変更が可能です。
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
            やむを得ずキャンセルされる場合は下記のリンクからお手続きください
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

      <Hr style={hr} />

      <Text style={text}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
        ご来訪をお待ちしております。
      </Text>
    </EmailLayout>
  );
}

ReservationReminderEmail.PreviewProps = reservationReminderFixture;

export default ReservationReminderEmail;
