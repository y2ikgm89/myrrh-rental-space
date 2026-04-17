import { Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  spaceName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  reservationId: string;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
};

export function ReservationCancelledEmail({
  spaceName,
  reservationDate,
  startTime,
  endTime,
  reservationId,
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
      <Heading style={heading}>予約キャンセルのお知らせ</Heading>

      <Text style={text}>{greeting}</Text>

      <Text style={text}>{intro}</Text>

      <Section style={detailsSection}>
        <Text style={detailsHeading}>キャンセルされた予約</Text>
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
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#991b1b",
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

export default ReservationCancelledEmail;
