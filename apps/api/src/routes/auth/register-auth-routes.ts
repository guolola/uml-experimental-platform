// Registers account authentication endpoints and delegates state to the auth store.
import type { FastifyInstance } from "fastify";
import {
  authForgotPasswordRequestSchema,
  authLoginRequestSchema,
  authMfaChallengeResponseSchema,
  authMfaVerifyRequestSchema,
  authRegisterRequestSchema,
  authResendVerificationRequestSchema,
  authResetPasswordRequestSchema,
  authSessionResponseSchema,
  authVerifyEmailRequestSchema,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { toSessionDto, toUserDto } from "../../auth/dto.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import {
  clearAdminSessionCookie,
  clearSessionCookie,
  readAdminSessionCookie,
  readSessionCookie,
  setAdminSessionCookie,
  setSessionCookie,
} from "../../auth/session-cookie.js";
import { verifyTotpCode } from "../../auth/totp.js";
import {
  buildTokenMail,
  createMailAdapterFromEnv,
  type MailAdapter,
} from "../../mail/mail-adapter.js";
import { hashPassword, verifyPassword } from "../../security/password-hashing.js";
import { hasAnyAdminRole } from "../../security/admin-rbac.js";

function devTokenPayload(token: string, expiresAt: string) {
  return process.env.NODE_ENV === "production" ? { expiresAt } : { devToken: token, expiresAt };
}

