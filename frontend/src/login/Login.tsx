import { Link, useNavigate } from "react-router-dom";

function Header() {
  return <header className="mb-7 text-center text-[2rem] font-bold text-[#294332]">OFS Login</header>;
}

function Content() {
  const navigate = useNavigate();

  // TODO: call POST /api/auth/login once it exists; for now just go to the home page.
  const handleLogin = () => navigate("/");

  return (
    <>
      <form onSubmit={(event) => {
        event.preventDefault();
        handleLogin();
      }}>
        <div className="mb-[18px] flex flex-col">
          <label htmlFor="username" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Username:</label>
          <input id="username" name="username" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="text" autoComplete="username" required />
        </div>

        <div className="mb-[18px] flex flex-col">
          <label htmlFor="password" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Password:</label>
          <input id="password" name="password" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="password" autoComplete="current-password" required />
        </div>

        <Link to="/forgot-password" className="mb-[22px] mt-[6px] inline-block text-[0.9rem] font-medium text-[#416449] no-underline hover:underline">Forgot your password?</Link>

        <button className="w-full cursor-pointer rounded-[10px] border-0 bg-[#2e4935] px-4 py-[14px] text-base font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-[#253b2d] hover:shadow-[0_10px_20px_rgba(42,65,48,0.2)] active:translate-y-0" type="submit">Login</button>
      </form>
      <p className="mt-5 border-t border-[#e8e7dc] pt-[18px] text-center text-[#526157]">Don't have an account?{" "}
        <Link to="/register" className="font-semibold text-[#416449] no-underline hover:underline">
          Register here
        </Link>
      </p>
    </>
  );
}

export function Login() {
  return (
    <div className="box-border flex min-h-screen items-center justify-center bg-[#fbfaf5] p-6">
      <div className="box-border w-full max-w-[420px] rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-8 shadow-[0_12px_28px_rgba(42,65,48,0.08)]">
        <Header />
        <Content />
      </div>
    </div>
  );
}