/**
 * SMS sending abstraction.
 *
 * In production set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 * to send real SMS messages.
 *
 * Without those env vars the function logs to the console and returns the OTP
 * in the response (development mode only — never expose devOtp in production).
 */
import { logger } from "./logger";

function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

export async function sendSms(
  to: string,
  body: string,
): Promise<{ devMode: boolean }> {
  if (isTwilioConfigured()) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_PHONE_NUMBER!;

    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio error ${response.status}: ${text}`);
    }

    return { devMode: false };
  }

  // In production, fail closed — never expose the OTP when SMS is unavailable
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SMS provider not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
    );
  }

  // Dev mode only — log to console and surface OTP in response
  logger.info({ to, body }, "[SMS DEV MODE] Would send SMS — Twilio not configured");
  return { devMode: true };
}
