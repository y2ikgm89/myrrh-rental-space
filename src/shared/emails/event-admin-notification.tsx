import { Hr, Link, Section, Text } from "@react-email/components";
import { eventAdminNotificationFixture } from "./event-admin-notification.fixture";
import { EmailLayout } from "./_shared/EmailLayout";
import type { EmailFooterData } from "./_shared/footer-data";
import {
  COLOR,
  buttonSection,
  detailItem,
  detailsHeading,
  detailsSection,
  heading,
  hr,
} from "./_shared/styles";

type Props = {
  type: "registration" | "cancellation";
  participantName: string;
  // walk-in (当日参加) では null。「未登録 / 当日参加」と表示する
  participantEmail: string | null;
  eventTitle: string;
  eventDate: string;
  quantity: number;
  currentRegistrations: number;
  capacity: number | null;
  /** 管理画面のイベント詳細 URL（クリックで申込一覧を確認） */
  adminUrl?: string;
  footer: EmailFooterData;
};

const ADMIN_BUTTON_STYLE = {
  backgroundColor: COLOR.text,
  borderRadius: "6px",
  color: COLOR.primaryText,
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
  display: "inline-block",
};

export function EventAdminNotificationEmail({
  type,
  participantName,
  participantEmail,
  eventTitle,
  eventDate,
  quantity,
  currentRegistrations,
  capacity,
  adminUrl,
  footer,
}: Props) {
  const isRegistration = type === "registration";
  const actionText = isRegistration
    ? "新規イベント申込"
    : "イベント申込キャンセル";
  const actionColor = isRegistration ? "#15803d" : "#b91c1c";

  const capacityText =
    capacity != null
      ? `${String(currentRegistrations)} / ${String(capacity)}名`
      : `${String(currentRegistrations)}名`;

  return (
    <EmailLayout
      preview={`[${actionText}] ${eventTitle} - ${participantName}様`}
      footer={footer}
    >
      <Text style={{ ...heading, color: actionColor }}>
        【{actionText}】のお知らせ
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>申込情報</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>参加者:</strong> {participantName} (
          {participantEmail ?? "メール未登録 / 当日参加"})
        </Text>
        <Text style={detailItem}>
          <strong>参加人数:</strong> {String(quantity)}名
        </Text>
        <Text style={detailItem}>
          <strong>現在の申込状況:</strong> {capacityText}
        </Text>
      </Section>

      {adminUrl && (
        <Section style={buttonSection}>
          <Link href={adminUrl} style={ADMIN_BUTTON_STYLE}>
            管理画面で確認
          </Link>
        </Section>
      )}
    </EmailLayout>
  );
}

EventAdminNotificationEmail.PreviewProps = eventAdminNotificationFixture;

export default EventAdminNotificationEmail;
