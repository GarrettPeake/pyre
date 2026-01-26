import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import Chart from "../components/Chart";
import {
  runGlobalSimulation,
  type SimulationSnapshot,
} from "../SimulationEngine";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { type GraphDefinition } from "../types";
import { type BlockState } from "../components/Block";
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
  const [planData, setPlanData] = useState<SavedPlanData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [simulationSnapshots, setSimulationSnapshots] = useState<
    SimulationSnapshot[]
  >([]);

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
    <div className="share-page">
      <header className="share-header">
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
          <Link to="/" className="create-own-button">
            Create Your Own
          </Link>
        </div>
      </header>

      <main className="share-main">
        <div className="share-content">
          {/* Simulation Info */}
          <section className="share-info-card">
            <h2 className="share-plan-title">{planData.simulationName}</h2>
            <div className="share-plan-details">
              <span>
                Current Age: <strong>{planData.currentAge}</strong>
              </span>
              <span>
                Retirement Age: <strong>{planData.retirementAge}</strong>
              </span>
            </div>
          </section>

          {/* Main Graphs Section */}
          <section className="share-graphs-card">
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

          {/* Blocks Summary */}
          {planData.blocks.length > 0 && (
            <section className="share-blocks-card">
              <h3 className="share-blocks-title">Financial Functions</h3>
              <div className="share-blocks-list">
                {planData.blocks.map((block) => (
                  <div key={block.id} className="share-block-item">
                    <div className="share-block-header">
                      <span className="share-block-name">
                        {block.state.title}
                      </span>
                      <span className="share-block-dates">
                        {block.state.startDate} to {block.state.endDate}
                      </span>
                    </div>
                    <div className="share-block-frequency">
                      {block.state.frequency.charAt(0).toUpperCase() +
                        block.state.frequency.slice(1)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default SharePage;
