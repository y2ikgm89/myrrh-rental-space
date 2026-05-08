import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Suspense } from "react";
import { TaxSettingsProvider } from "@/public/contexts/tax-settings";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { getAppUrl } from "@/shared/lib/constants";
import "../(public)/_styles/public.css";

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  robots: { index: false, follow: false },
};

async function PreviewTaxProvider({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const taxSettings = await getPublicTaxSettings();
  const publicTaxDisplay = {
    standardRate: taxSettings.standardRate,
    reducedRate: taxSettings.reducedRate,
    displayMode: taxSettings.displayModePublic,
  };

  return (
    <TaxSettingsProvider value={publicTaxDisplay}>
      {children}
    </TaxSettingsProvider>
  );
}

export default function PreviewRootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="ja">
      <body className="bg-background font-sans text-foreground antialiased">
        <Suspense fallback={<main className="min-h-screen bg-background" />}>
          <PreviewTaxProvider>{children}</PreviewTaxProvider>
        </Suspense>
      </body>
    </html>
  );
}
