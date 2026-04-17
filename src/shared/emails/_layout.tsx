import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export type EmailLayoutProps = {
  preview: string;
  companyName: string;
  footerNote: string | undefined;
  supportContactText: string | undefined;
  children: ReactNode;
};

export function EmailLayout({
  preview,
  companyName,
  footerNote,
  supportContactText,
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {children}
          <Hr style={hr} />
          {supportContactText && (
            <Text style={text}>{supportContactText}</Text>
          )}
          {footerNote && (
            <Section style={footerSection}>
              <Text style={footerNoteStyle}>{footerNote}</Text>
            </Section>
          )}
          <Text style={footer}>{companyName}</Text>
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

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#484848",
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

const footerSection = {
  marginTop: "16px",
};

const footerNoteStyle = {
  fontSize: "12px",
  color: "#8898aa",
  lineHeight: "20px",
};
