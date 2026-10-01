import './Login.css';
import { Link, useNavigate } from "react-router-dom";

function Header() {
  return <header className="login-header">OFS Login</header>;
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
        <div className="login-field">
          <label htmlFor="username" className="login-label">Username:</label>
          <input id="username" name="username" className="login-input" type="text" autoComplete="username" required />
        </div>

        <div className="login-field">
          <label htmlFor="password" className="login-label">Password:</label>
          <input id="password" name="password" className="login-input" type="password" autoComplete="current-password" required />
        </div>

        <Link to="/forgot-password" className="forgot-link">Forgot your password?</Link>

        <button className="login-button" type="submit">Login</button>
      </form>
      <p className="register-prompt">Don't have an account?{" "}
        <Link to="/register" className="register-link">
          Register here
        </Link>
      </p>
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