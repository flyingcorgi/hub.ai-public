import nodemailer from "nodemailer";

// SMTP is a transport interface, not a selected hosting/email vendor. Local compose uses
// Mailpit; production needs an adult-business-permitting provider. Never log links/tokens.
export async function sendAuthMail(to: string, url: string, purpose: "verify" | "reset") {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new Error("Email delivery is not configured");
  const local = ["localhost", "127.0.0.1", "mailpit"].includes(host);
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: !local,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    logger: false,
    debug: false,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    await transport.sendMail({
      from, to,
      subject: purpose === "verify" ? "Verify your FetishUI account" : "Reset your FetishUI password",
      text: `${purpose === "verify" ? "Verify your email address" : "Reset your password"}:\n\n${url}\n\nIf you did not request this, ignore this email.`,
    });
  } catch {
    throw new Error("Email delivery failed");
  } finally {
    transport.close();
  }
}
