import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  type: "registration" | "cancellation";
  participantName: string;
  participantEmail: string;
  eventTitle: string;
  eventDate: string;
  quantity: number;
  currentRegistrations: number;
  capacity: number | null;
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
    <Html>
      <Head />
      <Preview>
        [{actionText}] {eventTitle} - {participantName}様
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ ...heading, color: actionColor }}>
            {actionText}のお知らせ
          </Heading>

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
              <strong>参加者:</strong> {participantName} ({participantEmail})
            </Text>
            <Text style={detailItem}>
              <strong>参加人数:</strong> {String(quantity)}名
            </Text>
            <Text style={detailItem}>
              <strong>現在の申込状況:</strong> {capacityText}
            </Text>
          </Section>

          <Text style={footer}>Myrrh Rental Space 管理システム</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "24px",
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

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default EventAdminNotificationEmail;
