"use client";

import { Fragment } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./ActionDropdown";

type ResourceAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type ResourceActionCellProps = {
  actions: ResourceAction[];
};

export function ResourceActionCell({ actions }: ResourceActionCellProps) {
  return (
    <ActionDropdown>
      {actions.map((action, i) => (
        <Fragment key={action.label}>
          {action.destructive && i > 0 && <ActionDropdownSeparator />}
          <ActionDropdownItem
            {...(action.href !== undefined && { href: action.href })}
            {...(action.onClick !== undefined && { onClick: action.onClick })}
            {...(action.destructive !== undefined && {
              destructive: action.destructive,
            })}
            {...(action.disabled !== undefined && {
              disabled: action.disabled,
            })}
          >
            {action.label}
          </ActionDropdownItem>
        </Fragment>
      ))}
    </ActionDropdown>
  );
}
