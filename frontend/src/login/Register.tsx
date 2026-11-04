import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SECURITY_QUESTIONS, register } from "../auth/api";
import { useAuth } from "../auth/AuthContext";

export function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMessage, setFormMessage] = useState("");

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

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      setUser(await register({
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        phone: String(form.get("phone")),
        email: String(form.get("email")),
        password,
        securityQuestion: String(form.get("securityQuestion")),
        securityAnswer: String(form.get("securityAnswer")),
      }));
      navigate("/");
    } catch (err) {
      setFormMessage((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="box-border flex min-h-screen items-stretch justify-center bg-canvas p-6">
      <div className="my-auto box-border w-full max-w-[620px] rounded-[18px] border border-border bg-white px-7 py-8 shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
        <header className="mb-7 text-center text-[2rem] font-bold text-ink">Create Account</header>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1">
            <div className="mb-4 flex flex-col">
              <label htmlFor="firstName" className="mb-2 text-[0.96rem] font-semibold text-ink">First Name <span className="text-red-700" aria-hidden="true">*</span></label>
              <input id="firstName" name="firstName" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="text" autoComplete="given-name" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="lastName" className="mb-2 text-[0.96rem] font-semibold text-ink">Last Name <span className="text-red-700" aria-hidden="true">*</span></label>
              <input id="lastName" name="lastName" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="text" autoComplete="family-name" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="phone" className="mb-2 text-[0.96rem] font-semibold text-ink">Phone Number <span className="text-red-700" aria-hidden="true">*</span></label>
              <input id="phone" name="phone" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="tel" placeholder="e.g. (123) 456-7890" autoComplete="tel" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="email" className="mb-2 text-[0.96rem] font-semibold text-ink">Email <span className="text-red-700" aria-hidden="true">*</span></label>
              <input id="email" name="email" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="email" autoComplete="email" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="password" className="mb-2 text-[0.96rem] font-semibold text-ink">Password <span className="text-red-700" aria-hidden="true">*</span></label>
              <input
                id="password"
                name="password"
                className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
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

            <div className="mb-4 flex flex-col">
              <label htmlFor="confirmPassword" className="mb-2 text-[0.96rem] font-semibold text-ink">Confirm Password <span className="text-red-700" aria-hidden="true">*</span></label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
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

            <div className="mb-4 flex flex-col">
              <label htmlFor="securityQuestion" className="mb-2 text-[0.96rem] font-semibold text-ink">Choose a question <span className="text-red-700" aria-hidden="true">*</span></label>
              <select
                id="securityQuestion"
                name="securityQuestion"
                className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
                defaultValue=""
                required
              >
                <option value="" disabled>Select a security question</option>
                {SECURITY_QUESTIONS.map((question) => (
                  <option key={question} value={question}>{question}</option>
                ))}
              </select>
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="securityAnswer" className="mb-2 text-[0.96rem] font-semibold text-ink">Answer <span className="text-red-700" aria-hidden="true">*</span></label>
              <input
                id="securityAnswer"
                name="securityAnswer"
                className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
                type="text"
                autoComplete="off"
                required
              />
            </div>
          </div>

          {formMessage && <p className="mb-[14px] text-[0.92rem] text-red-700" role="alert">{formMessage}</p>}
          <button disabled={submitting} className="w-full cursor-pointer disabled:cursor-wait disabled:opacity-70 rounded-[10px] border-0 bg-accent px-4 py-[14px] text-base font-semibold text-on-accent transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_10px_20px_rgba(0,0,0,0.12)] active:translate-y-0" type="submit">{submitting ? "Creating account..." : "Create Account"}</button>
        </form>

        <p className="mt-5 text-center text-[0.94rem] text-muted">
          Already have an account? <Link className="font-semibold text-accent-ink no-underline hover:underline" to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}