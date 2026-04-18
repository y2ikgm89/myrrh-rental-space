import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type AddToCalendarLinks = {
  google: string;
  outlookWeb: string;
  ics: string;
};

type Props = {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  numberOfPeople: number;
  registrationId: string;
  addToCalendarLinks?: AddToCalendarLinks;
};

export function EventRegistrationConfirmationEmail({
  customerName,
  eventTitle,
  eventDate,
  startTime,
  endTime,
  location,
  numberOfPeople,
  registrationId,
  addToCalendarLinks,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>イベント申込ありがとうございます - {eventTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>イベント申込確認</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            この度はイベントにお申込みいただき、誠にありがとうございます。
            以下の内容でお申込みを承りました。
          </Text>

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

          {addToCalendarLinks && (
            <Section style={calendarSection}>
              <Text style={calendarHeading}>カレンダーに追加</Text>
              <Text style={calendarDescription}>
                このイベントをカレンダーに追加できます:
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
                <Link href={addToCalendarLinks.ics} style={calendarLink}>
                  iCal (.ics)
                </Link>
              </Text>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={text}>
            ご不明な点がございましたら、お気軽にお問い合わせください。
          </Text>

          <Text style={footer}>Myrrh Rental Space</Text>
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

const hr = {
  borderColor: "#e6e6e6",
  margin: "16px 0",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

const calendarSection = {
  backgroundColor: "#e8f4fd",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "24px 0",
};

const calendarHeading = {
  fontSize: "16px",
  fontWeight: "600",
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

export default EventRegistrationConfirmationEmail;
