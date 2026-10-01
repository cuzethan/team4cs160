import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import './ForgotPassword.css';

function ForgotPassword() {
  const emailInput = useRef<HTMLInputElement>(null);
  const [formMessage, setFormMessage] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    setFormMessage('Email format is valid, but password recovery is not connected yet.');
  };

  return (
    <div className="forgot-password-page">
      <h2 className="forgot-password-header">Forgot Password?</h2>
      <p className="forgot-password-instruction">Please enter your email to receive verification codes.</p>
      <form noValidate onSubmit={handleSubmit}>
        <div className="forgot-password-field">
          <label htmlFor="email" className="forgot-password-label">Email:</label>
          <input
            ref={emailInput}
            id="email"
            name="email"
            className="forgot-password-input"
            type="email"
            placeholder="example@gmail.com"
            required
            onChange={() => setFormMessage('')}
          />
        </div>
        {formMessage && <p className="forgot-password-message" role="alert">{formMessage}</p>}
        <button className="forgot-password-button" type="submit">Send Email</button>
      </form>
      <Link to="/login" className="back-to-login-link">Back to Login</Link>
    </div>
  );
}

export default ForgotPassword;