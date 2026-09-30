import { Link } from 'react-router-dom';
import './ForgotPassword.css';

function ForgotPassword() {
  return (
    <div className="forgot-password-page">
      <h2 className="forgot-password-header">Forgot Password</h2>
      <p className="forgot-password-instruction">Please enter your email to receive verification codes.</p>
      <div className="forgot-password-field">
        <label htmlFor="email" className="forgot-password-label">Email:</label>
        <input id="email" className="forgot-password-input" type="email" placeholder="example@gmail.com" />
      </div>
      <button className="forgot-password-button" type="button">Send Email</button>
      <Link to="/login" className="back-to-login-link">Back to Login</Link>
    </div>
  );
}

export default ForgotPassword;