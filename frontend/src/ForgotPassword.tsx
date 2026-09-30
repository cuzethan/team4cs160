import './ForgotPassword.css';

function ForgotPassword() {
  return (
    <div className="forgot-password-page">
      <h2 className="forgot-password-header">Forgot Password</h2>
      <p className="forgot-password-instruction">Please enter your email address to receive password reset instructions.</p>
      <div className="forgot-password-field">
        <label htmlFor="email" className="forgot-password-label">Email:</label>
        <input id="email" className="forgot-password-input" type="email" placeholder="Enter your email" />
      </div>
      <button className="forgot-password-button" type="button">Send Reset Instructions</button>
    </div>
  );
}

export default ForgotPassword;