import { Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  eventTitle: string;
  eventDate: string;
  newEventDate: string;
  location: string | undefined;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function EventUpdatedNotificationEmail({
  eventTitle,
  eventDate,
  newEventDate,
  location,
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
      <Heading style={heading}>イベント内容が変更されました</Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>変更内容</Text>
        <Hr style={hr} />
        <Text style={detailItem}>
          <strong>イベント:</strong> {eventTitle}
        </Text>
        <Text style={detailItem}>
          <strong>変更前の日時:</strong> {eventDate}
        </Text>
        <Text style={detailItem}>
          <strong>変更後の日時:</strong> {newEventDate}
        </Text>
        {location && (
          <Text style={detailItem}>
            <strong>場所:</strong> {location}
          </Text>
        )}
      </Section>

      <Hr style={hr} />

      <Text style={text}>{outro}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#d97706",
  marginBottom: "24px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
};

const detailsSection = {
  backgroundColor: "#fffbeb",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#92400e",
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

export default EventUpdatedNotificationEmail;
