"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@hrm/ui";
import { getResumeDownloadUrlAction, presignResumeUploadAction, recordResumeAction } from "./actions";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function ResumeUpload({ candidateId, hasResume }: { candidateId: string; hasResume: boolean }) {
  const [file, setFile] = useState<File | null>(null);
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
      const presign = await presignResumeUploadAction(candidateId, file.name, file.type);
      if (!presign.ok || !presign.data) {
        setError(presign.error ?? "Could not start the upload.");
        return;
      }

      const putRes = await fetch(presign.data.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!putRes.ok) {
        setError("Upload to storage failed.");
        return;
      }

      const record = await recordResumeAction(candidateId, presign.data.objectKey);
      if (!record.ok) {
        setError(record.error ?? "Could not save the resume record.");
        return;
      }

      setFile(null);
      router.refresh();
    });
  }

  async function handleDownload() {
    setError(null);
    const result = await getResumeDownloadUrlAction(candidateId);
    if (!result.ok || !result.url) {
      setError(result.error ?? "Could not get a download link.");
      return;
    }
    window.open(result.url, "_blank");
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <Button type="button" size="sm" onClick={handleUpload} disabled={!file || pending}>
          {pending ? "Uploading..." : "Upload resume"}
        </Button>
        {hasResume && (
          <Button type="button" size="sm" variant="ghost" onClick={handleDownload}>
            Download resume
          </Button>
        )}
      </div>
    </div>
  );
}
