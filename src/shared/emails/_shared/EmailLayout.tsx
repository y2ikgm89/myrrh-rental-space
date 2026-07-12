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
      <Head>
        {/*
         * Apple Mail (macOS 12+ / iOS 15+) と Outlook.com の自動ダーク変換で
         * detailsSection (#f9fafb) など淡色 surface だけが反転し、テキスト色
         * が追随せずコントラストが崩れるのを防ぐ。styles.ts の COLOR パレット
         * は light 前提の設計で SSoT であるため、light に固定する。
         *
         * refs:
         * - https://developer.apple.com/documentation/mail-privacy/supporting-dark-mode-in-html-email
         * - https://webkit.org/blog/8840/dark-mode-support-in-webkit/
         */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
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
