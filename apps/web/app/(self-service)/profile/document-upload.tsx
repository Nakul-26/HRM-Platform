"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Select } from "@hrm/ui";
import { presignUploadAction, recordDocumentAction } from "./actions";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("id_proof");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleUpload() {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only PDF, JPEG, or PNG files are supported.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const presign = await presignUploadAction(employeeId, file.name, file.type);
      if (!presign.ok || !presign.data) {
        setError(presign.error ?? "Could not start the upload.");
        return;
      }

      const putRes = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError("Upload to storage failed.");
        return;
      }

      const record = await recordDocumentAction(employeeId, documentType, presign.data.objectKey);
      if (!record.ok) {
        setError(record.error ?? "Could not save the document record.");
        return;
      }

      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="w-40">
          <option value="id_proof">ID proof</option>
          <option value="contract">Contract</option>
          <option value="certificate">Certificate</option>
          <option value="other">Other</option>
        </Select>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <Button type="button" onClick={handleUpload} disabled={!file || pending}>
          {pending ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </div>
  );
}
