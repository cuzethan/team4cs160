import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import groceryBackground from "./background/grocery_background.jpg";

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
      setUser(await login(String(form.get("email")), String(form.get("password")), role));
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="mb-[18px] flex flex-col">
          <label htmlFor="email" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Email:</label>
          <input id="email" name="email" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="email" autoComplete="username" required />
        </div>

        <div className="mb-[18px] flex flex-col">
          <label htmlFor="password" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Password:</label>
          <input id="password" name="password" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="password" autoComplete="current-password" required />
        </div>

        <Link to="/forgot-password" className="mb-[22px] mt-[6px] inline-block text-[0.9rem] font-medium text-[#416449] no-underline hover:underline">Forgot your password?</Link>

        {error && <p className="mb-[14px] text-[0.92rem] text-[#b42318]" role="alert">{error}</p>}

        <button disabled={submitting} className="w-full cursor-pointer disabled:cursor-wait disabled:opacity-70 rounded-[10px] border-0 bg-[#2e4935] px-4 py-[14px] text-base font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-[#253b2d] hover:shadow-[0_10px_20px_rgba(42,65,48,0.2)] active:translate-y-0" type="submit">{submitting ? "Logging in..." : role === "manager" ? "Manager Login" : "Customer Login"}</button>
      </form>
      {role === "customer" ? (
        <p className="mt-5 border-t border-[#e8e7dc] pt-[18px] text-center text-[#526157]">Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-[#416449] no-underline hover:underline">Sign Up</Link>
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
    <div
      className="box-border flex min-h-screen flex-col bg-cover bg-center p-6"
      style={{
        backgroundImage: `url(${groceryBackground})`,
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className={`flex ${role === "manager" ? "justify-start" : "justify-end"}`}>
        <Link
          to={role === "customer" ? "/manager-login" : "/customer-login"}
          className="rounded-md bg-black/35 px-3 py-2 font-semibold text-white no-underline shadow-sm hover:bg-black/50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {role === "customer" ? "Manager →" : "← Customer"}
        </Link>
      </div>
      <div className="my-auto box-border w-full max-w-[420px] self-center rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-8 shadow-[0_12px_28px_rgba(42,65,48,0.08)]">
        <header className="mb-7 text-center text-[2rem] font-extrabold tracking-tight text-[#294332]">{role === "manager" ? "Manager Login" : "Login"}</header>
        <LoginForm role={role} />
      </div>
    </div>
  );
}