import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSecurityQuestion, resetPassword, verifySecurityAnswer } from "../auth/api";

type RecoveryStep = "email" | "answer" | "password";

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");

    if (step === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormMessage("Please enter a valid email address.");
      return;
    }
    if (step === "password") {
      if (password.length < 8) {
        setFormMessage("Your password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setFormMessage("Passwords do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (step === "email") {
        setQuestion(await getSecurityQuestion(email.trim()));
        setStep("answer");
      } else if (step === "answer") {
        setResetToken(await verifySecurityAnswer(email.trim(), answer));
        setStep("password");
      } else {
        await resetPassword(resetToken, password);
        navigate("/login", { replace: true });
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Password recovery is temporarily unavailable.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute left-1/2 top-1/2 box-border w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-border bg-white px-7 py-[34px] shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
      <h2 className="mb-3 text-center text-[2rem] font-extrabold tracking-tight text-ink">Forgot Password?</h2>
      <p className="mb-8 text-center text-[0.95rem] text-muted">
        {step === "email" && "Enter the email address on your account."}
        {step === "answer" && "Answer your security question to continue."}
        {step === "password" && "Choose a new password for your account."}
      </p>
      <form noValidate onSubmit={handleSubmit}>
        <div className="mx-auto mb-[15px] w-full max-w-[300px]">
          {step === "email" && <>
            <label htmlFor="email" className="mb-2 block font-semibold text-ink">Email:</label>
            <input
              id="email"
              name="email"
              className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-ink focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
              type="email"
              placeholder="example@gmail.com"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => { setEmail(event.target.value); setFormMessage(""); }}
            />
          </>}
          {step === "answer" && <>
            <p className="mb-3 font-semibold text-ink">{question}</p>
            <label htmlFor="answer" className="mb-2 block font-semibold text-ink">Your answer:</label>
            <input
              id="answer"
              name="answer"
              className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-ink focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
              type="text"
              autoComplete="off"
              value={answer}
              required
              onChange={(event) => { setAnswer(event.target.value); setFormMessage(""); }}
            />
          </>}
          {step === "password" && <>
            <label htmlFor="password" className="mb-2 block font-semibold text-ink">New password:</label>
            <input
              id="password"
              name="password"
              className="mb-4 box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-ink focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              required
              onChange={(event) => { setPassword(event.target.value); setFormMessage(""); }}
            />
            <label htmlFor="confirmPassword" className="mb-2 block font-semibold text-ink">Confirm new password:</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-ink focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              required
              onChange={(event) => { setConfirmPassword(event.target.value); setFormMessage(""); }}
            />
          </>}
        </div>
        {formMessage && <p className="mx-auto mb-[15px] w-full max-w-[300px] text-[0.9rem] text-red-700" role="alert">{formMessage}</p>}
        <button className="mx-auto block w-full max-w-[300px] cursor-pointer rounded-[10px] border-0 bg-accent px-5 py-3 text-on-accent hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait..." : step === "email" ? "Continue" : step === "answer" ? "Verify Answer" : "Reset Password"}
        </button>
        {step !== "email" && <button
          className="mx-auto mt-3 block w-full max-w-[300px] cursor-pointer border-0 bg-transparent py-2 text-accent-ink hover:underline"
          type="button"
          onClick={() => { setStep(step === "password" ? "answer" : "email"); setFormMessage(""); }}
        >
          Back
        </button>}
      </form>
      <Link to="/login" className="mt-[18px] block text-center text-accent-ink no-underline hover:underline">Back to Login</Link>
    </div>
  );
}

export default ForgotPassword;