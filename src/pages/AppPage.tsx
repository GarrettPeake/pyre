import { useParams } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Block, { type BlockState } from "../components/Block";
import FloatingLabelInput from "../components/FloatingLabelInput";
import FloatingLabelTextarea from "../components/FloatingLabelTextarea";
import FloatingLabelSelect from "../components/FloatingLabelSelect";
import Chart from "../components/Chart";
import Modal from "../components/Modal";
import {
  runGlobalSimulation,
  type SimulationSnapshot,
} from "../SimulationEngine";
import "./AppPage.css";
import { v4 as uuidv4 } from "uuid";
import { type GraphDefinition } from "../types";

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

// API Functions
async function fetchPlan(planId: string): Promise<SavedPlanData | null> {
  try {
    const response = await fetch(`/api/get_plan/${planId}`);
    if (response.status === 404) {
      return {
        simulationName: "My Retirement Plan",
        currentAge: 30,
        retirementAge: 62,
        globalInit: DEFAULT_GLOBAL_INIT,
        graphs: DEFAULT_GRAPHS,
        blocks: DEFAULT_BLOCKS,
      };
    }
    if (!response.ok) {
      throw new Error("Failed to fetch plan");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching plan:", error);
    return null;
  }
}

async function savePlan(planId: string, data: SavedPlanData): Promise<boolean> {
  try {
    const response = await fetch(`/api/save_plan/${planId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to save plan");
    }
    return true;
  } catch (error) {
    console.error("Error saving plan:", error);
    return false;
  }
}

// Default global initialization
const DEFAULT_GLOBAL_INIT = `k401 = 100000
cash = 100000
investments = 200000
bonds = 100000
property = 0
debts = 0`;

// Default main graphs
const DEFAULT_GRAPHS: GraphDefinition[] = [
  {
    id: uuidv4(),
    title: "Net Worth",
    frequency: "monthly",
    verticals: [],
    expressions: {
      line: ["k401 + cash + investments + bonds + property - debts"],
      stacked: ["k401", "cash", "investments", "bonds", "property", "-debts"],
    },
  },
  {
    id: uuidv4(),
    title: "Mortgage (Interest vs principal)",
    frequency: "monthly",
    verticals: [],
    expressions: {
      line: ["interest_portion", "principal_portion"],
    },
  },
];

// Default block configuration
const DEFAULT_BLOCKS: Array<{
  id: string;
  state: BlockState;
}> = [
  {
    id: uuidv4(),
    state: {
      title: "Home loan",
      startDate: "2025-11-01",
      endDate: "2055-11-01",
      inputs: {
        down: "25000",
        principal: "175000",
        apr: "0.06",
      },
      init: `asset_price = down + principal
monthly_interest = apr / 12
payment = principal * monthly_interest * (1 + monthly_interest) ** total_periods / ((1 + monthly_interest) ** total_periods - 1)
property = property + asset_price
debts = debts + principal
cash = cash - down`,
      frequency: "monthly",
      execution: `interest_portion = principal * monthly_interest
principal_portion = payment - interest_portion
principal = principal - principal_portion
debts = debts - principal_portion
cash = cash - payment`,
      exports: "interest_portion,principal_portion,payment",
      graphs: [
        {
          id: uuidv4(),
          title: "Portions",
          frequency: "monthly",
          verticals: [],
          expressions: {
            line: ["interest_portion", "principal_portion"],
          },
        },
      ],
    },
  },
];

const EMPTY_BLOCK_STATE: BlockState = {
  title: "New block",
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
  inputs: {},
  init: "",
  frequency: "monthly",
  execution: "",
  exports: "",
  graphs: [],
};

function AppPage() {
  const { planId } = useParams<{ planId: string }>();
  const [simulationName, setSimulationName] =
    useState<string>("My Retirement Plan");
  const [currentAge, setCurrentAge] = useState<number>(25);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [globalInit, setGlobalInit] = useState<string>(DEFAULT_GLOBAL_INIT);
  const [graphs, setGraphs] = useState<GraphDefinition[]>(DEFAULT_GRAPHS);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEditingSetup, setIsEditingSetup] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simulationSnapshots, setSimulationSnapshots] = useState<
    SimulationSnapshot[]
  >([]);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [showHeaderSimulate, setShowHeaderSimulate] = useState<boolean>(false);
  const simulateButtonRef = useRef<HTMLButtonElement>(null);

  // Load plan data from backend on mount
  useEffect(() => {
    if (!planId) {
      setIsLoading(false);
      return;
    }

    fetchPlan(planId).then((data) => {
      if (data) {
        setSimulationName(data.simulationName);
        setCurrentAge(data.currentAge);
        setRetirementAge(data.retirementAge);
        setGlobalInit(data.globalInit);
        setGraphs(data.graphs);
        setBlocks(
          data.blocks.map((block) => ({
            id: block.id,
            state: block.state,
          }))
        );
      }
      setIsLoading(false);
    });
  }, [planId]);

  // Save plan to backend
  const saveToBackend = useCallback(
    async (updatedBlocks: BlockData[]) => {
      if (!planId) return;

      const planData: SavedPlanData = {
        simulationName,
        currentAge,
        retirementAge,
        globalInit,
        graphs,
        blocks: updatedBlocks.map((block) => ({
          id: block.id,
          state: block.state,
        })),
      };

      const success = await savePlan(planId, planData);
      if (success) {
        setIsSaved(true);
      }
    },
    [planId, simulationName, currentAge, retirementAge, globalInit, graphs]
  );

  // Handle block state changes - update state immediately
  const handleBlockStateChange = useCallback(
    (blockId: string, newState: BlockState) => {
      setBlocks((prevBlocks) =>
        prevBlocks.map((block) =>
          block.id === blockId ? { ...block, state: newState } : block
        )
      );
    },
    []
  );

  // Debounced auto-save when blocks, ages, globalInit, or graphs change
  useEffect(() => {
    // Don't save during initial load
    if (isLoading) return;
    setIsSaved(false);

    // Set up debounce timer
    const timeoutId = setTimeout(() => {
      saveToBackend(blocks);
    }, 1000);

    // Cleanup function to cancel timer if state changes again
    return () => clearTimeout(timeoutId);
  }, [
    blocks,
    simulationName,
    currentAge,
    retirementAge,
    globalInit,
    graphs,
    isLoading,
    saveToBackend,
  ]);

  // Run simulation manually
  const runSimulation = useCallback(() => {
    setIsSimulating(true);

    // Use setTimeout to allow the spinner to render before blocking computation
    setTimeout(() => {
      try {
        // Calculate birth date from current age
        const currentYear = new Date().getFullYear();
        const birthDate = new Date(currentYear - currentAge, 0, 1);

        // Run simulation
        const snapshots = runGlobalSimulation({
          globalInit,
          blocks: blocks.map((b) => ({ id: b.id, state: b.state })),
          birthDate,
          currentAge,
          endAge: 100,
        });

        setSimulationSnapshots(snapshots);
      } catch (error) {
        console.error("Error running simulation:", error);
        setSimulationSnapshots([]);
      } finally {
        setIsSimulating(false);
      }
    }, 0);
  }, [globalInit, blocks, currentAge]);

  // Run simulation once on page load
  useEffect(() => {
    if (!isLoading) {
      runSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Track visibility of original Simulate button
  useEffect(() => {
    const button = simulateButtonRef.current;
    if (!button) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show header button when original button starts going behind header
        // Use ratio < 1 to trigger as soon as it starts being covered
        setShowHeaderSimulate(entry.intersectionRatio < 1);
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
        rootMargin: '0px 0px 0px 0px'
      }
    );

    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  // Calculate dates for vertical indicators - memoize to prevent unnecessary re-renders
  const verticalIndicators = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentAgeDate = new Date(currentYear, 0, 1);
    const retirementAgeDate = new Date(
      currentYear + (retirementAge - currentAge),
      0,
      1
    );
    return [
      { date: currentAgeDate, label: `Age ${currentAge}` },
      { date: retirementAgeDate, label: `Age ${retirementAge}` },
    ];
  }, [currentAge, retirementAge]);

  // Memoize graphs with verticals to prevent unnecessary Chart re-renders
  const graphsWithVerticals = useMemo(() => {
    return graphs.map((graphDef) => ({
      ...graphDef,
      verticals: verticalIndicators,
    }));
  }, [graphs, verticalIndicators]);

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="header-content">
          <div className="header-logo">
            <h1 className="logo-text">PYRE</h1>
            <button
              className="info-button"
              onClick={() => setIsTutorialOpen(true)}
              aria-label="Open tutorial"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 16v-4m0-4h.01"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="secret-link-hint-stack">
            <div className="plan-id-row">
              <p className="header-link">{planId}</p>
              <svg
                className={`save-status-icon ${isSaved ? "saved" : "unsaved"}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <p className="header-link">Bookmark your secret link!</p>
          </div>
          {showHeaderSimulate && (
            <button
              className="header-simulate-button"
              onClick={runSimulation}
              disabled={isSimulating}
            >
              {isSimulating ? (
                <>
                  <span className="spinner"></span>
                  Simulating...
                </>
              ) : (
                "Simulate"
              )}
            </button>
          )}
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
      </header>

      <main className="app-main">
        <div className="app-content">
          {/* Left Column: Simulation Setup and Graphs */}
          <div className="left-column">
            {/* Simulation Setup Section */}
            <section className="simulation-setup-card">
            <div
              className={
                isEditingSetup
                  ? "setup-header-expanded setup-header"
                  : "setup-header"
              }
            >
              {isEditingSetup ? (
                <FloatingLabelInput
                  label="Simulation Name"
                  type="text"
                  value={simulationName}
                  onChange={(e) => setSimulationName(e.target.value)}
                  className="setup-title-input"
                />
              ) : (
                <h2 className="setup-title">{simulationName}</h2>
              )}
              <div className="setup-buttons">
                <button
                  ref={simulateButtonRef}
                  className="setup-simulate-button"
                  onClick={runSimulation}
                  disabled={isSimulating}
                >
                  {isSimulating ? (
                    <>
                      <span className="spinner"></span>
                      Simulating...
                    </>
                  ) : (
                    "Simulate"
                  )}
                </button>
                <button
                  className={`setup-edit-button ${
                    isEditingSetup ? "editing" : ""
                  }`}
                  onClick={() => setIsEditingSetup(!isEditingSetup)}
                >
                  {isEditingSetup ? "Done" : "Edit"}
                </button>
              </div>
            </div>

            {isEditingSetup && (
              <div className="setup-content">
                <div className="age-inputs-row">
                  <FloatingLabelInput
                    label="Current Age"
                    type="number"
                    value={currentAge}
                    onChange={(e) => setCurrentAge(Number(e.target.value))}
                  />
                  <FloatingLabelInput
                    label="Target Retirement Age"
                    type="number"
                    value={retirementAge}
                    onChange={(e) => setRetirementAge(Number(e.target.value))}
                  />
                </div>

                <div className="global-init-section">
                  <FloatingLabelTextarea
                    label="Simulation Initialization"
                    value={globalInit}
                    onChange={(e) => setGlobalInit(e.target.value)}
                    rows={6}
                    placeholder=""
                  />
                </div>

                <div className="graphs-config-section">
                  <div className="graphs-config-header">
                    <h3 className="graphs-config-title">Main Graphs</h3>
                    <button
                      className="add-graph-button"
                      onClick={() =>
                        setGraphs((prev) => [
                          ...prev,
                          {
                            id: uuidv4(),
                            title: "New Graph",
                            frequency: "monthly",
                            verticals: [],
                            expressions: { line: [], stacked: [], bar: [] },
                          },
                        ])
                      }
                    >
                      +
                    </button>
                  </div>

                  {graphs.map((graph, index) => (
                    <div key={graph.id} className="graph-config-card">
                      <div className="graph-config-header">
                        <FloatingLabelInput
                          label="Title"
                          value={graph.title}
                          onChange={(e) =>
                            setGraphs((prev) =>
                              prev.map((g, i) =>
                                i === index
                                  ? { ...g, title: e.target.value }
                                  : g
                              )
                            )
                          }
                        />
                        <FloatingLabelSelect
                          label="Frequency"
                          value={graph.frequency}
                          onChange={(e) =>
                            setGraphs((prev) =>
                              prev.map((g, i) =>
                                i === index
                                  ? {
                                      ...g,
                                      frequency: e.target.value as
                                        | "daily"
                                        | "monthly"
                                        | "yearly",
                                    }
                                  : g
                              )
                            )
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </FloatingLabelSelect>
                        <button
                          className="delete-graph-button"
                          onClick={() =>
                            setGraphs((prev) =>
                              prev.filter((_, i) => i !== index)
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>

                      <div className="graph-config-expressions">
                        <FloatingLabelInput
                          label="Line Expressions (comma-separated)"
                          value={graph.expressions.line?.join(", ") || ""}
                          onChange={(e) =>
                            setGraphs((prev) =>
                              prev.map((g, i) =>
                                i === index
                                  ? {
                                      ...g,
                                      expressions: {
                                        ...g.expressions,
                                        line: e.target.value
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      },
                                    }
                                  : g
                              )
                            )
                          }
                          placeholder=""
                        />
                        <FloatingLabelInput
                          label="Stacked Expressions (comma-separated)"
                          value={graph.expressions.stacked?.join(", ") || ""}
                          onChange={(e) =>
                            setGraphs((prev) =>
                              prev.map((g, i) =>
                                i === index
                                  ? {
                                      ...g,
                                      expressions: {
                                        ...g.expressions,
                                        stacked: e.target.value
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      },
                                    }
                                  : g
                              )
                            )
                          }
                          placeholder=""
                        />
                        <FloatingLabelInput
                          label="Bar Expressions (comma-separated)"
                          value={graph.expressions.bar?.join(", ") || ""}
                          onChange={(e) =>
                            setGraphs((prev) =>
                              prev.map((g, i) =>
                                i === index
                                  ? {
                                      ...g,
                                      expressions: {
                                        ...g.expressions,
                                        bar: e.target.value
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      },
                                    }
                                  : g
                              )
                            )
                          }
                          placeholder=""
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
            {graphs.length === 0 ? (
              <div className="empty-graphs-message">
                <p>Add graphs in Simulation Setup to visualize your plan</p>
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
              <button
                className="add-block-button"
                onClick={() =>
                  setBlocks((prev) => [
                    ...prev,
                    {
                      id: uuidv4(),
                      state: EMPTY_BLOCK_STATE,
                    },
                  ])
                }
              >
                +
              </button>
            </div>
            <div className="blocks-list">
              {blocks.map((block) => (
                <Block
                  key={block.id}
                  state={block.state}
                  onChange={(newState) =>
                    handleBlockStateChange(block.id, newState)
                  }
                  onDelete={() =>
                    setBlocks((prev) => prev.filter((b) => b.id !== block.id))
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <Modal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        title={
          <p>
            How to Use <span className="logo-text">PYRE</span>
          </p>
        }
      >
        <div className="tutorial-section">
          <h3>Getting Started</h3>
          <p>
            PYRE is a flexible financial planning calculator that uses a simple
            math language to build complex retirement plans. Your plan is
            automatically saved using the unique ID in the header, so bookmark
            this page to return to your plan anytime.
          </p>
        </div>

        <div className="tutorial-section">
          <h3>Simulation Setup</h3>
          <p>
            Click <strong>Edit</strong> in the Simulation Setup section to
            configure:
          </p>
          <ul>
            <li>
              <strong>Simulation Name:</strong> Give your plan a custom name
            </li>
            <li>
              <strong>Current Age & Retirement Age:</strong> Define your age
              range (graphs will always show from ages 0-100)
            </li>
            <li>
              <strong>Simulation Initialization:</strong> Set starting values
              for global variables like <code>cash</code>,{" "}
              <code>investments</code>, etc.
            </li>
            <li>
              <strong>Graphs:</strong> Configure charts to visualize your
              financial data over time. These can track any global variable.
            </li>
          </ul>
          <p>
            Click <strong>Simulate</strong> to run the calculation and see your
            updated graphs.
          </p>
        </div>

        <div className="tutorial-section">
          <h3>Financial Functions</h3>
          <p>
            Functions represent everything that affects your financies like
            loans, investments, or income streams. Functions run in the order
            they are defined. Click the <strong>+</strong> button to add a new
            function, then:
          </p>
          <ul>
            <li>
              <strong>Function inputs:</strong> Define start/end dates,
              frequency (daily/monthly/yearly), and inputs
            </li>
            <li>
              <strong>Initialization:</strong> defines the setup of local
              variables when the block is first run.
            </li>
            <li>
              <strong>Execution:</strong> Define calculations that run each
              period (day/month/year)
            </li>
            <li>
              <strong>Exports:</strong> Share variables with other blocks and
              graphs by making them global
            </li>
          </ul>
        </div>

        <div className="tutorial-section">
          <h3>Math Language Basics</h3>
          <p>
            Use simple mathematical expressions to define your calculations:
          </p>
          <ul>
            <li>
              <strong>Basic math:</strong> <code>+</code>, <code>-</code>,{" "}
              <code>*</code>, <code>/</code>, <code>**</code> (power)
            </li>
            <li>
              <strong>Variables:</strong> Any name that starts with a letter and
              only contains letters, numbers, and underscores like{" "}
              <code>cash</code>, <code>k401</code>,{" "}
              <code>monthly_interest</code> is valid
            </li>
            <li>
              <strong>Expressions:</strong> Every line of a code block must be
              an assignment such as <code>debts = debts + 1000</code> whereas
              graph expressions only require the right side like{" "}
              <code>cash - debts</code>
            </li>
            <li>
              <strong>Notes:</strong> Start a line with <code>#</code> to add
              notes to your calculations
            </li>
          </ul>
          <p>
            <strong>Default inputs available in functions:</strong>{" "}
            <code>total_periods</code>, <code>periods_from_start</code> which
            count based on the start date and frequency of your function
          </p>
        </div>

        <div className="tutorial-section">
          <h3>Example: Home Loan</h3>
          <p>The below function might calculate monthly mortgage payments:</p>
          <ul>
            <li>
              <strong>Inputs:</strong> <code>down_payment</code>,{" "}
              <code>original_principal</code>, <code>apr</code>
            </li>
            <li>
              <strong>Init:</strong> Calculate payment amount, add the home's
              value to <code>property</code>, the principal borrowed to{" "}
              <code>debts</code>, and subtract the down payment from your cash
            </li>
            <li>
              <strong>Execution:</strong> Each month, compute the portion of the
              payment going towards <code>interest</code> and{" "}
              <code>principal</code>, subtract the <code>principal</code> amount
              from your <code>debts</code> and both amounts from your{" "}
              <code>cash</code>. We finally need to keep track of the amount of
              principal we currently have leftover.
            </li>
            <li>
              <strong>Exports:</strong> You might export the{" "}
              <code>interest_portion</code> and <code>principal_portion</code>{" "}
              for graphing
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}

export default AppPage;
