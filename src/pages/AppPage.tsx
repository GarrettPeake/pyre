import { useParams } from "react-router-dom";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Block, {
  type BlockRunnerResult,
  type BlockState,
} from "../components/Block";
import FloatingLabelInput from "../components/FloatingLabelInput";
import Chart, { type ChartDataPoint } from "../components/Chart";
import "./AppPage.css";
import { v4 as uuidv4 } from "uuid";

interface BlockData {
  id: string;
  state: BlockState;
  executionResults: BlockRunnerResult[];
}

interface SavedPlanData {
  currentAge: number;
  retirementAge: number;
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
        currentAge: 30,
        retirementAge: 62,
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

interface DateResult {
  assets: number;
  liabilities: number;
  income: number;
  expenses: number;
}

// Default block configuration
const DEFAULT_BLOCKS: BlockData[] = [
  {
    id: uuidv4(),
    state: {
      title: "Home loan",
      startDate: "2025-11-01",
      endDate: "2055-11-01",
      inputs: {
        down_payment: "25000",
        original_principle: "175000",
        apr: "0.06",
      },
      init: `asset_price = down_payment + original_principle
current_principle = original_principle
payments = total_periods
monthly_interest = apr / 12
payment = original_principle * monthly_interest * (1 + monthly_interest) ** payments / ((1 + monthly_interest) ** payments - 1)`,
      init_assets: "asset_price",
      init_liabilities: "original_principle",
      init_income: "",
      init_expenses: "down_payment",
      frequency: "monthly",
      execution: `interest_portion = current_principle * monthly_interest
principle_portion = payment - interest_portion
current_principle = current_principle - principle_portion
reduction_in_liability = -principle_portion`,
      execution_assets: "",
      execution_liabilities: "reduction_in_liability",
      execution_income: "",
      execution_expenses: "payment",
      graph_vars: "interest_portion,principle_portion",
      graph_type: "line",
    },
    executionResults: [],
  },
];

const EMPTY_BLOCK_STATE: BlockState = {
  title: "New block",
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
  inputs: {},
  init: "",
  init_assets: "",
  init_liabilities: "",
  init_income: "",
  init_expenses: "",
  frequency: "monthly",
  execution: "",
  execution_assets: "",
  execution_liabilities: "",
  execution_income: "",
  execution_expenses: "",
  graph_vars: "",
  graph_type: "line",
};

function AppPage() {
  const { planId } = useParams<{ planId: string }>();
  const [currentAge, setCurrentAge] = useState<number>(25);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load plan data from backend on mount
  useEffect(() => {
    if (!planId) {
      setIsLoading(false);
      return;
    }

    fetchPlan(planId).then((data) => {
      if (data) {
        setCurrentAge(data.currentAge);
        setRetirementAge(data.retirementAge);
        setBlocks(
          data.blocks.map((block) => ({
            id: block.id,
            state: block.state,
            executionResults: [],
          }))
        );
      }
      setIsLoading(false);
    });
  }, [planId]);

  // Callback to update execution results for a specific block
  const handleBlockExecutionResults = useCallback(
    (blockId: string, results: BlockRunnerResult[]) => {
      console.log("Handling result update");
      setBlocks((prevBlocks) =>
        prevBlocks.map((block) =>
          block.id === blockId ? { ...block, executionResults: results } : block
        )
      );
    },
    []
  );

  // Save plan to backend
  const saveToBackend = useCallback(
    async (updatedBlocks: BlockData[]) => {
      if (!planId) return;

      const planData: SavedPlanData = {
        currentAge,
        retirementAge,
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
    [planId, currentAge, retirementAge]
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

  // Debounced auto-save when blocks or ages change
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
  }, [blocks, currentAge, retirementAge, isLoading, saveToBackend]);

  // Generate data points from age 0 to 100
  const currentYear = new Date().getFullYear();

  // Aggregate execution results from all blocks
  const aggregateResults = useCallback(() => {
    // Create a map of date string -> aggregated values
    const dateMap = new Map<string, DateResult>();

    // Create a lookup map for block execution results
    const blockResultsMap = new Map<string, DateResult>();

    // Populate the lookup map with all block execution results
    blocks.forEach((block) => {
      block.executionResults.forEach((result) => {
        const resultDate = new Date(result.date);
        const dateKey = resultDate.toISOString().split("T")[0];

        const existing = blockResultsMap.get(dateKey);
        if (existing) {
          existing.assets += result.assets;
          existing.liabilities += result.liabilities;
          existing.income += result.income;
          existing.expenses += result.expenses;
        } else {
          blockResultsMap.set(dateKey, {
            assets: result.assets,
            liabilities: result.liabilities,
            income: result.income,
            expenses: result.expenses,
          });
        }
      });
    });

    console.log(blockResultsMap);

    // Iterate through every single date from age 0 to 100 (365 days per year)
    let previousAssets = 0;
    let previousLiabilities = 0;

    const startDate = new Date(currentYear - currentAge, 0, 1); // January 1st of birth year
    const endDate = new Date(currentYear + (100 - currentAge), 11, 31); // December 31st at age 100

    // Iterate day by day
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0];

      // Inherit assets and liabilities from previous day
      // Start with income and expenses at 0
      const dayData = {
        assets: previousAssets,
        liabilities: previousLiabilities,
        income: 0,
        expenses: 0,
      };

      // Check if there are any execution results for this date
      const blockResults = blockResultsMap.get(dateKey);
      if (blockResults) {
        dayData.assets += blockResults.assets;
        dayData.liabilities += blockResults.liabilities;
        dayData.income += blockResults.income;
        dayData.expenses += blockResults.expenses;
      }

      // Store this day's data
      dateMap.set(dateKey, dayData);

      // Update previous values for next iteration
      previousAssets = dayData.assets;
      previousLiabilities = dayData.liabilities;

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dateMap;
  }, [blocks, currentAge, currentYear]);

  // Build chart data from aggregated results
  const aggregatedMap = useMemo(
    () => aggregateResults(),
    [blocks, currentAge, currentYear]
  );

  // Build quantities data (assets - liabilities are already cumulative from aggregation)
  const quantitiesData: ChartDataPoint[] = Array.from(aggregatedMap).map(
    ([dateKey, dateResult]) => {
      const date = new Date(`${dateKey}T00:00:00Z`);

      return {
        date,
        net_worth: dateResult.assets - dateResult.liabilities,
      };
    }
  );

  // Rates are not cumulative - aggregate by month since income/expenses are bursty
  const monthlyRatesMap = new Map<
    string,
    { income: number; expenses: number }
  >();

  Array.from(aggregatedMap).forEach(([dateKey, dateResult]) => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    const monthKey = `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    const existing = monthlyRatesMap.get(monthKey) || {
      income: 0,
      expenses: 0,
    };
    monthlyRatesMap.set(monthKey, {
      income: existing.income + dateResult.income,
      expenses: existing.expenses + dateResult.expenses,
    });
  });

  const ratesData: ChartDataPoint[] = Array.from(monthlyRatesMap).map(
    ([monthKey, monthResult]) => {
      const [year, month] = monthKey.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);

      return {
        date,
        income_rate: monthResult.income - monthResult.expenses,
      };
    }
  );

  // Calculate dates for vertical indicators
  const currentAgeDate = new Date(currentYear, 0, 1);
  const retirementAgeDate = new Date(
    currentYear + (retirementAge - currentAge),
    0,
    1
  );

  const verticals = [
    {
      position: currentAgeDate.getTime(),
      label: `Age ${currentAge}`,
      color: "var(--color-accent-orange)",
    },
    {
      position: retirementAgeDate.getTime(),
      label: `Age ${retirementAge}`,
      color: "var(--color-primary)",
    },
  ];

  return (
    <div className="app-page">
      <header className="app-header">
        <div className="header-content">
          <div className="header-logo">
            <h1 className="logo-text">PYRE</h1>
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
          <section className="overview-card">
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

            <div className="graph-content">
              <Chart
                title="Net Worth (Assets - Liabilities)"
                data={quantitiesData}
                verticals={verticals}
                graphType="line"
              />
            </div>
            <div className="graph-content">
              <Chart
                title="Monthly Change (Income - Expenses)"
                data={ratesData}
                verticals={verticals}
                graphType="line"
              />
            </div>
          </section>

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
                      executionResults: [],
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
                  onExecutionResultsChange={(results) =>
                    handleBlockExecutionResults(block.id, results)
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
    </div>
  );
}

export default AppPage;
