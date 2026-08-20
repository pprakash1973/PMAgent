import nodemailer from "nodemailer";
import crypto from "crypto";

// ── SMTP Config ───────────────────────────────────────────────────────────────
// Configuration is read from SystemSetting (admin-configured, org-level).
// Falls back to env vars for local dev.
// Passwords are stored encrypted with AES-256-GCM using ENCRYPTION_KEY env var.

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64 hex chars = 32 bytes

export function encryptValue(plaintext: string): string {
  if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY not set");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptValue(ciphertext: string): string {
  if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY not set");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export interface SmtpConfig {
  host?: string;      // e.g. smtp.office365.com
  port?: number;      // 587
  secure?: boolean;   // true = SSL/465; false = STARTTLS/587
  service?: string;   // "gmail" shortcut (overrides host/port)
  user: string;
  password: string;   // plaintext at this point (already decrypted)
  fromName: string;
  fromAddress: string;
}

// Read SMTP config from DB, falling back to env vars
export async function getSmtpConfig(): Promise<SmtpConfig> {
  // Dynamic import to avoid top-level prisma import in edge contexts
  const { prisma } = await import("@/lib/db");

  const keys = ["smtp.host", "smtp.port", "smtp.secure", "smtp.service",
                 "smtp.user", "smtp.password", "smtp.fromName", "smtp.fromAddress"];

  const settings = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  // Prefer DB config; fall back to env vars for dev
  const user = map["smtp.user"] || process.env.GMAIL_USER || "";
  const rawPass = map["smtp.password"] || process.env.GMAIL_APP_PASSWORD || "";

  // Decrypt password if it looks like our cipher format (iv:tag:data).
  // On failure, throw a clear error rather than silently using the ciphertext
  // as the password (which would cause confusing SMTP auth failures).
  let password = rawPass;
  if (rawPass.split(":").length === 3) {
    if (!ENCRYPTION_KEY) {
      throw new Error("SMTP password is encrypted but ENCRYPTION_KEY is not set on the server. Configure ENCRYPTION_KEY to send email.");
    }
    try {
      password = decryptValue(rawPass);
    } catch {
      throw new Error("Failed to decrypt the stored SMTP password (ENCRYPTION_KEY may have changed). Re-save the email password in Admin → Email Configuration.");
    }
  }

  const fromAddress = map["smtp.fromAddress"] || process.env.GMAIL_USER || user;
  const fromName = map["smtp.fromName"] || "PM Agent";

  if (!user || !password) {
    throw new Error("SMTP not configured. Go to Admin → Email Configuration to set it up.");
  }

  return {
    host: map["smtp.host"],
    port: map["smtp.port"] ? parseInt(map["smtp.port"]) : undefined,
    secure: map["smtp.secure"] === "true",
    service: map["smtp.service"] || (process.env.GMAIL_USER ? "gmail" : undefined),
    user,
    password,
    fromName,
    fromAddress,
  };
}

function buildTransport(cfg: SmtpConfig) {
  if (cfg.service) {
    return nodemailer.createTransport({
      service: cfg.service,
      auth: { user: cfg.user, pass: cfg.password },
    });
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port ?? 587,
    secure: cfg.secure ?? false,
    auth: { user: cfg.user, pass: cfg.password },
  });
}

export async function testSmtpConnection(cfg: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = buildTransport(cfg);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

export interface TaskActualsEmailOptions {
  to: string;
  resourceName: string;
  projectName: string;
  cyclePeriod: string;
  tasks: Array<{
    wbsCode: string;
    name: string;
    phase: string;
    baselineStart: string;
    baselineFinish: string;
    estimatedHours: number | null;
    percentComplete: number;
  }>;
  submitUrl: string;
  expiresAt: string;
}

export async function sendTaskActualsEmail(opts: TaskActualsEmailOptions) {
  const cfg = await getSmtpConfig();
  const transport = buildTransport(cfg);

  const taskRows = opts.tasks
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px">${t.wbsCode}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:500">${t.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px">${t.phase}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;text-align:center">${t.estimatedHours != null ? t.estimatedHours + "h" : "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;text-align:center">${t.percentComplete}%</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

        <tr>
          <td style="background:#1e40af;padding:24px 32px">
            <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">${cfg.fromName} · Task Actuals</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700">Please submit your task actuals</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 16px">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">Hi Team,</p>
            <p style="margin:12px 0 0;color:#374151;font-size:14px;line-height:1.6">
              Your Project Manager for <strong>${opts.projectName}</strong> has requested task actuals for the period <strong>${opts.cyclePeriod}</strong>.
              Please review the tasks assigned to you below and submit your hours using the secure link.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#f3f4f6">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.05em;text-transform:uppercase">WBS</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.05em;text-transform:uppercase">Task</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.05em;text-transform:uppercase">Phase</th>
                  <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.05em;text-transform:uppercase">Est. Hrs</th>
                  <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.05em;text-transform:uppercase">Current %</th>
                </tr>
              </thead>
              <tbody>${taskRows}</tbody>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px;text-align:center">
            <a href="${opts.submitUrl}" style="display:inline-block;padding:14px 32px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
              Submit My Actuals
            </a>
            <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">
              This link is personal and single-use. It expires on <strong>${opts.expiresAt}</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">
              You are receiving this because you are listed as a resource on <strong>${opts.projectName}</strong>.
              If this is unexpected, please contact your project manager.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const info = await transport.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
    to: opts.to,
    subject: `PM Agent generated Tasks. Status update awaited`,
    html,
    text: `Hi Team,\n\nYour Project Manager for ${opts.projectName} has requested task actuals for the period ${opts.cyclePeriod}.\n\nSubmit your hours here: ${opts.submitUrl}\n\nThis link is personal and single-use. It expires: ${opts.expiresAt}`,
  });

  return info;
}
