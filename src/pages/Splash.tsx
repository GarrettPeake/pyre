import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../contexts/AuthContext";
import "./Splash.css";

function Splash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      const returnUrl = searchParams.get("return");
      if (returnUrl) {
        navigate(returnUrl);
      } else {
        navigate("/dashboard");
      }
    }
  }, [isLoading, user, navigate, searchParams]);

  const handleStartAnonymous = () => {
    const uuid = uuidv4();
    navigate(`/app/${uuid}`);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await login(username, password);

      if (!result.success) {
        setError(result.error || "Login failed");
        return;
      }

      // Navigate based on result
      const returnUrl = searchParams.get("return");
      if (returnUrl) {
        navigate(returnUrl);
      } else if (result.isNewUser && result.planIds && result.planIds.length > 0) {
        // New user - go to their first plan
        navigate(`/app/${result.planIds[0]}`);
      } else {
        // Existing user - go to dashboard
        navigate("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="splash-container">
        <div className="splash-loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="splash-container">
      <div className="hero-banner">
        <div className="hero-content">
          <div className="hero-header">
            <div className="hero-links">
              <a
                href="https://github.com/GarrettPeake/PYRE"
                target="_blank"
                rel="noopener noreferrer"
                className="github-link"
              >
                <img
                  src="/github-mark.svg"
                  className="github-logo"
                  alt="GitHub Logo linking to project repo"
                />
              </a>
              <a
                href="https://ko-fi.com/garrettpeake"
                target="_blank"
                rel="noopener noreferrer"
                className="kofi-link"
              >
                <img
                  src="/kofi.png"
                  alt="Support me on Ko-fi"
                  className="kofi-logo"
                />
              </a>
            </div>
          </div>

          <div className="hero-title-section">
            <h1 className="hero-title">
              <span className="hero-title-pyre">P</span>lan{" "}
              <span className="hero-title-pyre">Y</span>our{" "}
              <span className="hero-title-pyre">R</span>etirement{" "}
              <span className="hero-title-pyre">E</span>asily
            </h1>
          </div>

          <div className="auth-section">
            <form className="auth-form" onSubmit={handleLogin}>
              <input
                type="text"
                className="auth-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                autoComplete="username"
              />
              <input
                type="password"
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="current-password"
              />
              {error && <p className="auth-error">{error}</p>}
              <button
                type="submit"
                className="cta-button primary auth-button"
                disabled={isSubmitting || !username || !password}
              >
                {isSubmitting ? "Please wait..." : "Sign In / Create Account"}
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              className="cta-button secondary"
              onClick={handleStartAnonymous}
            >
              Start without account
            </button>
          </div>

          <p className="hero-features">
            Free, Ad Free, Open Source, No Tracking
          </p>

          <div className="app-preview">
            <img src="/demo.png" alt="App preview" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Splash;
