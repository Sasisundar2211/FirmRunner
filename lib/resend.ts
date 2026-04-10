import { Resend } from 'resend'

let resendInstance: Resend | null = null

export function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY!)
  }
  return resendInstance
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
}

/** Wraps plain text in a minimal HTML email shell. */
export function toHtmlEmail(plainText: string): string {
  const escaped = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#111;">` +
    `<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.6;">${escaped}</pre>` +
    `</div>`
}

export async function sendEmail(params: SendEmailParams) {
  const resend = getResend()
  return resend.emails.send({
    from: params.from ?? process.env.RESEND_FROM_EMAIL ?? 'noreply@firmrunner.app',
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  })
}
