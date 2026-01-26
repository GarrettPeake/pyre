import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Chart from "../components/Chart";
import Block, { type BlockState } from "../components/Block";
import FloatingLabelInput from "../components/FloatingLabelInput";
import FloatingLabelTextarea from "../components/FloatingLabelTextarea";
import FloatingLabelSelect from "../components/FloatingLabelSelect";
import {
  runGlobalSimulation,
  type SimulationSnapshot,
} from "../SimulationEngine";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { type GraphDefinition } from "../types";
import "./AppPage.css";
import "./SharePage.css";

interface BlockData {
  id: string;
  state: BlockState;
}

interface SavedPlanData {
  simulationName: string;
  currentAge: number;
  retirementAge: number;
  globalInit: string;
  graphs: GraphDefinition[];
  blocks: Array<{
    id: string;
    state: BlockState;
  }>;
}

// API Function to fetch shared plan
async function fetchSharedPlan(shareId: string): Promise<SavedPlanData | null> {
  try {
    const response = await fetch(`/api/get_share/${shareId}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching shared plan:", error);
    return null;
  }
}

function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [planData, setPlanData] = useState<SavedPlanData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [simulationSnapshots, setSimulationSnapshots] = useState<
    SimulationSnapshot[]
  >([]);
  const [isShowingSetupDetails, setIsShowingSetupDetails] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState<boolean>(false);

  // Load shared plan data on mount
  useEffect(() => {
    if (!shareId) {
      setError("No share ID provided");
      setIsLoading(false);
      return;
    }

    fetchSharedPlan(shareId).then((data) => {
      if (data) {
        setPlanData(data);
      } else {
        setError("This share link is invalid or the plan no longer exists.");
      }
      setIsLoading(false);
    });
  }, [shareId]);

  // Run simulation when plan data loads
  const runSimulation = useCallback(() => {
    if (!planData) return;

    try {
      const currentYear = new Date().getFullYear();
      const birthDate = new Date(currentYear - planData.currentAge, 0, 1);

      const blocks: BlockData[] = planData.blocks.map((block) => ({
        id: block.id,
        state: block.state,
      }));

      const snapshots = runGlobalSimulation({
        globalInit: planData.globalInit,
        blocks: blocks.map((b) => ({ id: b.id, state: b.state })),
        birthDate,
        currentAge: planData.currentAge,
        endAge: 100,
      });

      setSimulationSnapshots(snapshots);
    } catch (err) {
      console.error("Error running simulation:", err);
      setSimulationSnapshots([]);
    }
  }, [planData]);

  useEffect(() => {
    if (planData) {
      runSimulation();
    }
  }, [planData, runSimulation]);

  // Calculate dates for vertical indicators
  const verticalIndicators = useMemo(() => {
    if (!planData) return [];
    const currentYear = new Date().getFullYear();
    const currentAgeDate = new Date(currentYear, 0, 1);
    const retirementAgeDate = new Date(
      currentYear + (planData.retirementAge - planData.currentAge),
      0,
      1
    );
    return [
      { date: currentAgeDate, label: `Age ${planData.currentAge}` },
      { date: retirementAgeDate, label: `Age ${planData.retirementAge}` },
    ];
  }, [planData]);

  // Debounce graphs for performance
  const debouncedGraphs = useDebouncedValue(planData?.graphs || [], 1000);

  // Memoize graphs with verticals
  const graphsWithVerticals = useMemo(() => {
    return debouncedGraphs.map((graphDef) => ({
      ...graphDef,
      verticals: verticalIndicators,
    }));
  }, [debouncedGraphs, verticalIndicators]);

  // Copy simulation to a new editable plan
  const handleCopySimulation = useCallback(async () => {
    if (!planData) return;

    setIsCopying(true);
    try {
      const newPlanId = uuidv4();
      const copiedPlanData: SavedPlanData = {
        ...planData,
        simulationName: `${planData.simulationName} (copy)`,
      };

      const response = await fetch(`/api/save_plan/${newPlanId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(copiedPlanData),
      });

      if (!response.ok) {
        throw new Error("Failed to copy simulation");
      }

      navigate(`/app/${newPlanId}`);
    } catch (err) {
      console.error("Error copying simulation:", err);
      alert("Failed to copy simulation. Please try again.");
    } finally {
      setIsCopying(false);
    }
  }, [planData, navigate]);

  if (isLoading) {
    return (
      <div className="share-page">
        <div className="share-loading">
          <div className="loading-spinner"></div>
          <p>Loading shared plan...</p>
        </div>
      </div>
    );
  }

  if (error || !planData) {
    return (
      <div className="share-page">
        <div className="share-error">
          <h2>Share Link Not Found</h2>
          <p>{error || "This share link is invalid."}</p>
          <Link to="/" className="back-to-home">
            Create Your Own Plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="header-content">
          <div className="header-logo">
            <Link to="/" className="logo-link">
              <h1 className="logo-text">PYRE</h1>
            </Link>
          </div>
          <div className="share-badge">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                fill="currentColor"
              />
            </svg>
            Read-Only View
          </div>
          <button
            className="create-own-button"
            onClick={handleCopySimulation}
            disabled={isCopying}
          >
            {isCopying ? "Copying..." : "Copy Simulation to Edit"}
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="app-content">
          {/* Left Column: Simulation Setup and Graphs */}
          <div className="left-column">
            {/* Simulation Setup Section */}
            <section className="simulation-setup-card">
              <div
                className={
                  isShowingSetupDetails
                    ? "setup-header-expanded setup-header"
                    : "setup-header"
                }
              >
                <h2 className="setup-title">{planData.simulationName}</h2>
                <div className="setup-buttons">
                  <button
                    className={`setup-edit-button ${
                      isShowingSetupDetails ? "editing" : ""
                    }`}
                    onClick={() => setIsShowingSetupDetails(!isShowingSetupDetails)}
                  >
                    {isShowingSetupDetails ? "Hide Details" : "Show Details"}
                  </button>
                </div>
              </div>

              {isShowingSetupDetails && (
                <div className="setup-content">
                  <div className="age-inputs-row">
                    <FloatingLabelInput
                      label="Current Age"
                      type="number"
                      value={planData.currentAge}
                      onChange={() => {}}
                      disabled={true}
                    />
                    <FloatingLabelInput
                      label="Target Retirement Age"
                      type="number"
                      value={planData.retirementAge}
                      onChange={() => {}}
                      disabled={true}
                    />
                  </div>

                  <div className="global-init-section">
                    <FloatingLabelTextarea
                      label="Simulation Initialization"
                      value={planData.globalInit}
                      onChange={() => {}}
                      rows={6}
                      placeholder=""
                      disabled={true}
                    />
                  </div>

                  <div className="graphs-config-section">
                    <div className="graphs-config-header">
                      <h3 className="graphs-config-title">Main Graphs</h3>
                    </div>

                    {planData.graphs.map((graph) => (
                      <div key={graph.id} className="graph-config-card">
                        <div className="graph-config-header">
                          <FloatingLabelInput
                            label="Title"
                            value={graph.title}
                            onChange={() => {}}
                            disabled={true}
                          />
                          <FloatingLabelSelect
                            label="Frequency"
                            value={graph.frequency}
                            onChange={() => {}}
                            disabled={true}
                          >
                            <option value="daily">Daily</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </FloatingLabelSelect>
                        </div>

                        <div className="graph-config-expressions">
                          <FloatingLabelInput
                            label="Line Expressions (comma-separated)"
                            value={graph.expressions.line?.join(", ") || ""}
                            onChange={() => {}}
                            placeholder=""
                            disabled={true}
                          />
                          <FloatingLabelInput
                            label="Stacked Expressions (comma-separated)"
                            value={graph.expressions.stacked?.join(", ") || ""}
                            onChange={() => {}}
                            placeholder=""
                            disabled={true}
                          />
                          <FloatingLabelInput
                            label="Bar Expressions (comma-separated)"
                            value={graph.expressions.bar?.join(", ") || ""}
                            onChange={() => {}}
                            placeholder=""
                            disabled={true}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Main Graphs Section */}
            <section className="overview-card">
              {graphsWithVerticals.length === 0 ? (
                <div className="empty-graphs-message">
                  <p>No graphs defined in this plan.</p>
                </div>
              ) : (
                graphsWithVerticals.map((graphDef) => (
                  <div key={graphDef.id} className="graph-content">
                    <Chart
                      graphDefinition={graphDef}
                      snapshots={simulationSnapshots}
                    />
                  </div>
                ))
              )}
            </section>
          </div>

          {/* Right Column: Financial Functions */}
          <section className="blocks-section">
            <div className="blocks-header">
              <h2 className="blocks-title">Financial Functions</h2>
            </div>
            <div className="blocks-list">
              {planData.blocks.map((block) => (
                <Block
                  key={block.id}
                  state={block.state}
                  onChange={() => {}}
                  snapshots={simulationSnapshots}
                  readOnly={true}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default SharePage;
