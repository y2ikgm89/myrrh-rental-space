import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type AddToCalendarLinks = {
  google: string;
  outlook: string;
  outlookWeb: string;
  apple: string;
};

type Props = {
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  reservationId: string;
  notes?: string;
  addToCalendarLinks?: AddToCalendarLinks;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function ReservationConfirmationEmail({
  spaceName,
  reservationDate,
  startTime,
  endTime,
  totalPrice,
  reservationId,
  notes,
  addToCalendarLinks,
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
      <Heading style={heading}>ご予約確認</Heading>
      <Text style={text}>{greeting}</Text>
      <Text style={text}>{intro}</Text>
      <Section style={detailsSection}>
        <Text style={detailsHeading}>予約詳細</Text>
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
          <strong>料金:</strong> {totalPrice}
        </Text>
        {notes && (
          <Text style={detailItem}>
            <strong>備考:</strong> {notes}
          </Text>
        )}
      </Section>
      {addToCalendarLinks && (
        <Section style={calendarSection}>
          <Text style={calendarHeading}>カレンダーに追加</Text>
          <Text style={calendarDescription}>
            この予約をカレンダーに追加できます:
          </Text>
          <Text style={calendarLinks}>
            <Link href={addToCalendarLinks.google} style={calendarLink}>
              Google Calendar
            </Link>
            {" | "}
            <Link href={addToCalendarLinks.outlookWeb} style={calendarLink}>
              Outlook
            </Link>
            {" | "}
            <Link href={addToCalendarLinks.apple} style={calendarLink}>
              Apple Calendar
            </Link>
          </Text>
        </Section>
      )}
      <Text style={text}>{outro}</Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "24px",
  fontWeight: "600" as const,
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
  fontWeight: "600" as const,
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

const calendarSection = {
  backgroundColor: "#e8f4fd",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const calendarHeading = {
  fontSize: "16px",
  fontWeight: "600" as const,
  color: "#1a1a1a",
  marginBottom: "8px",
};

const calendarDescription = {
  fontSize: "14px",
  color: "#484848",
  marginBottom: "12px",
};

const calendarLinks = {
  fontSize: "14px",
  lineHeight: "24px",
};

const calendarLink = {
  color: "#0066cc",
  textDecoration: "underline",
};

export default ReservationConfirmationEmail;
