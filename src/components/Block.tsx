import { useState, useEffect } from "react";
import "./Block.css";
import FloatingLabelInput from "./FloatingLabelInput";
import FloatingLabelTextarea from "./FloatingLabelTextarea";
import FloatingLabelSelect from "./FloatingLabelSelect";
import { runBlock, type BlockRunnerResult } from "../BlockRunner";
import Chart, { type ChartDataPoint } from "./Chart";

export interface BlockState {
  title: string;
  startDate: string;
  endDate: string;
  inputs: Record<string, string>;
  init: string;
  init_assets: string;
  init_liabilities: string;
  init_income: string;
  init_expenses: string;
  frequency: "daily" | "monthly" | "yearly";
  execution: string;
  execution_assets: string;
  execution_liabilities: string;
  execution_income: string;
  execution_expenses: string;
  graph_vars: string;
  graph_type: "bar" | "stacked" | "line";
}

interface BlockProps {
  state: BlockState;
  onChange: (state: BlockState) => void;
  onDelete?: () => void;
  onExecutionResultsChange?: (results: BlockRunnerResult[]) => void;
}

function Block({
  state,
  onChange,
  onDelete,
  onExecutionResultsChange,
}: BlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Store execution results
  const [executionResults, setExecutionResults] = useState<BlockRunnerResult[]>(
    []
  );

  // Run block execution whenever inputs or configuration changes
  // Debounced to wait 1 second after last change before executing
  useEffect(() => {
    // Only run if we have valid dates
    console.log("Use effect");
    if (!state.startDate || !state.endDate) {
      setExecutionResults([]);
      return;
    }

    // Set up debounce timer
    const timeoutId = setTimeout(() => {
      // Convert input values to numbers
      const numericInputs: Record<string, number> = {};
      for (const [key, value] of Object.entries(state.inputs)) {
        const numValue = parseFloat(value);
        numericInputs[key] = isNaN(numValue) ? 0 : numValue;
      }

      try {
        const results = runBlock({
          startDate: state.startDate,
          endDate: state.endDate,
          frequency: state.frequency,
          inputs: numericInputs,
          initCalculations: state.init,
          initQuantities: {
            assets: state.init_assets,
            liabilities: state.init_liabilities,
            income: state.init_income,
            expenses: state.init_expenses,
          },
          executionCalculations: state.execution,
          executionQuantities: {
            assets: state.execution_assets,
            liabilities: state.execution_liabilities,
            income: state.execution_income,
            expenses: state.execution_expenses,
          },
          graphVars: state.graph_vars
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        setExecutionResults(results);
        if (onExecutionResultsChange) {
          onExecutionResultsChange(results);
        }
      } catch (error) {
        console.error("Error running block:", error);
        setExecutionResults([]);
        if (onExecutionResultsChange) {
          onExecutionResultsChange([]);
        }
      }
    }, 1000);

    // Cleanup function to cancel timer if state changes again
    return () => clearTimeout(timeoutId);
  }, [state]);

  const handleStateChange = (
    field: keyof BlockState,
    value: string | number
  ) => {
    // If inputs field changed, update inputValues
    if (field === "inputs" && typeof value === "string") {
      const newInputs = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      onChange({
        ...state,
        inputs: Object.fromEntries(
          newInputs.map((name: string) => [name, state.inputs[name] || ""])
        ),
      });
    } else {
      onChange({ ...state, [field]: value });
    }
  };

  const handleInputValueChange = (name: string, value: string) => {
    onChange({
      ...state,
      inputs: { ...state.inputs, [name]: value },
    });
  };

  const toggleEditMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && !isEditMode) setIsExpanded(true);
    setIsEditMode(!isEditMode);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete();
  };

  const validateIdentifier = (value: string) => {
    return /^[a-zA-Z_,]*$/.test(value);
  };

  // Prepare chart data from execution results
  const quantitiesData: ChartDataPoint[] = executionResults.map((r) => ({
    date: new Date(r.date),
    worth: r.assets - r.liabilities,
  }));

  const ratesData: ChartDataPoint[] = executionResults.map((r) => ({
    date: new Date(r.date),
    change: r.income - r.expenses,
  }));

  const inputNames = Object.keys(state.inputs);
  const graphVarNames = state.graph_vars
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Prepare custom graph data from graph variables
  const customGraphData: ChartDataPoint[] = executionResults.map((r) => {
    const dataPoint: ChartDataPoint = {
      date: new Date(r.date),
    };
    // Add each graph variable as a series
    graphVarNames.forEach((varName) => {
      if (varName in r && typeof r[varName] === "number") {
        dataPoint[varName] = r[varName] as number;
      } else {
        dataPoint[varName] = 0;
      }
    });
    return dataPoint;
  });

  // Generate colors for multiple graph variables (cycling through a palette)
  const graphColors = [
    "var(--color-accent-orange)",
    "var(--color-primary)",
    "#9c27b0", // purple
    "#2196f3", // blue
    "#ff5722", // deep orange
  ];

  return (
    <div className="block">
      <div className="block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="block-header-row">
          <div className="block-header-left">
            <span className="block-expand-icon">{isExpanded ? "▼" : "▶"}</span>
            {isEditMode ? (
              <FloatingLabelInput
                label="Title"
                type="text"
                className="block-title"
                value={state.title}
                onChange={(e) => handleStateChange("title", e.target.value)}
              />
            ) : (
              <h3 className="block-title">{state.title}</h3>
            )}
            <FloatingLabelInput
              label="Start Date"
              type="date"
              value={state.startDate}
              onChange={(e) => handleStateChange("startDate", e.target.value)}
            />

            <FloatingLabelInput
              label="End Date"
              type="date"
              value={state.endDate}
              onChange={(e) => handleStateChange("endDate", e.target.value)}
            />
          </div>
          <div className="block-header-right">
            <button
              className={`block-action-button ${isEditMode ? "save" : ""}`}
              onClick={toggleEditMode}
            >
              {isEditMode ? "Done" : "Edit"}
            </button>
            <button
              className="block-action-button delete"
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="block-header-row">
          {inputNames.length > 0 && (
            <>
              {inputNames.map((name) => (
                <div key={name}>
                  <FloatingLabelInput
                    label={name}
                    value={state.inputs[name] || ""}
                    onChange={(e) =>
                      handleInputValueChange(name, e.target.value)
                    }
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="block-content">
          {isEditMode && (
            <div className="block-edit-section">
              <div className="block-form-row">
                <div className="block-form-inline-group">
                  <FloatingLabelSelect
                    label="Frequency"
                    value={state.frequency}
                    onChange={(e) =>
                      handleStateChange("frequency", e.target.value)
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </FloatingLabelSelect>
                </div>

                <div className="block-form-inline-group block-form-inline-group-flex">
                  <FloatingLabelInput
                    label="Inputs"
                    value={Object.keys(state.inputs).join(",")}
                    onChange={(e) =>
                      validateIdentifier(e.target.value) &&
                      handleStateChange("inputs", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="block-form-group">
                <FloatingLabelTextarea
                  label="Initialization"
                  value={state.init}
                  onChange={(e) => handleStateChange("init", e.target.value)}
                  className="block-form-textarea"
                  rows={6}
                />
              </div>

              <div className="block-form-effects-row">
                <span className="block-form-effects-label">
                  Initial addends:
                </span>
                <FloatingLabelInput
                  label="Assets"
                  value={state.init_assets}
                  onChange={(e) =>
                    handleStateChange("init_assets", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Liabilities"
                  value={state.init_liabilities}
                  onChange={(e) =>
                    handleStateChange("init_liabilities", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Income"
                  value={state.init_income}
                  onChange={(e) =>
                    handleStateChange("init_income", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Expenses"
                  value={state.init_expenses}
                  onChange={(e) =>
                    handleStateChange("init_expenses", e.target.value)
                  }
                />
              </div>

              <div className="block-form-group">
                <FloatingLabelTextarea
                  label="Execution"
                  value={state.execution}
                  onChange={(e) =>
                    handleStateChange("execution", e.target.value)
                  }
                  className="block-form-textarea"
                  rows={6}
                />
              </div>

              <div className="block-form-effects-row">
                <span className="block-form-effects-label">
                  Execution addends:
                </span>
                <FloatingLabelInput
                  label="Assets"
                  value={state.execution_assets}
                  onChange={(e) =>
                    handleStateChange("execution_assets", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Liabilities"
                  value={state.execution_liabilities}
                  onChange={(e) =>
                    handleStateChange("execution_liabilities", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Income"
                  value={state.execution_income}
                  onChange={(e) =>
                    handleStateChange("execution_income", e.target.value)
                  }
                />
                <FloatingLabelInput
                  label="Expenses"
                  value={state.execution_expenses}
                  onChange={(e) =>
                    handleStateChange("execution_expenses", e.target.value)
                  }
                />
              </div>

              <div className="block-form-row">
                <div className="block-form-inline-group block-form-inline-group-flex">
                  <FloatingLabelInput
                    label="Graph Variables"
                    value={state.graph_vars}
                    onChange={(e) =>
                      validateIdentifier(e.target.value) &&
                      handleStateChange("graph_vars", e.target.value)
                    }
                  />
                </div>

                <div className="block-form-inline-group">
                  <FloatingLabelSelect
                    label="Graph Type"
                    value={state.graph_type}
                    onChange={(e) =>
                      handleStateChange("graph_type", e.target.value)
                    }
                  >
                    <option value="bar">Bar</option>
                    <option value="stacked">Stacked</option>
                    <option value="line">Line</option>
                  </FloatingLabelSelect>
                </div>
              </div>
            </div>
          )}

          <div className="block-section">
            <Chart title="" data={quantitiesData} graphType="line" />
          </div>

          <div className="block-section">
            <Chart title="" data={ratesData} graphType="line" />
          </div>

          {graphVarNames.length > 0 && customGraphData.length > 0 && (
            <div className="block-section">
              <Chart
                title={`Custom Variables (${state.graph_type})`}
                data={customGraphData}
                graphType={state.graph_type}
                lineColors={graphColors}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Block;
export type { BlockRunnerResult };
