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
  customerName: string;
  eventTitle: string;
  eventDate: string;
};

export function EventCancelledNotificationEmail({
  customerName,
  eventTitle,
  eventDate,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>イベント中止のお知らせ - {eventTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>イベント中止のお知らせ</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            誠に申し訳ございませんが、以下のイベントが中止となりました。
          </Text>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>中止となったイベント</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>イベント:</strong> {eventTitle}
            </Text>
            <Text style={detailItem}>
              <strong>開催予定日:</strong> {eventDate}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            ご不便をおかけして申し訳ございません。
            またのご参加をお待ちしております。
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
  color: "#dc2626",
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

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default EventCancelledNotificationEmail;
