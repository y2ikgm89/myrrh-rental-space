import { Hr, Link, Section, Text } from "@react-email/components";
import { RESERVATION_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { adminNotificationReservationFixture } from "./admin-notification.fixture";
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
  messageText,
} from "./_shared/styles";

type ReservationNotificationProps = {
  type: "reservation";
  action: "new" | "update" | "cancel";
  customerName: string;
  customerEmail: string;
  guestName?: string;
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  adminUrl: string;
  footer: EmailFooterData;
};

type InquiryNotificationProps = {
  type: "inquiry";
  name: string;
  email: string;
  subject: string;
  message: string;
  inquiryId: string;
  adminUrl: string;
  footer: EmailFooterData;
};

type Props = ReservationNotificationProps | InquiryNotificationProps;

const ACTION_COLORS: Record<"new" | "update" | "cancel", string> = {
  new: "#15803d",
  update: "#a16207",
  cancel: "#b91c1c",
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

const guestNameDiffStyle = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#9a3412",
  margin: "2px 0 8px 0",
  paddingLeft: "4px",
};

export function AdminNotificationEmail(props: Props) {
  if (props.type === "inquiry") {
    return <InquiryNotification {...props} />;
  }
  return <ReservationNotification {...props} />;
}

function ReservationNotification({
  action,
  customerName,
  customerEmail,
  guestName,
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  adminUrl,
  footer,
}: ReservationNotificationProps) {
  const actionText = RESERVATION_ACTION_LABELS[action];
  const actionColor = ACTION_COLORS[action];

  return (
    <EmailLayout
      preview={`[${actionText}] ${spaceName} - ${customerName}様`}
      footer={footer}
    >
      <Text style={{ ...heading, color: actionColor }}>
        【{actionText}】のお知らせ
      </Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約情報</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>予約番号:</strong> {reservationId}
        </Text>
        <Text style={detailItem}>
          <strong>お客様:</strong> {customerName} ({customerEmail})
        </Text>
        {guestName && (
          <Text style={guestNameDiffStyle}>※ 予約時入力名: {guestName}</Text>
        )}
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
      </Section>

      <Section style={buttonSection}>
        <Link href={adminUrl} style={ADMIN_BUTTON_STYLE}>
          管理画面で確認
        </Link>
      </Section>
    </EmailLayout>
  );
}

function InquiryNotification({
  name,
  email,
  subject,
  message,
  inquiryId,
  adminUrl,
  footer,
}: InquiryNotificationProps) {
  return (
    <EmailLayout
      preview={`[新規お問い合わせ] ${subject} - ${name}様`}
      footer={footer}
    >
      <Text style={{ ...heading, color: "#1d4ed8" }}>【新規お問い合わせ】</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>お問い合わせ情報</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>ID:</strong> {inquiryId}
        </Text>
        <Text style={detailItem}>
          <strong>お名前:</strong> {name}
        </Text>
        <Text style={detailItem}>
          <strong>メール:</strong> {email}
        </Text>
        <Text style={detailItem}>
          <strong>件名:</strong> {subject}
        </Text>
        <Text style={detailItem}>
          <strong>内容:</strong>
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
          {message}
        </Text>
      </Section>

      <Section style={buttonSection}>
        <Link href={adminUrl} style={ADMIN_BUTTON_STYLE}>
          管理画面で確認
        </Link>
      </Section>
    </EmailLayout>
  );
}

AdminNotificationEmail.PreviewProps = adminNotificationReservationFixture;

export default AdminNotificationEmail;
