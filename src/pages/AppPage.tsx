import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Block, { type BlockState } from "../components/Block";
import FloatingLabelInput from "../components/FloatingLabelInput";
import FloatingLabelTextarea from "../components/FloatingLabelTextarea";
import FloatingLabelSelect from "../components/FloatingLabelSelect";
import Chart from "../components/Chart";
import Modal from "../components/Modal";
import BlockLibrary from "../components/BlockLibrary";
import { type BlockTemplate } from "../blockTemplates";
import {
  runGlobalSimulation,
  type SimulationSnapshot,
} from "../SimulationEngine";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useAuth } from "../contexts/AuthContext";
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
  owner?: string;
}

// API Functions
interface FetchPlanResult {
  data: SavedPlanData | null;
  status: number;
}

async function fetchPlan(planId: string, token: string | null): Promise<FetchPlanResult> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/get_plan/${planId}`, { headers });

    if (response.status === 404) {
      return {
        status: 404,
        data: {
          simulationName: "My Retirement Plan",
          currentAge: 30,
          retirementAge: 62,
          globalInit: DEFAULT_GLOBAL_INIT,
          graphs: DEFAULT_GRAPHS,
          blocks: DEFAULT_BLOCKS,
        },
      };
    }

    if (response.status === 401 || response.status === 403) {
      return { status: response.status, data: null };
    }

    if (!response.ok) {
      throw new Error("Failed to fetch plan");
    }

    return { status: 200, data: await response.json() };
  } catch (error) {
    console.error("Error fetching plan:", error);
    return { status: 500, data: null };
  }
}

async function savePlan(planId: string, data: SavedPlanData, token: string | null): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/save_plan/${planId}`, {
      method: "POST",
      headers,
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
  const navigate = useNavigate();
  const { user, token, isLoading: isAuthLoading, login, logout } = useAuth();

  const [simulationName, setSimulationName] =
    useState<string>("My Retirement Plan");
  const [currentAge, setCurrentAge] = useState<number>(25);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [globalInit, setGlobalInit] = useState<string>(DEFAULT_GLOBAL_INIT);
  const [graphs, setGraphs] = useState<GraphDefinition[]>(DEFAULT_GRAPHS);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [planOwner, setPlanOwner] = useState<string | undefined>(undefined);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEditingSetup, setIsEditingSetup] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simulationSnapshots, setSimulationSnapshots] = useState<
    SimulationSnapshot[]
  >([]);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [showHeaderSimulate, setShowHeaderSimulate] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState<boolean>(false);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [linkUsername, setLinkUsername] = useState<string>("");
  const [linkPassword, setLinkPassword] = useState<string>("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const simulateButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAnonymousPlan = !planOwner;

  // Load plan data from backend on mount
  useEffect(() => {
    if (!planId || isAuthLoading) {
      if (!isAuthLoading && !planId) {
        setIsLoading(false);
      }
      return;
    }

    fetchPlan(planId, token).then((result) => {
      if (result.status === 401) {
        // Redirect to login with return URL
        navigate(`/?return=/app/${planId}`);
        return;
      }

      if (result.status === 403) {
        // User doesn't own this plan
        alert("You don't have access to this plan.");
        navigate("/dashboard");
        return;
      }

      if (result.data) {
        setSimulationName(result.data.simulationName);
        setCurrentAge(result.data.currentAge);
        setRetirementAge(result.data.retirementAge);
        setGlobalInit(result.data.globalInit);
        setGraphs(result.data.graphs);
        setPlanOwner(result.data.owner);
        setBlocks(
          result.data.blocks.map((block) => ({
            id: block.id,
            state: block.state,
          }))
        );
      }
      setIsLoading(false);
    });
  }, [planId, token, isAuthLoading, navigate]);

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
        owner: planOwner,
      };

      const success = await savePlan(planId, planData, token);
      if (success) {
        setIsSaved(true);
      }
    },
    [planId, simulationName, currentAge, retirementAge, globalInit, graphs, planOwner, token]
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

  // Download plan as JSON file
  const handleDownloadJson = useCallback(() => {
    const planData: SavedPlanData = {
      simulationName,
      currentAge,
      retirementAge,
      globalInit,
      graphs,
      blocks: blocks.map((block) => ({
        id: block.id,
        state: block.state,
      })),
    };

    const jsonString = JSON.stringify(planData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${simulationName.replace(/[^a-z0-9]/gi, "_")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [simulationName, currentAge, retirementAge, globalInit, graphs, blocks]);

  // Import plan from JSON file
  const handleImportJson = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as SavedPlanData;

          // Validate required fields exist
          if (
            typeof data.simulationName !== "string" ||
            typeof data.currentAge !== "number" ||
            typeof data.retirementAge !== "number" ||
            typeof data.globalInit !== "string" ||
            !Array.isArray(data.graphs) ||
            !Array.isArray(data.blocks)
          ) {
            throw new Error("Invalid plan format");
          }

          // Apply imported data
          setSimulationName(data.simulationName);
          setCurrentAge(data.currentAge);
          setRetirementAge(data.retirementAge);
          setGlobalInit(data.globalInit);
          setGraphs(data.graphs);
          setBlocks(
            data.blocks.map((block) => ({
              id: block.id || uuidv4(),
              state: block.state,
            }))
          );
        } catch (error) {
          console.error("Failed to import plan:", error);
          alert("Failed to import plan. Please check the file format.");
        }
      };
      reader.readAsText(file);

      // Reset file input so the same file can be imported again
      event.target.value = "";
    },
    []
  );

  // Handle adding a block from the library
  const handleAddFromLibrary = useCallback((template: BlockTemplate) => {
    setBlocks((prev) => [
      ...prev,
      {
        id: uuidv4(),
        state: {
          ...template.state,
          graphs: [],
        },
      },
    ]);
  }, []);

  // Create a share link
  const handleCreateShareLink = useCallback(async () => {
    if (!planId) return;

    setIsCreatingShare(true);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/create_share/${planId}`, {
        method: "POST",
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to create share link");
      }

      const data = await response.json();
      const url = `${window.location.origin}/share/${data.shareId}`;
      setShareUrl(url);

      // Copy to clipboard
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error("Error creating share link:", error);
      alert("Failed to create share link. Please try again.");
    } finally {
      setIsCreatingShare(false);
    }
  }, [planId, token]);

  // Link plan to account
  const handleLinkToAccount = useCallback(async () => {
    if (!planId) return;

    // If already signed in, just link directly
    if (user && token) {
      setIsLinking(true);
      try {
        const response = await fetch("/api/plans/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourcePlanId: planId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to link plan");
        }

        const data = await response.json();
        navigate(`/app/${data.newPlanId}`);
      } catch (error) {
        console.error("Error linking plan:", error);
        alert(error instanceof Error ? error.message : "Failed to link plan");
      } finally {
        setIsLinking(false);
      }
      return;
    }

    // Show modal to sign in/create account
    setShowLinkModal(true);
  }, [planId, user, token, navigate]);

  // Handle link modal form submission
  const handleLinkModalSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) return;

    setLinkError(null);
    setIsLinking(true);

    try {
      // First login/signup
      const loginResult = await login(linkUsername, linkPassword);
      if (!loginResult.success) {
        setLinkError(loginResult.error || "Authentication failed");
        return;
      }

      // Get the new token from localStorage
      const newToken = localStorage.getItem("pyre_auth_token");
      if (!newToken) {
        setLinkError("Failed to get authentication token");
        return;
      }

      // Link the plan
      const response = await fetch("/api/plans/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify({ sourcePlanId: planId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to link plan");
      }

      const data = await response.json();
      setShowLinkModal(false);
      navigate(`/app/${data.newPlanId}`);
    } catch (error) {
      console.error("Error linking plan:", error);
      setLinkError(error instanceof Error ? error.message : "Failed to link plan");
    } finally {
      setIsLinking(false);
    }
  }, [planId, linkUsername, linkPassword, login, navigate]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/");
  }, [logout, navigate]);

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
        rootMargin: "0px 0px 0px 0px",
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

  // Debounce graphs to prevent expensive Chart re-renders on every keystroke
  // Charts will only update 1 second after the last change to graph definitions
  const debouncedGraphs = useDebouncedValue(graphs, 1000);

  // Memoize graphs with verticals to prevent unnecessary Chart re-renders
  // Uses debounced graphs so charts only re-render after typing stops
  const graphsWithVerticals = useMemo(() => {
    return debouncedGraphs.map((graphDef) => ({
      ...graphDef,
      verticals: verticalIndicators,
    }));
  }, [debouncedGraphs, verticalIndicators]);

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
            {isAnonymousPlan ? (
              <p className="header-link">Bookmark your secret link!</p>
            ) : (
              <p className="header-link protected-badge">Protected by account</p>
            )}
          </div>
          <div className="export-import-buttons">
            {isAnonymousPlan && (
              <button
                className="link-account-button"
                onClick={handleLinkToAccount}
                disabled={isLinking}
                title="Link this plan to your account"
              >
                {isLinking ? "Linking..." : "Link to Account"}
              </button>
            )}
            <button
              className="share-button"
              onClick={handleCreateShareLink}
              disabled={isCreatingShare}
              title="Create a read-only share link"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
                  fill="currentColor"
                />
              </svg>
              {isCreatingShare ? "Creating..." : "Share"}
            </button>
            <button
              className="export-button"
              onClick={handleDownloadJson}
              title="Download simulation as JSON"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 16l-6-6h4V4h4v6h4l-6 6z"
                  fill="currentColor"
                />
                <path
                  d="M20 18H4v2h16v-2z"
                  fill="currentColor"
                />
              </svg>
              Export
            </button>
            <button
              className="import-button"
              onClick={() => fileInputRef.current?.click()}
              title="Import simulation from JSON"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 8l6 6h-4v6h-4v-6H6l6-6z"
                  fill="currentColor"
                />
                <path
                  d="M20 4H4v2h16V4z"
                  fill="currentColor"
                />
              </svg>
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              style={{ display: "none" }}
            />
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
          <div className="header-right-section">
            {user ? (
              <div className="user-section">
                <Link to="/dashboard" className="user-dashboard-link">
                  {user.username}
                </Link>
                <button className="logout-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/" className="login-link">
                Sign In
              </Link>
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
                                            .map((s) => s.trim()),
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
                                            .map((s) => s.trim()),
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
                                            .map((s) => s.trim()),
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
              <div className="blocks-header-buttons">
                <button
                  className="add-library-button"
                  onClick={() => setIsLibraryOpen(true)}
                  title="Add from library"
                >
                  Library
                </button>
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
                  title="Add blank block"
                >
                  +
                </button>
              </div>
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
                  snapshots={simulationSnapshots}
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
            <span className="logo-text">PYRE</span>: info
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

      {isLibraryOpen && (
        <BlockLibrary
          onSelectTemplate={handleAddFromLibrary}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}

      <Modal
        isOpen={shareUrl !== null}
        onClose={() => setShareUrl(null)}
        title="Share Link Created"
      >
        <div className="share-modal-content">
          <p>
            Your read-only share link has been copied to the clipboard. Anyone
            with this link can view your simulation but cannot modify it.
          </p>
          <div className="share-url-container">
            <input
              type="text"
              value={shareUrl || ""}
              readOnly
              className="share-url-input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="copy-button"
              onClick={() => {
                if (shareUrl) {
                  navigator.clipboard.writeText(shareUrl);
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          setLinkError(null);
          setLinkUsername("");
          setLinkPassword("");
        }}
        title="Link to Your Account"
      >
        <div className="link-modal-content">
          <p>
            Sign in or create an account to protect this simulation. A copy will
            be created and linked to your account.
          </p>
          <form onSubmit={handleLinkModalSubmit} className="link-modal-form">
            <input
              type="text"
              className="link-modal-input"
              placeholder="Username"
              value={linkUsername}
              onChange={(e) => setLinkUsername(e.target.value)}
              disabled={isLinking}
              autoComplete="username"
            />
            <input
              type="password"
              className="link-modal-input"
              placeholder="Password"
              value={linkPassword}
              onChange={(e) => setLinkPassword(e.target.value)}
              disabled={isLinking}
              autoComplete="current-password"
            />
            {linkError && <p className="link-modal-error">{linkError}</p>}
            <div className="link-modal-buttons">
              <button
                type="button"
                className="link-modal-cancel"
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkError(null);
                }}
                disabled={isLinking}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="link-modal-submit"
                disabled={isLinking || !linkUsername || !linkPassword}
              >
                {isLinking ? "Linking..." : "Sign In & Link"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}

export default AppPage;
