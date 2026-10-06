import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

export function Register() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setFormMessage("Passwords do not match.");
      return;
    }

    setFormMessage("Account creation is not connected yet.");
  };

  return (
    <div className="box-border flex min-h-screen items-stretch justify-center bg-[#fbfaf5] p-6">
      <div className="my-auto box-border w-full max-w-[620px] rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-8 shadow-[0_12px_28px_rgba(42,65,48,0.08)]">
        <header className="mb-7 text-center text-[2rem] font-bold text-[#294332]">Create Account</header>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1">
            <div className="mb-4 flex flex-col">
              <label htmlFor="firstName" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">First Name <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input id="firstName" name="firstName" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="text" autoComplete="given-name" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="lastName" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Last Name <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input id="lastName" name="lastName" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="text" autoComplete="family-name" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="phone" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Phone Number <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input id="phone" name="phone" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="tel" placeholder="e.g. (123) 456-7890" autoComplete="tel" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="email" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Email <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input id="email" name="email" className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]" type="email" autoComplete="email" required />
            </div>

            <div className="mb-4 flex flex-col">
              <label htmlFor="password" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Password <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input
                id="password"
                name="password"
                className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
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
              <label htmlFor="confirmPassword" className="mb-2 text-[0.96rem] font-semibold text-[#253b2d]">Confirm Password <span className="text-[#b42318]" aria-hidden="true">*</span></label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                className="box-border w-full rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-base text-[#253b2d] transition-[border-color,box-shadow] duration-200 ease-in-out focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
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
          </div>

          {formMessage && <p className="mb-[14px] text-[0.92rem] text-[#8b342b]" role="status">{formMessage}</p>}
          <button className="w-full cursor-pointer rounded-[10px] border-0 bg-[#2e4935] px-4 py-[14px] text-base font-semibold text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-[#253b2d] hover:shadow-[0_10px_20px_rgba(42,65,48,0.2)] active:translate-y-0" type="submit">Create Account</button>
        </form>

        <p className="mt-5 text-center text-[0.94rem] text-[#526157]">
          Already have an account? <Link className="font-semibold text-[#416449] no-underline hover:underline" to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}