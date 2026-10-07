import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../auth/api";

const inputClass =
  "box-border w-[300px] rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]";

// The page the "Forgot password" email links to: /reset-password?token=...
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setFormMessage("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setFormMessage("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      setFormMessage(await resetPassword(token, password));
      setDone(true);
    } catch (err) {
      setFormMessage((err as Error).message);
    }
    setSubmitting(false);
  };

  return (
    <div className="absolute left-1/2 top-1/2 box-border w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-[34px] shadow-[0_12px_28px_rgba(42,65,48,0.12)]">
      <h2 className="mb-3 text-center text-[2rem] font-extrabold tracking-tight text-[#294332]">Reset Password</h2>
      {!token ? (
        <p className="mb-6 text-center text-[0.95rem] text-[#b42318]" role="alert">
          This reset link is missing its code. Please use the link from your email.
        </p>
      ) : done ? (
        <p className="mb-6 text-center text-[0.95rem] text-[#2e6b3f]" role="status">{formMessage}</p>
      ) : (
        <>
          <p className="mb-8 text-center text-[0.95rem] text-[#536557]">Choose a new password for your account.</p>
          <form onSubmit={handleSubmit}>
            <div className="mx-auto mb-[15px] w-[300px]">
              <label htmlFor="password" className="block font-semibold text-[#253b2d]">New Password:</label>
              <input
                id="password"
                name="password"
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFormMessage("");
                }}
                required
              />
            </div>
            <div className="mx-auto mb-[15px] w-[300px]">
              <label htmlFor="confirmPassword" className="block font-semibold text-[#253b2d]">Confirm Password:</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setFormMessage("");
                }}
                required
              />
            </div>
            {formMessage && <p className="mx-auto mb-[15px] w-[300px] text-[0.9rem] text-[#b42318]" role="alert">{formMessage}</p>}
            <button disabled={submitting} className="mx-auto block w-[300px] cursor-pointer rounded-[10px] border-0 bg-[#2e4935] px-5 py-3 text-white hover:bg-[#253b2d] disabled:cursor-wait disabled:opacity-70" type="submit">
              {submitting ? "Saving..." : "Reset Password"}
            </button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-[18px] block text-center text-[#416449] no-underline hover:underline">Back to Login</Link>
    </div>
  );
}
