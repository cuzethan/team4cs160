import type pg from "pg";

export type Role = "customer" | "admin";

export type User = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  accountStatus: "active" | "disabled";
  questionChoice: string;
  answerHash: string;
};

export type NewUser = Omit<User, "userId" | "accountStatus">;

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}

// Everything the auth routes need from the database. The Postgres version is
// used by the server; tests swap in an in-memory one.
export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  createUser(user: NewUser): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSessionUser(tokenHash: string): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  // Marks the token used and returns its user, or null if it is unknown, used or expired.
  consumeResetToken(tokenHash: string): Promise<string | null>;
}

const userColumns = `
  user_id AS "userId", first_name AS "firstName", last_name AS "lastName",
  email, phone, password_hash AS "passwordHash", role, account_status AS "accountStatus",
  question_choice AS "questionChoice", answer_hash AS "answerHash"
`;

export function createPgStore(pool: pg.Pool): AuthStore {
  return {
    async findUserByEmail(email) {
      const { rows } = await pool.query<User>(
        `SELECT ${userColumns} FROM users WHERE lower(email) = lower($1)`,
        [email],
      );
      return rows[0] ?? null;
    },

    async createUser(user) {
      try {
        const { rows } = await pool.query<User>(
          `INSERT INTO users
             (first_name, last_name, email, phone, password_hash, role, question_choice, answer_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${userColumns}`,
          [
            user.firstName, user.lastName, user.email, user.phone,
            user.passwordHash, user.role, user.questionChoice, user.answerHash,
          ],
        );
        return rows[0];
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new EmailTakenError();
        throw error;
      }
    },

    async updatePassword(userId, passwordHash) {
      await pool.query("UPDATE users SET password_hash = $2 WHERE user_id = $1", [userId, passwordHash]);
    },

    async createSession(userId, tokenHash, expiresAt) {
      await pool.query(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async findSessionUser(tokenHash) {
      const { rows } = await pool.query<User>(
        `SELECT ${userColumns} FROM sessions JOIN users USING (user_id)
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteUserSessions(userId) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    },

    async createResetToken(userId, tokenHash, expiresAt) {
      await pool.query(
        "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async consumeResetToken(tokenHash) {
      const { rows } = await pool.query<{ userId: string }>(
        `UPDATE password_reset_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING user_id AS "userId"`,
        [tokenHash],
      );
      return rows[0]?.userId ?? null;
    },
  };
}
