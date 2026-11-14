import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useAuth, safeReturn } from "../contexts/AuthContext";
import * as accounts from "../accounts/accounts.js";
import { openAccountDialog } from "../accounts/dialog.js";
import "./Splash.css";

function Splash() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading, authError, clearAuthError, refresh } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const returnTo = safeReturn(searchParams.get("return"));

  // Signed in already: on to the account's simulations (or where they were going).
  useEffect(() => {
    if (!isLoading && user && !isSigningIn) {
      navigate(returnTo ?? "/dashboard", { replace: true });
    }
  }, [isLoading, user, isSigningIn, navigate, returnTo]);

  const handleStartAnonymous = () => {
    navigate(`/app/${uuidv4()}`);
  };

  /** The sign-in dialog. A GAuth sign-in leaves the page and comes back to `next`. */
  const signIn = useCallback(
    async (start?: "register") => {
      setIsSigningIn(true);
      const error = authError;
      clearAuthError();
      const result = await openAccountDialog({ start, error, next: returnTo ?? "/dashboard" });
      if (!result.signedIn) {
        setIsSigningIn(false);
        return;
      }
      const me = await accounts.me();
      if (returnTo) {
        navigate(returnTo);
      } else if (me.signedIn && me.links.length === 0) {
        // A new account starts with a simulation of its own.
        const id = uuidv4();
        await accounts.protect(id).catch(() => null);
        navigate(`/app/${id}`);
      } else {
        navigate("/dashboard");
      }
      await refresh();
    },
    [authError, clearAuthError, navigate, refresh, returnTo]
  );

  // A GAuth sign-in that came back with an error: say why (once; effects can run twice).
  const shownError = useRef(false);
  useEffect(() => {
    if (isLoading || user || !authError || shownError.current) return;
    shownError.current = true;
    signIn();
  }, [isLoading, user, authError, signIn]);

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
            <div className="auth-form">
              <button
                type="button"
                className="cta-button primary auth-button"
                onClick={() => signIn()}
              >
                Sign In
              </button>
              <button
                type="button"
                className="cta-button secondary auth-button"
                onClick={() => signIn("register")}
              >
                Create Account
              </button>
            </div>

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
