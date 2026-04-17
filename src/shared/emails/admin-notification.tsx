import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import { RESERVATION_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { EmailLayout } from "./_layout";

type CommonTemplateProps = {
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

type ReservationNotificationProps = CommonTemplateProps & {
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
};

type InquiryNotificationProps = CommonTemplateProps & {
  type: "inquiry";
  name: string;
  email: string;
  subject: string;
  message: string;
  inquiryId: string;
  adminUrl: string;
};

type Props = ReservationNotificationProps | InquiryNotificationProps;

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
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: ReservationNotificationProps) {
  const actionText = RESERVATION_ACTION_LABELS[action];

  const actionColor = {
    new: "#16a34a",
    update: "#ca8a04",
    cancel: "#dc2626",
  }[action];

  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={{ ...heading, color: actionColor }}>
        {actionText}のお知らせ
      </Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

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
        <Link href={adminUrl} style={button}>
          管理画面で確認
        </Link>
      </Section>

      <Text style={text}>{outro}</Text>
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
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: InquiryNotificationProps) {
  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={{ ...heading, color: "#2563eb" }}>
        新規お問い合わせ
      </Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

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
        <Text style={messageText}>{message}</Text>
      </Section>

      <Section style={buttonSection}>
        <Link href={adminUrl} style={button}>
          管理画面で確認
        </Link>
      </Section>

      <Text style={text}>{outro}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const detailsSection = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#1a1a1a",
  marginBottom: "12px",
};

const detailItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#484848",
  margin: "8px 0",
};

const guestNameDiffStyle = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#b45309",
  margin: "2px 0 8px 0",
  paddingLeft: "4px",
};

const messageText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#484848",
  whiteSpace: "pre-wrap",
  backgroundColor: "#ffffff",
  padding: "12px",
  borderRadius: "4px",
  border: "1px solid #e6e6e6",
};

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
};

const button = {
  backgroundColor: "#1a1a1a",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 24px",
  textDecoration: "none",
  display: "inline-block",
};

export default AdminNotificationEmail;
