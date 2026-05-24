// CLI entrypoint for the one-time real administrator bootstrap.
import { bootstrapAdminUser } from "./admin-bootstrap.js";
import { createPostgresAuthRepository } from "../auth/postgres-auth-repository.js";
import { createPostgresPoolFromEnv } from "../db/postgres.js";
import { runMigrations } from "../db/migrations.js";
import {
  buildTokenMail,
  createMailAdapterFromEnv,
} from "../mail/mail-adapter.js";

const pool = createPostgresPoolFromEnv();

try {
  await runMigrations(pool);
  const result = await bootstrapAdminUser({
    authStore: createPostgresAuthRepository(pool),
  });
  await createMailAdapterFromEnv().send(
    buildTokenMail({
      email: result.user.email,
      purpose: "verify_email",
      token: result.verification.token,
      expiresAt: result.verification.expiresAt,
    }),
  );
  console.info(
    `Admin bootstrap created ${result.user.email}. Verification expires at ${result.verification.expiresAt}. Disable UML_ENABLE_ADMIN_BOOTSTRAP after first setup.`,
  );
  if (process.env.NODE_ENV !== "production") {
    console.info(`[admin-bootstrap:dev] verificationToken=${result.verification.token}`);
  }
} finally {
  await pool.end();
}
