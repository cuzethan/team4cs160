import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../auth/api";
import { useAuth } from "../auth/AuthContext";

function LoginForm({ role }: { role: "customer" | "manager" }) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSubmitting(true);
    try {
      const user = await login(String(form.get("email")), String(form.get("password")), role);
      setUser(user);
      navigate(user.role === "manager" ? "/manager-dashboard" : "/");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="mb-[18px] flex flex-col">
          <label htmlFor="email" className="mb-2 text-[0.96rem] font-semibold text-ink">Email:</label>
          <input id="email" name="email" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="email" autoComplete="username" required />
        </div>

        <div className="mb-[18px] flex flex-col">
          <label htmlFor="password" className="mb-2 text-[0.96rem] font-semibold text-ink">Password:</label>
          <input id="password" name="password" className="box-border w-full rounded-[10px] border border-border bg-white px-[14px] py-3 text-base text-ink transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-accent-ink focus:outline-none focus:ring-[3px] focus:ring-accent-ink/20" type="password" autoComplete="current-password" required />
        </div>

        <Link to="/forgot-password" className="mb-[22px] mt-[6px] inline-block text-[0.9rem] font-medium text-accent-ink no-underline hover:underline">Forgot your password?</Link>

        {error && <p className="mb-[14px] text-[0.92rem] text-red-700" role="alert">{error}</p>}

        <button disabled={submitting} className="w-full cursor-pointer disabled:cursor-wait disabled:opacity-70 rounded-[10px] border-0 bg-accent px-4 py-[14px] text-base font-semibold text-on-accent transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_10px_20px_rgba(0,0,0,0.12)] active:translate-y-0" type="submit">{submitting ? "Logging in..." : role === "manager" ? "Manager Login" : "Customer Login"}</button>
      </form>
      {role === "customer" ? (
        <p className="mt-5 border-t border-border pt-[18px] text-center text-muted">Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-accent-ink no-underline hover:underline">Sign Up</Link>
        </p>
      ) : null}
    </>
  );
}

export function Login() {
  return <DedicatedLogin role="customer" />;
}

export function DedicatedLogin({ role }: { role: "customer" | "manager" }) {
  return (
    <div className="login-backdrop box-border flex min-h-screen flex-col p-6">
      <div className={`flex ${role === "manager" ? "justify-start" : "justify-end"}`}>
        <Link
          to={role === "customer" ? "/manager-login" : "/customer-login"}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-ink no-underline shadow-sm transition hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {role === "customer" ? "Manager →" : "← Customer"}
        </Link>
      </div>
      <div className="my-auto box-border w-full max-w-[420px] self-center rounded-[18px] border border-border bg-surface px-7 py-8 shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
        <header className="mb-7 text-center text-[2rem] font-extrabold tracking-tight text-ink">{role === "manager" ? "Manager Login" : "Login"}</header>
        <LoginForm role={role} />
      </div>
    </div>
  );
}