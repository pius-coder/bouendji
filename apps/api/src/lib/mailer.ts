import { env } from "../config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Console transport in development. Resend in production (single fetch, no SDK).
 * Swap for your ESP without touching call sites.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (env.mailer.driver === "console") {
    if (!env.isTest) {
      console.info(`[mail] to=${message.to} subject=${message.subject}\n${message.text}`);
    }
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.mailer.resendKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.mailer.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`mail provider error ${res.status}`);
  }
}

export function verificationEmail(code: string, appName: string): MailMessage["text"] {
  return [
    `Votre code de confirmation ${appName} : ${code}`,
    "",
    "Il expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
  ].join("\n");
}

export function resetEmail(link: string, appName: string): string {
  return [
    `Réinitialisez votre mot de passe ${appName} :`,
    link,
    "",
    "Le lien expire dans 30 minutes et ne peut servir qu'une fois.",
  ].join("\n");
}