export function registerAuthRoutes({
  app,
  authStore,
  mailAdapter = createMailAdapterFromEnv(),
  billingEntitlements,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  mailAdapter?: MailAdapter;
  billingEntitlements?: {
    grantSignupBonus(userId: string): Promise<void>;
  };
}) {
  app.post("/api/auth/register", async (request, reply) => {
    const input = authRegisterRequestSchema.parse(request.body);
    const user = await authStore.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      emailVerified: false,
    });
    if (!user) {
      reply.code(409);
      return { message: "Email is already registered" };
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    const verification = await authStore.createEmailVerificationToken(user.id);
    await mailAdapter.send(
      buildTokenMail({
        email: user.email,
        purpose: "verify_email",
        token: verification.token,
        expiresAt: verification.expiresAt,
      }),
    );
    await authStore.recordLoginEvent({
      userId: user.id,
      email: user.email,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "Registered and started first session",
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.register",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    reply.code(201);
    return {
      ...authSessionResponseSchema.parse({
        user: toUserDto(user),
        session: toSessionDto(session),
      }),
      verification: {
        ...devTokenPayload(verification.token, verification.expiresAt),
      },
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = authLoginRequestSchema.parse(request.body);
    const user = await authStore.findUserByEmail(input.email);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user?.id ?? null,
        email: input.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Invalid email or password",
      });
      return { message: "Invalid email or password" };
    }
    if (user.status !== "active") {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "User is not active",
      });
      return { message: "User is not active" };
    }
    if (!user.emailVerified) {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Email is not verified",
      });
      return { message: "Email verification is required before login" };
    }

    if (user.mfaEnabled) {
      const challenge = await authStore.createMfaChallenge(user.id);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "success",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "MFA challenge issued",
      });
      reply.code(202);
      return authMfaChallengeResponseSchema.parse({
        mfa: {
          required: true,
          challengeId: challenge.token,
          expiresAt: challenge.expiresAt,
          method: "totp",
        },
      });
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      email: user.email,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.id,
      outcome: "success",
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(session),
    });
  });

  app.post("/api/auth/mfa/verify", async (request, reply) => {
    const input = authMfaVerifyRequestSchema.parse(request.body);
    const user = await authStore.consumeMfaChallenge(input.challengeId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      reply.code(401);
      return { message: "MFA challenge is invalid or expired" };
    }
    if (!verifyTotpCode({ secret: user.mfaSecret, code: input.code })) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "MFA code did not match",
      });
      return { message: "MFA code is invalid" };
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      email: user.email,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "MFA challenge completed",
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.mfa.verify",
      targetType: "session",
      targetId: session.id,
      outcome: "success",
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(session),
    });
  });

  app.post("/api/admin/auth/login", async (request, reply) => {
    const input = authLoginRequestSchema.parse(request.body);
    const user = await authStore.findUserByEmail(input.email);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user?.id ?? null,
        email: input.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Invalid admin email or password",
      });
      return { message: "Invalid email or password" };
    }
    if (user.status !== "active") {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "User is not active",
      });
      return { message: "User is not active" };
    }
    if (!user.emailVerified) {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Email is not verified",
      });
      return { message: "Email verification is required before login" };
    }
    if (!hasAnyAdminRole(user.systemRoles)) {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Admin role required",
      });
      return { message: "Admin role required" };
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Admin MFA is required",
      });
      return { message: "Admin MFA is required before accessing the admin console" };
    }

    const challenge = await authStore.createMfaChallenge(user.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      email: user.email,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "Admin MFA challenge issued",
    });
    reply.code(202);
    return authMfaChallengeResponseSchema.parse({
      mfa: {
        required: true,
        challengeId: challenge.token,
        expiresAt: challenge.expiresAt,
        method: "totp",
      },
    });
  });

  app.post("/api/admin/auth/mfa/verify", async (request, reply) => {
    const input = authMfaVerifyRequestSchema.parse(request.body);
    const user = await authStore.consumeMfaChallenge(input.challengeId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      reply.code(401);
      return { message: "MFA challenge is invalid or expired" };
    }
    if (!hasAnyAdminRole(user.systemRoles)) {
      reply.code(403);
      return { message: "Admin role required" };
    }
    if (!verifyTotpCode({ secret: user.mfaSecret, code: input.code })) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user.id,
        email: user.email,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Admin MFA code did not match",
      });
      return { message: "MFA code is invalid" };
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setAdminSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      email: user.email,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "Admin MFA challenge completed",
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "admin.auth.mfa.verify",
      targetType: "session",
      targetId: session.id,
      outcome: "success",
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(session),
    });
  });

  app.post("/api/admin/auth/logout", async (request, reply) => {
    const sessionId = readAdminSessionCookie(request);
    if (sessionId) {
      await authStore.revokeSession(sessionId);
    }
    clearAdminSessionCookie(reply);
    reply.code(204);
    return null;
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = readSessionCookie(request);
    if (sessionId) {
      await authStore.revokeSession(sessionId);
    }
    clearSessionCookie(reply);
    reply.code(204);
    return null;
  });

  app.post("/api/auth/verify-email", async (request, reply) => {
    const input = authVerifyEmailRequestSchema.parse(request.body);
    const user = await authStore.verifyEmailToken(input.token);
    if (!user) {
      reply.code(400);
      return { message: "Email verification token is invalid or expired" };
    }
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.email.verify",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });
    await billingEntitlements?.grantSignupBonus(user.id);
    return { user: toUserDto(user) };
  });

  app.post("/api/auth/resend-verification", async (request) => {
    const input = authResendVerificationRequestSchema.parse(request.body);
    const user = await authStore.findUserByEmail(input.email);
    if (!user || user.emailVerified) {
      return { message: "If verification is needed, a new email will be sent" };
    }
    const verification = await authStore.createEmailVerificationToken(user.id);
    await mailAdapter.send(
      buildTokenMail({
        email: user.email,
        purpose: "verify_email",
        token: verification.token,
        expiresAt: verification.expiresAt,
      }),
    );
    return {
      message: "If verification is needed, a new email will be sent",
      verification: {
        ...devTokenPayload(verification.token, verification.expiresAt),
      },
    };
  });

  app.post("/api/auth/forgot-password", async (request) => {
    const input = authForgotPasswordRequestSchema.parse(request.body);
    const reset = await authStore.createPasswordResetToken(input.email);
    if (reset) {
      await mailAdapter.send(
        buildTokenMail({
          email: input.email,
          purpose: "reset_password",
          token: reset.token,
          expiresAt: reset.expiresAt,
        }),
      );
    }
    return {
      message: "If the email exists, a reset link will be sent",
      reset: reset
        ? devTokenPayload(reset.token, reset.expiresAt)
        : null,
    };
  });

  app.post("/api/auth/reset-password", async (request, reply) => {
    const input = authResetPasswordRequestSchema.parse(request.body);
    const result = await authStore.resetPasswordWithToken(
      input.token,
      hashPassword(input.newPassword),
    );
    if (!result) {
      reply.code(400);
      return { message: "Password reset token is invalid or expired" };
    }
    clearSessionCookie(reply);
    await authStore.recordAuditLog({
      actorUserId: result.user.id,
      action: "auth.password.reset",
      targetType: "user",
      targetId: result.user.id,
      outcome: "success",
      message: `Revoked ${result.revokedSessionCount} sessions`,
    });
    return {
      user: toUserDto(result.user),
      revokedSessionCount: result.revokedSessionCount,
    };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return authSessionResponseSchema.parse({
      user: toUserDto(auth.user),
      session: toSessionDto(auth.session),
    });
  });
}
