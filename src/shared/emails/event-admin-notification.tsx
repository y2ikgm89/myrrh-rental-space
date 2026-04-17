import { Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  type: "registration" | "cancellation";
  participantEmail: string;
  eventTitle: string;
  eventDate: string;
  numberOfPeople: number;
  currentRegistrations: number;
  capacity: number | null;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function EventAdminNotificationEmail({
  type,
  participantEmail,
  eventTitle,
  eventDate,
  numberOfPeople,
  currentRegistrations,
  capacity,
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: Props) {
  const isRegistration = type === "registration";
  const actionText = isRegistration
    ? "新規イベント申込"
    : "イベント申込キャンセル";
  const actionColor = isRegistration ? "#16a34a" : "#dc2626";

  const capacityText =
    capacity != null
      ? `${String(currentRegistrations)} / ${String(capacity)}名`
      : `${String(currentRegistrations)}名`;

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
        <Text style={detailsHeading}>申込情報</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>参加者メール:</strong> {participantEmail}
        </Text>
        <Text style={detailItem}>
          <strong>参加人数:</strong> {String(numberOfPeople)}名
        </Text>
        <Text style={detailItem}>
          <strong>現在の申込状況:</strong> {capacityText}
        </Text>
      </Section>

      <Hr style={hr} />

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

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

export default EventAdminNotificationEmail;
