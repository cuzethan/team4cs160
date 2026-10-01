import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import "./Login.css";
import "./Register.css";


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
    <div className="login-page register-page">
      <div className="login-card register-card">
        <header className="login-header">Create Account</header>
        <form onSubmit={handleSubmit}>
          <div className="register-fields">
            <div className="login-field">
              <label htmlFor="firstName" className="login-label">First Name <span className="required-marker" aria-hidden="true">*</span></label>
              <input id="firstName" name="firstName" className="login-input" type="text" autoComplete="given-name" required />
            </div>

            <div className="login-field">
              <label htmlFor="lastName" className="login-label">Last Name <span className="required-marker" aria-hidden="true">*</span></label>
              <input id="lastName" name="lastName" className="login-input" type="text" autoComplete="family-name" required />
            </div>

            <div className="login-field">
              <label htmlFor="phone" className="login-label">Phone Number <span className="required-marker" aria-hidden="true">*</span></label>
              <input id="phone" name="phone" className="login-input" type="tel" placeholder="e.g. (123) 456-7890" autoComplete="tel" required />
            </div>

            <div className="login-field">
              <label htmlFor="email" className="login-label">Email <span className="required-marker" aria-hidden="true">*</span></label>
              <input id="email" name="email" className="login-input" type="email" autoComplete="email" required />
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">Password <span className="required-marker" aria-hidden="true">*</span></label>
              <input
                id="password"
                name="password"
                className="login-input"
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

            <div className="login-field">
              <label htmlFor="confirmPassword" className="login-label">Confirm Password <span className="required-marker" aria-hidden="true">*</span></label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                className="login-input"
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

          {formMessage && <p className="register-message" role="status">{formMessage}</p>}
          <button className="login-button" type="submit">Create Account</button>
        </form>

        <p className="register-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}