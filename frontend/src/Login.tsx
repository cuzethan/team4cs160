import './Login.css';
import { Link } from "react-router-dom";

function Header() {
  return <header className="login-header">OFS Login</header>;
}

function Content() {
  return (
    <>
      <div className="login-field">
        <label htmlFor="username" className="login-label">Username:</label>
        <input id="username" className="login-input" type="text" placeholder="" />
      </div>

      <div className="login-field">
        <label htmlFor="password" className="login-label">Password:</label>
        <input id="password" className="login-input" type="password" placeholder="" />
      </div>

      <Link to="/forgot-password" className="forgot-link">Forgot your password?</Link>

      <button className="login-button" type="button">Login</button>
    </>
  );
}

export function Login() {
  return (
    <div className="login-page">
      <div className="login-card">
        <Header />
        <Content />
      </div>
    </div>
  );
}