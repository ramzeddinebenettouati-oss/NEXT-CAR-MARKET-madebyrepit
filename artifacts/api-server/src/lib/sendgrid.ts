import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface SendEmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }

  const fromAddress = opts.from || getDefaultFromAddress();

  const msg: sgMail.MailDataRequired = {
    from: fromAddress,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.html ? { html: opts.html } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  };

  const [response] = await sgMail.send(msg);
  return { id: response.headers["x-message-id"] as string, sent: true };
}

export function getDefaultFromAddress(): string {
  return process.env.SENDGRID_FROM_EMAIL || "noreply@nextcarmarket.com";
}

export function isSendGridConfigured(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

export function isCustomDomainConfigured(): boolean {
  const from = process.env.SENDGRID_FROM_EMAIL;
  return !!from;
}
