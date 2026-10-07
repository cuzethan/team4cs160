// Creates a manager (admin) account. Customers sign up on the site, but
// managers can't, so the first one has to be made from the command line:
//
//   docker compose exec backend npm run create-manager -- <email> <password> [first] [last] [phone]
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { SECURITY_QUESTIONS } from "../auth.js";
import { EmailTakenError, createPgStore } from "../store.js";

const [email, password, firstName = "Store", lastName = "Manager", phone = "000-000-0000"] =
  process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: npm run create-manager -- <email> <password> [first] [last] [phone]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const user = await createPgStore(pool).createUser({
    email,
    firstName,
    lastName,
    phone,
    passwordHash: await bcrypt.hash(password, 10),
    role: "admin",
    // Managers don't use the security-question recovery; re-run this script with a new email instead.
    questionChoice: SECURITY_QUESTIONS[0],
    answerHash: await bcrypt.hash(randomBytes(16).toString("hex"), 10),
  });
  console.log(`Created manager account ${user.email}`);
} catch (error) {
  console.error(error instanceof EmailTakenError ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
