"use client";

import Link from "next/link";
import { IconPencil } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from "@/admin/components/ui";
import { EMAIL_TEMPLATE_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplate } from "@/shared/domain/email-templates/types";
import { EmailTemplateEnabledSwitch } from "./EmailTemplateEnabledSwitch";

type Props = { templates: EmailTemplate[] };

export function EmailTemplateTable({ templates }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>種別</TableHead>
              <TableHead className="hidden md:table-cell">件名</TableHead>
              <TableHead>有効</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">
                  {EMAIL_TEMPLATE_TYPE_LABELS[template.type]}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {template.subject}
                </TableCell>
                <TableCell>
                  <EmailTemplateEnabledSwitch
                    type={template.type}
                    enabled={template.enabled}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/admin/settings/email-templates/${template.type}/edit`}
                    >
                      <IconPencil className="mr-2 h-4 w-4" />
                      編集
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
