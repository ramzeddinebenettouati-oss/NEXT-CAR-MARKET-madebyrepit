import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? "NEXT CAR MARKET <noreply@autocango.com>";
const APP_URL = process.env.APP_URL ?? "https://autocango.replit.app";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

export interface VehicleMatchEmailPayload {
  toEmail: string;
  savedSearchName: string;
  vehicle: {
    id: string;
    brandName: string;
    modelName: string;
    year: number;
    condition: string;
    fuelType: string;
    fobPriceUsd: string;
  };
}

function buildHtml(p: VehicleMatchEmailPayload): string {
  const vehicleUrl = `${APP_URL}/vehicles/${p.vehicle.id}`;
  const conditionLabel = p.vehicle.condition.replace("_", " ");
  const price = Number(p.vehicle.fobPriceUsd).toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New vehicle match — NEXT CAR MARKET</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:24px;">
            <span style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f0c040;">
              NEXT CAR MARKET
            </span>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;">
              Saved Search Alert
            </p>
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
              New match for <span style="color:#f0c040;">${p.savedSearchName}</span>
            </h1>
            <p style="margin:0 0 28px;font-size:14px;color:#888;">
              A vehicle matching your saved search is now available on the marketplace.
            </p>

            <!-- Vehicle card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;">${p.vehicle.year}</p>
                  <h2 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#fff;">
                    ${p.vehicle.brandName} ${p.vehicle.modelName}
                  </h2>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-right:20px;padding-bottom:6px;">
                        <span style="font-size:12px;color:#888;">Condition</span><br/>
                        <span style="font-size:14px;font-weight:600;color:#f0f0f0;text-transform:capitalize;">${conditionLabel}</span>
                      </td>
                      <td style="padding-right:20px;padding-bottom:6px;">
                        <span style="font-size:12px;color:#888;">Fuel</span><br/>
                        <span style="font-size:14px;font-weight:600;color:#f0f0f0;text-transform:capitalize;">${p.vehicle.fuelType}</span>
                      </td>
                      <td style="padding-bottom:6px;">
                        <span style="font-size:12px;color:#888;">FOB Price</span><br/>
                        <span style="font-size:16px;font-weight:700;color:#f0c040;">${price}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <a href="${vehicleUrl}"
               style="display:inline-block;background:#f0c040;color:#0a0a0a;font-weight:700;font-size:14px;padding:14px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
              View Vehicle →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#555;line-height:1.6;">
              You're receiving this because you enabled alerts on a saved search in
              <a href="${APP_URL}" style="color:#888;text-decoration:none;">NEXT CAR MARKET</a>.
              To stop these emails, sign in and disable alerts on the saved search.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendVehicleMatchEmail(payload: VehicleMatchEmailPayload): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.info("[mailer] SMTP not configured — skipping email to", payload.toEmail);
    return;
  }
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: payload.toEmail,
      subject: `New match: ${payload.vehicle.year} ${payload.vehicle.brandName} ${payload.vehicle.modelName} — ${payload.savedSearchName}`,
      html: buildHtml(payload),
    });
  } catch (err) {
    console.error("[mailer] Failed to send vehicle match email:", err);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.info("[mailer] SMTP not configured — skipping password reset email to", to);
    return;
  }
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:system-ui;color:#f0f0f0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table width="560" style="max-width:560px;width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:32px;">
        <tr><td><div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#f0c040;">NEXT CAR MARKET</div>
        <h1 style="font-size:24px;color:#fff;margin:28px 0 10px;">Reset your password</h1>
        <p style="font-size:15px;line-height:1.6;color:#aaa;">We received a request to reset your password. This link expires in one hour.</p>
        <a href="${resetUrl}" style="display:inline-block;margin-top:18px;background:#f0c040;color:#0a0a0a;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;">Reset password →</a>
        <p style="font-size:12px;line-height:1.6;color:#666;margin-top:28px;">If you did not request this, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`;
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject: "Reset your NEXT CAR MARKET password", html });
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err);
  }
}
