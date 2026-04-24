import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Suspense } from "react";
import { Cormorant_Garamond, Noto_Sans_JP } from "next/font/google";
import { TaxSettingsProvider } from "@/public/contexts/tax-settings";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { cn } from "@/shared/lib/cn";
import { getAppUrl } from "@/shared/lib/constants";
import "../(public)/_styles/public.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  robots: { index: false, follow: false },
};

export default async function PreviewRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): Promise<ReactElement> {
  const taxSettings = await getPublicTaxSettings();
  const publicTaxDisplay = {
    standardRate: taxSettings.standardRate,
    reducedRate: taxSettings.reducedRate,
    displayMode: taxSettings.displayModePublic,
  };

  return (
    <html lang="ja">
      <body
        className={cn(
          notoSansJP.variable,
          cormorantGaramond.variable,
          "bg-background font-sans text-foreground antialiased",
        )}
      >
        <TaxSettingsProvider value={publicTaxDisplay}>
          <Suspense fallback={<main className="min-h-screen bg-background" />}>
            {children}
          </Suspense>
        </TaxSettingsProvider>
      </body>
    </html>
  );
}
