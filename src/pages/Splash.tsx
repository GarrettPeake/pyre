import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import "./Splash.css";

function Splash() {
  const navigate = useNavigate();

  const handleStartWithExamples = () => {
    const uuid = uuidv4();
    navigate(`/app/${uuid}`);
  };

  return (
    <div className="splash-container">
      <div className="hero-banner">
        <div className="hero-content">
          <div className="hero-header">
            <div className="hero-title-section">
              <h1 className="pyre-logo">PYRE</h1>
              <p className="pyre-subtitle">Plan Your Retirement Early</p>
            </div>

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

          <p className="hero-features">
            Free, Ad Free, Open Source, No Login, No Tracking
          </p>

          <div className="cta-buttons">
            <button
              className="cta-button primary"
              onClick={handleStartWithExamples}
            >
              Start your plan
            </button>
          </div>

          <div className="app-preview">
            <img src="/demo.png" alt="App preview" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Splash;
