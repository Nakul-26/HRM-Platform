"use client";

import { useTransition } from "react";
import type { EmployeeDocument } from "@hrm/types";
import { Button, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@hrm/ui";
import { getDownloadUrlAction } from "./actions";

export function DocumentList({ documents }: { documents: EmployeeDocument[] }) {
  const [pending, startTransition] = useTransition();

  function handleDownload(objectKey: string) {
    startTransition(async () => {
      const result = await getDownloadUrlAction(objectKey);
      if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  if (documents.length === 0) {
    return <p className="text-sm text-slate-500">No documents uploaded yet.</p>;
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell>{doc.documentType}</TableCell>
            <TableCell className="text-right">
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => handleDownload(doc.r2ObjectKey)}>
                Download
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
