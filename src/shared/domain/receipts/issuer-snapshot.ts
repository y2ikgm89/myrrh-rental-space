import "server-only";

import type { ReceiptTx } from "@/shared/domain/receipts/serial";

/** 発行時点の SettingsOrganization を issuerSnapshot JSON として凍結する。 */
export async function fetchIssuerSnapshot(
  tx: ReceiptTx,
): Promise<Record<string, unknown>> {
  const organization = await tx.settingsOrganization.findUnique({
    where: { id: "singleton" },
    select: {
      businessName: true,
      representativeName: true,
      registrationNumber: true,
      invoiceNumber: true,
      email: true,
      phoneNumber: true,
      postalCode: true,
      prefecture: true,
      city: true,
      streetAddress: true,
    },
  });
  return {
    businessName: organization?.businessName ?? null,
    representativeName: organization?.representativeName ?? null,
    registrationNumber: organization?.registrationNumber ?? null,
    invoiceNumber: organization?.invoiceNumber ?? null,
    email: organization?.email ?? null,
    phoneNumber: organization?.phoneNumber ?? null,
    address: {
      postalCode: organization?.postalCode ?? null,
      prefecture: organization?.prefecture ?? null,
      city: organization?.city ?? null,
      streetAddress: organization?.streetAddress ?? null,
    },
    snapshotAt: new Date().toISOString(),
  };
}
