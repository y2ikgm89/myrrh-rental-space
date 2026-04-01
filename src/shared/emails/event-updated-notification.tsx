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
  newEventDate: string;
  location: string | undefined;
};

export function EventUpdatedNotificationEmail({
  customerName,
  eventTitle,
  eventDate,
  newEventDate,
  location,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>イベント内容変更のお知らせ - {eventTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>イベント内容が変更されました</Heading>

          <Text style={text}>{customerName} 様</Text>

          <Text style={text}>
            お申し込みいただいたイベントの内容が変更されましたのでお知らせいたします。
          </Text>

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

          <Text style={text}>
            ご不明な点がございましたら、お気軽にお問い合わせください。
            引き続きよろしくお願いいたします。
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

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "32px",
};

export default EventUpdatedNotificationEmail;
