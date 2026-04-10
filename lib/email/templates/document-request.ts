interface DocumentRequestEmailParams {
  firmName: string
  emailBody: string
  uploadUrl: string | null
  acknowledgeUrl: string
}

export function documentRequestEmail({
  firmName,
  emailBody,
  uploadUrl,
  acknowledgeUrl,
}: DocumentRequestEmailParams): string {
  const escapedBody = emailBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  const uploadButton = uploadUrl
    ? `<a href="${uploadUrl}"
         style="display:inline-block;padding:12px 24px;background:#2563EB;color:#ffffff;
                text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;
                font-family:sans-serif;">
         Upload Documents
       </a>`
    : ''

  const acknowledgeButton = `<a href="${acknowledgeUrl}"
       style="display:inline-block;padding:12px 24px;background:#F3F4F6;color:#374151;
              text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;
              font-family:sans-serif;border:1px solid #D1D5DB;">
       Acknowledge
     </a>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Request — ${firmName}</title>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:8px;
              border:1px solid #E5E7EB;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:24px 32px;">
      <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">${firmName}</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#111827;">
        ${escapedBody}
      </p>

      <!-- Action buttons -->
      <div style="margin-top:32px;display:flex;gap:12px;flex-wrap:wrap;">
        ${uploadButton}
        ${acknowledgeButton}
      </div>

      <p style="margin:32px 0 0;font-size:12px;color:#9CA3AF;line-height:1.5;">
        Clicking <strong>Acknowledge</strong> confirms you have received this request.
        ${uploadUrl ? 'Use <strong>Upload Documents</strong> to securely submit the required files.' : ''}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #E5E7EB;background:#F9FAFB;">
      <p style="margin:0;font-size:12px;color:#6B7280;">
        This email was sent by ${firmName} via FirmRunner.
      </p>
    </div>
  </div>
</body>
</html>`
}
