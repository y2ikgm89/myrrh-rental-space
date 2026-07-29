import {
  TRANSFER_ACCOUNT_TYPE_LABELS,
  type TransferAccountType,
} from "@/shared/lib/validations/enums/helpers";

export type TransferAccountPublicDisplay = {
  readonly bankName: string;
  readonly branchName: string;
  readonly accountType: TransferAccountType;
  readonly accountNumber: string;
  readonly accountHolderName: string;
  readonly note?: string | null;
};

type Props = {
  accounts: readonly TransferAccountPublicDisplay[];
  guidance?: string | null;
};

export function TransferAccountsSection({ accounts, guidance }: Props) {
  if (accounts.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border px-4 py-4 sm:px-6">
      <h3 className="text-sm font-medium text-foreground">お振込先</h3>
      {guidance ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {guidance}
        </p>
      ) : null}
      <ul className="mt-3 space-y-4">
        {accounts.map((account) => (
          <li
            key={`${account.bankName}-${account.branchName}-${account.accountNumber}-${account.accountHolderName}`}
            className="rounded border border-border p-3 text-sm"
          >
            <p className="font-medium text-foreground">
              {account.bankName} {account.branchName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {TRANSFER_ACCOUNT_TYPE_LABELS[account.accountType]}{" "}
              {account.accountNumber}
            </p>
            <p className="mt-1 text-muted-foreground">
              口座名義: {account.accountHolderName}
            </p>
            {account.note ? (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {account.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
