// Provides mail delivery adapters for auth, MFA, and invitation workflows.
import nodemailer from "nodemailer";

export type MailPurpose = "verify_email" | "reset_password" | "project_invitation";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  purpose: MailPurpose;
  token?: string;
  expiresAt?: string;
};

export type MailAdapter = {
  send(message: MailMessage): Promise<void>;
};

export function createMailAdapterFromEnv(): MailAdapter {
  if (process.env.NODE_ENV === "production") {
    return createSmtpMailAdapter();
  }
  return createDevMailAdapter();
}

export function createDevMailAdapter(): MailAdapter & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      console.info(
        `[mail:dev] ${message.purpose} to=${message.to} token=${message.token ?? "<none>"} expiresAt=${message.expiresAt ?? "<none>"}`,
      );
    },
  };
}

export function createSmtpMailAdapter(): MailAdapter {
  const host = readRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = readRequiredEnv("SMTP_USER");
  const pass = readRequiredEnv("SMTP_PASS");
  const from = readRequiredEnv("SMTP_FROM");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return {
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

export function buildTokenMail({
  email,
  purpose,
  token,
  expiresAt,
  projectName,
}: {
  email: string;
  purpose: MailPurpose;
  token: string;
  expiresAt: string;
  projectName?: string;
}): MailMessage {
  if (purpose === "reset_password") {
    return {
      to: email,
      purpose,
      token,
      expiresAt,
      subject: "重置 UML 平台密码",
      text: `请使用以下短期 token 重置密码：${token}\n过期时间：${expiresAt}\n如果不是你本人操作，请忽略这封邮件。`,
    };
  }
  if (purpose === "project_invitation") {
    return {
      to: email,
      purpose,
      token,
      expiresAt,
      subject: `项目邀请：${projectName ?? "UML 平台项目"}`,
      text: `你被邀请加入项目「${projectName ?? "UML 平台项目"}」。请使用邀请 token：${token}\n过期时间：${expiresAt}`,
    };
  }
  return {
    to: email,
    purpose,
    token,
    expiresAt,
    subject: "验证 UML 平台邮箱",
    text: `请使用以下短期 token 验证邮箱：${token}\n过期时间：${expiresAt}`,
  };
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for production SMTP mail delivery`);
  }
  return value;
}
