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
            <button
              className="cta-button primary"
              onClick={handleStartWithExamples}
            >
              Start your plan
            </button>

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
            <p className="hero-features">
              Free, Ad Free, Open Source, No Login, No Tracking
            </p>
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
