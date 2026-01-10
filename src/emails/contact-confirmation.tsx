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
} from '@react-email/components'

type Props = {
  name: string
  subject: string
  message: string
}

export function ContactConfirmationEmail({
  name,
  subject,
  message,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>お問い合わせを受け付けました</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>お問い合わせありがとうございます</Heading>

          <Text style={text}>
            {name} 様
          </Text>

          <Text style={text}>
            お問い合わせいただき、誠にありがとうございます。
            以下の内容でお問い合わせを受け付けました。
          </Text>

          <Section style={detailsSection}>
            <Text style={detailsHeading}>お問い合わせ内容</Text>
            <Hr style={hr} />
            <Text style={detailItem}>
              <strong>件名:</strong> {subject}
            </Text>
            <Text style={detailItem}>
              <strong>内容:</strong>
            </Text>
            <Text style={messageText}>
              {message}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            担当者より2-3営業日以内にご連絡いたします。
            今しばらくお待ちくださいますようお願い申し上げます。
          </Text>

          <Text style={footer}>
            Myrrh Rental Space
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#1a1a1a',
  marginBottom: '24px',
}

const text = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
}

const detailsSection = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
}

const detailsHeading = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1a1a1a',
  marginBottom: '12px',
}

const detailItem = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#484848',
  margin: '8px 0',
}

const messageText = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#484848',
  whiteSpace: 'pre-wrap' as const,
  backgroundColor: '#ffffff',
  padding: '12px',
  borderRadius: '4px',
  border: '1px solid #e6e6e6',
}

const hr = {
  borderColor: '#e6e6e6',
  margin: '16px 0',
}

const footer = {
  fontSize: '12px',
  color: '#8898aa',
  marginTop: '32px',
}

export default ContactConfirmationEmail
