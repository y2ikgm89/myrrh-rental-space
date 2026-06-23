import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview } from "@react-email/components";
import { EmailFooter } from "./EmailFooter";
import type { EmailFooterData } from "./footer-data";
import { container, main } from "./styles";

interface Props {
  /** Gmail などの一覧で件名横に出るプレビュー（最初の数十文字） */
  preview: string;
  /** フッター注入用の事業者情報・法的リンクデータ */
  footer: EmailFooterData;
  children: ReactNode;
}

export function EmailLayout({ preview, footer, children }: Props) {
  return (
    <Html lang="ja">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {children}
          <EmailFooter data={footer} />
        </Container>
      </Body>
    </Html>
  );
}
