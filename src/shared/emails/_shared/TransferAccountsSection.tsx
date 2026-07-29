import { Hr, Section, Text } from "@react-email/components";
import {
  TRANSFER_ACCOUNT_TYPE_LABELS,
  type TransferAccountType,
} from "@/shared/lib/validations/enums/helpers";
import { detailItem, detailsHeading, detailsSection, hr, text } from "./styles";

export type TransferAccountEmailDisplay = {
  readonly bankName: string;
  readonly branchName: string;
  readonly accountType: TransferAccountType;
  readonly accountNumber: string;
  readonly accountHolderName: string;
  readonly note?: string | null;
};

type Props = {
  accounts: readonly TransferAccountEmailDisplay[];
  guidance?: string | null;
};

export function TransferAccountsEmailSection({ accounts, guidance }: Props) {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <Section style={detailsSection}>
      <Text style={detailsHeading}>お振込先</Text>
      <Hr style={hr} />
      {guidance ? <Text style={text}>{guidance}</Text> : null}
      {accounts.map((account) => (
        <Section
          key={`${account.bankName}-${account.branchName}-${account.accountNumber}-${account.accountHolderName}`}
        >
          <Text style={detailItem}>
            <strong>{account.bankName}</strong> {account.branchName}
          </Text>
          <Text style={detailItem}>
            {TRANSFER_ACCOUNT_TYPE_LABELS[account.accountType]}{" "}
            {account.accountNumber}
          </Text>
          <Text style={detailItem}>口座名義: {account.accountHolderName}</Text>
          {account.note ? <Text style={detailItem}>{account.note}</Text> : null}
        </Section>
      ))}
    </Section>
  );
}
