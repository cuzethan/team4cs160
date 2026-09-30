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
      <div className="login-field">
        <label htmlFor="username" className="login-label">Username:</label>
        <input id="username" className="login-input" type="text" placeholder="" />
      </div>

      <div className="login-field">
        <label htmlFor="password" className="login-label">Password:</label>
        <input id="password" className="login-input" type="password" placeholder="" />
      </div>

      <Link to="/forgot-password" className="forgot-link">Forgot your password?</Link>

      <button className="login-button" type="button" onClick={handleLogin}>Login</button>
      <p className="register-prompt">Don't have an account?{" "}
        <Link to="/register" className="register-link">
          Register here
        </Link>
      </p>
    </>
  );
}


export function Register() {
  return (
    <div className="login-page">
      <div className="login-card">
        <Header />
        <Content />
      </div>
    </div>
  );
}