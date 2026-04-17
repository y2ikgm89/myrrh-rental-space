import { Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  numberOfPeople: number;
  registrationId: string;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function EventRegistrationConfirmationEmail({
  eventTitle,
  eventDate,
  startTime,
  endTime,
  location,
  numberOfPeople,
  registrationId,
  greeting,
  intro,
  outro,
  preview,
  companyName,
  footerNote,
  supportContactText,
}: Props) {
  return (
    <EmailLayout
      preview={preview}
      companyName={companyName}
      footerNote={footerNote}
      supportContactText={supportContactText}
    >
      <Heading style={heading}>イベント申込確認</Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>申込詳細</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>申込番号:</strong> {registrationId}
        </Text>
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>日付:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>時間:</strong> {startTime} - {endTime}
        </Text>
        {location && (
          <Text style={detailItem}>
            <strong>会場:</strong> {location}
          </Text>
        )}
        <Text style={detailItem}>
          <strong>参加人数:</strong> {String(numberOfPeople)}名
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
  color: "#1a1a1a",
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

export default EventRegistrationConfirmationEmail;
