import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

type RecoveryStep = "email" | "answer" | "password";
type ApiResponse = { message?: string; question?: string; resetToken?: string };

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
      let path: string;
      let body: Record<string, string>;
      if (step === "email") {
        path = "/api/auth/recovery/question";
        body = { email: email.trim() };
      } else if (step === "answer") {
        path = "/api/auth/recovery/verify";
        body = { email: email.trim(), answer };
      } else {
        path = "/api/auth/recovery/reset";
        body = { resetToken, password };
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok) throw new Error(result.message ?? "Password recovery failed.");

      if (step === "email") {
        setQuestion(result.question ?? "");
        setStep("answer");
      } else if (step === "answer") {
        setResetToken(result.resetToken ?? "");
        setStep("password");
      } else {
        navigate("/login", { replace: true });
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Password recovery is temporarily unavailable.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute left-1/2 top-1/2 box-border w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-[34px] shadow-[0_12px_28px_rgba(42,65,48,0.12)]">
      <h2 className="mb-3 text-center text-[2rem] font-extrabold tracking-tight text-[#294332]">Forgot Password?</h2>
      <p className="mb-8 text-center text-[0.95rem] text-[#536557]">
        {step === "email" && "Enter the email address on your account."}
        {step === "answer" && "Answer your security question to continue."}
        {step === "password" && "Choose a new password for your account."}
      </p>
      <form noValidate onSubmit={handleSubmit}>
        <div className="mx-auto mb-[15px] w-full max-w-[300px]">
          {step === "email" && <>
            <label htmlFor="email" className="mb-2 block font-semibold text-[#253b2d]">Email:</label>
            <input
              id="email"
              name="email"
              className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
              type="email"
              placeholder="example@gmail.com"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => { setEmail(event.target.value); setFormMessage(""); }}
            />
          </>}
          {step === "answer" && <>
            <p className="mb-3 font-semibold text-[#253b2d]">{question}</p>
            <label htmlFor="answer" className="mb-2 block font-semibold text-[#253b2d]">Your answer:</label>
            <input
              id="answer"
              name="answer"
              className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
              type="text"
              autoComplete="off"
              value={answer}
              required
              onChange={(event) => { setAnswer(event.target.value); setFormMessage(""); }}
            />
          </>}
          {step === "password" && <>
            <label htmlFor="password" className="mb-2 block font-semibold text-[#253b2d]">New password:</label>
            <input
              id="password"
              name="password"
              className="mb-4 box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              required
              onChange={(event) => { setPassword(event.target.value); setFormMessage(""); }}
            />
            <label htmlFor="confirmPassword" className="mb-2 block font-semibold text-[#253b2d]">Confirm new password:</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              required
              onChange={(event) => { setConfirmPassword(event.target.value); setFormMessage(""); }}
            />
          </>}
        </div>
        {formMessage && <p className="mx-auto mb-[15px] w-full max-w-[300px] text-[0.9rem] text-[#b42318]" role="alert">{formMessage}</p>}
        <button className="mx-auto block w-full max-w-[300px] cursor-pointer rounded-[10px] border-0 bg-[#2e4935] px-5 py-3 text-white hover:bg-[#253b2d] disabled:cursor-wait disabled:opacity-70" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait..." : step === "email" ? "Continue" : step === "answer" ? "Verify Answer" : "Reset Password"}
        </button>
        {step !== "email" && <button
          className="mx-auto mt-3 block w-full max-w-[300px] cursor-pointer border-0 bg-transparent py-2 text-[#416449] hover:underline"
          type="button"
          onClick={() => { setStep(step === "password" ? "answer" : "email"); setFormMessage(""); }}
        >
          Back
        </button>}
      </form>
      <Link to="/login" className="mt-[18px] block text-center text-[#416449] no-underline hover:underline">Back to Login</Link>
    </div>
  );
}

export default ForgotPassword;