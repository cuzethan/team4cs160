import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../auth/api';

function ForgotPassword() {
  const emailInput = useRef<HTMLInputElement>(null);
  const [formMessage, setFormMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = emailInput.current;

    if (!email || email.validity.valueMissing) {
      setFormMessage('Please enter your email address.');
      return;
    }

    if (email.validity.typeMismatch) {
      setFormMessage('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      setFormMessage(await requestPasswordReset(email.value));
      setSent(true);
    } catch (err) {
      setFormMessage((err as Error).message);
    }
    setSubmitting(false);
  };

  return (
    <div className="absolute left-1/2 top-1/2 box-border w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-[#e8e7dc] bg-white px-7 py-[34px] shadow-[0_12px_28px_rgba(42,65,48,0.12)]">
      <h2 className="mb-3 text-center text-[2rem] font-extrabold tracking-tight text-[#294332]">Forgot Password?</h2>
      <p className="mb-10 text-center text-[0.95rem] text-[#536557]">Please enter your email to receive verification codes.</p>
      <form noValidate onSubmit={handleSubmit}>
        <div className="mx-auto mb-[15px] w-[300px]">
          <label htmlFor="email" className="block font-semibold text-[#253b2d]">Email:</label>
          <input
            ref={emailInput}
            id="email"
            name="email"
            className="box-border w-[300px] rounded-[10px] border border-[#e6e6dc] bg-white px-[14px] py-3 text-[#253b2d] focus:border-[#416449] focus:outline-none focus:ring-[3px] focus:ring-[rgba(65,100,73,0.18)]"
            type="email"
            placeholder="example@gmail.com"
            required
            onChange={() => {
              setFormMessage('');
              setSent(false);
            }}
          />
        </div>
        {formMessage && <p className={`mx-auto mb-[15px] w-[300px] text-[0.9rem] ${sent ? 'text-[#2e6b3f]' : 'text-[#b42318]'}`} role={sent ? 'status' : 'alert'}>{formMessage}</p>}
        <button disabled={submitting} className="mx-auto block w-[300px] cursor-pointer disabled:cursor-wait disabled:opacity-70 rounded-[10px] border-0 bg-[#2e4935] px-5 py-3 text-white hover:bg-[#253b2d]" type="submit">{submitting ? 'Sending...' : 'Send Email'}</button>
      </form>
      <Link to="/login" className="mt-[18px] block text-center text-[#416449] no-underline hover:underline">Back to Login</Link>
    </div>
  );
}

export default ForgotPassword;