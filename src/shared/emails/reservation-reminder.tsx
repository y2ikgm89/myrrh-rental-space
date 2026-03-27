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
import { format } from "date-fns";
import { ja } from "date-fns/locale";

type Props = {
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  location: string | undefined;
  notes: string | undefined;
  siteName: string;
};

export function ReservationReminderEmail({
  customerName,
  spaceName,
  startTime,
  endTime,
  location,
  notes,
  siteName,
}: Props) {
  const reservationDate = format(startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const startTimeFormatted = format(startTime, "HH:mm", { locale: ja });
  const endTimeFormatted = format(endTime, "HH:mm", { locale: ja });

  return (
    <Html>
      <Head />
      <Preview>明日のご予約リマインダー: {spaceName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>ご予約リマインダー</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>明日のご予約についてお知らせいたします。</Text>

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
                <Text style={notesText}>{notes}</Text>
              </>
            ) : null}
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </Text>

          <Text style={footer}>{siteName}</Text>
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

const notesText: React.CSSProperties = {
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

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default ReservationReminderEmail;
