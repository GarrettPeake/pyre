import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import "./Block.css";
import FloatingLabelInput from "./FloatingLabelInput";
import FloatingLabelTextarea from "./FloatingLabelTextarea";
import FloatingLabelSelect from "./FloatingLabelSelect";
import Chart from "./Chart";
import { type GraphDefinition, type SimulationSnapshot } from "../types";

export interface BlockState {
  title: string;
  startDate: string;
  endDate: string;
  inputs: Record<string, string>;
  init: string;
  frequency: "daily" | "monthly" | "yearly";
  execution: string;
  exports: string;
  graphs: GraphDefinition[];
}

interface BlockProps {
  state: BlockState;
  onChange: (state: BlockState) => void;
  onDelete?: () => void;
  snapshots?: SimulationSnapshot[];
  readOnly?: boolean;
}

function Block({ state, onChange, onDelete, snapshots, readOnly = false }: BlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

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

  // Toggle JSON mode - serialize current state to JSON when entering
  const toggleJsonMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isJsonMode) {
      // Entering JSON mode - serialize full state including graphs
      setJsonText(JSON.stringify(state, null, 2));
      setJsonError(null);
      if (!isExpanded) setIsExpanded(true);
    }
    setIsJsonMode(!isJsonMode);
    // Exit edit mode when entering JSON mode
    if (!isJsonMode && isEditMode) setIsEditMode(false);
  };

  // Handle JSON text changes with validation
  const handleJsonChange = (newJsonText: string) => {
    setJsonText(newJsonText);
    try {
      const parsed = JSON.parse(newJsonText);
      // Validate required fields exist
      if (typeof parsed.title !== "string") throw new Error("title must be a string");
      if (typeof parsed.startDate !== "string") throw new Error("startDate must be a string");
      if (typeof parsed.endDate !== "string") throw new Error("endDate must be a string");
      if (typeof parsed.init !== "string") throw new Error("init must be a string");
      if (typeof parsed.execution !== "string") throw new Error("execution must be a string");
      if (typeof parsed.exports !== "string") throw new Error("exports must be a string");
      if (!["daily", "monthly", "yearly"].includes(parsed.frequency)) {
        throw new Error("frequency must be daily, monthly, or yearly");
      }
      if (typeof parsed.inputs !== "object" || parsed.inputs === null) {
        throw new Error("inputs must be an object");
      }
      if (!Array.isArray(parsed.graphs)) {
        throw new Error("graphs must be an array");
      }
      // Apply valid JSON including graphs
      setJsonError(null);
      onChange(parsed);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const inputNames = Object.keys(state.inputs);

  // Graph manipulation handlers
  const handleAddGraph = () => {
    onChange({
      ...state,
      graphs: [
        ...state.graphs,
        {
          id: uuidv4(),
          title: "Debug Graph",
          frequency: state.frequency,
          verticals: [],
          expressions: { line: [], stacked: [], bar: [] },
        },
      ],
    });
  };

  const handleUpdateGraph = (
    graphIndex: number,
    field: keyof GraphDefinition,
    value: string | GraphDefinition["expressions"] | GraphDefinition["frequency"]
  ) => {
    onChange({
      ...state,
      graphs: state.graphs.map((g, i) =>
        i === graphIndex ? { ...g, [field]: value } : g
      ),
    });
  };

  const handleUpdateGraphExpression = (
    graphIndex: number,
    exprType: "line" | "stacked" | "bar",
    value: string
  ) => {
    const parsedValue = value.split(",").map((s) => s.trim());
    onChange({
      ...state,
      graphs: state.graphs.map((g, i) =>
        i === graphIndex
          ? { ...g, expressions: { ...g.expressions, [exprType]: parsedValue } }
          : g
      ),
    });
  };

  const handleDeleteGraph = (graphIndex: number) => {
    onChange({
      ...state,
      graphs: state.graphs.filter((_, i) => i !== graphIndex),
    });
  };

  return (
    <div className="block">
      <div className="block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="block-header-row">
          <div className="block-header-left">
            <span className="block-expand-icon">{isExpanded ? "▼" : "▶"}</span>
            {isEditMode && !readOnly ? (
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
              disabled={readOnly}
            />

            <FloatingLabelInput
              label="End Date"
              type="date"
              value={state.endDate}
              onChange={(e) => handleStateChange("endDate", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="block-header-right">
            {!readOnly && (
              <button
                className={`block-action-button ${isJsonMode ? "json-active" : ""}`}
                onClick={toggleJsonMode}
              >
                JSON
              </button>
            )}
            <button
              className={`block-action-button ${isEditMode ? "save" : ""}`}
              onClick={toggleEditMode}
              disabled={isJsonMode}
            >
              {readOnly ? (isEditMode ? "Hide Details" : "Show Details") : (isEditMode ? "Done" : "Edit")}
            </button>
            {!readOnly && (
              <button
                className="block-action-button delete"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
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
                    disabled={readOnly}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="block-content">
          {isJsonMode && (
            <div className={`block-json-section ${jsonError ? "has-error" : ""}`}>
              <div className="block-json-header">
                <span className="block-json-label">JSON Editor</span>
                {jsonError && <span className="block-json-error">{jsonError}</span>}
              </div>
              <textarea
                className="block-json-editor"
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}

          {((isEditMode && !isJsonMode) || (readOnly && isEditMode)) && (
            <div className="block-edit-section">
              <div className="block-form-row">
                <div className="block-form-inline-group">
                  <FloatingLabelSelect
                    label="Frequency"
                    value={state.frequency}
                    onChange={(e) =>
                      handleStateChange("frequency", e.target.value)
                    }
                    disabled={readOnly}
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
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="block-form-group">
                <FloatingLabelTextarea
                  label="Initialization"
                  value={state.init}
                  onChange={(e) => handleStateChange("init", e.target.value)}
                  rows={9}
                  disabled={readOnly}
                />
              </div>

              <div className="block-form-group">
                <FloatingLabelTextarea
                  label="Execution"
                  value={state.execution}
                  onChange={(e) =>
                    handleStateChange("execution", e.target.value)
                  }
                  rows={9}
                  disabled={readOnly}
                />
              </div>

              <div className="block-form-group">
                <FloatingLabelInput
                  label="Exported Variables"
                  value={state.exports}
                  onChange={(e) =>
                    validateIdentifier(e.target.value) &&
                    handleStateChange("exports", e.target.value)
                  }
                  placeholder=""
                  disabled={readOnly}
                />
              </div>

              {!readOnly && (
                <div className="block-debug-graphs-section">
                  <div className="block-debug-graphs-header">
                    <span className="block-debug-graphs-title">Debug Graphs</span>
                    <button
                      className="block-add-graph-button"
                      onClick={handleAddGraph}
                      type="button"
                    >
                      + Add Graph
                    </button>
                  </div>

                  {state.graphs.map((graph, index) => (
                    <div key={graph.id} className="block-graph-config-card">
                      <div className="block-graph-config-header">
                        <FloatingLabelInput
                          label="Title"
                          value={graph.title}
                          onChange={(e) =>
                            handleUpdateGraph(index, "title", e.target.value)
                          }
                        />
                        <FloatingLabelSelect
                          label="Frequency"
                          value={graph.frequency}
                          onChange={(e) =>
                            handleUpdateGraph(
                              index,
                              "frequency",
                              e.target.value as "daily" | "monthly" | "yearly"
                            )
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </FloatingLabelSelect>
                        <button
                          className="block-delete-graph-button"
                          onClick={() => handleDeleteGraph(index)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="block-graph-expressions">
                        <FloatingLabelInput
                          label="Line Expressions (comma-separated)"
                          value={graph.expressions.line?.join(", ") || ""}
                          onChange={(e) =>
                            handleUpdateGraphExpression(index, "line", e.target.value)
                          }
                          placeholder=""
                        />
                        <FloatingLabelInput
                          label="Stacked Expressions (comma-separated)"
                          value={graph.expressions.stacked?.join(", ") || ""}
                          onChange={(e) =>
                            handleUpdateGraphExpression(index, "stacked", e.target.value)
                          }
                          placeholder=""
                        />
                        <FloatingLabelInput
                          label="Bar Expressions (comma-separated)"
                          value={graph.expressions.bar?.join(", ") || ""}
                          onChange={(e) =>
                            handleUpdateGraphExpression(index, "bar", e.target.value)
                          }
                          placeholder=""
                        />
                      </div>
                    </div>
                  ))}

                  {state.graphs.length === 0 && (
                    <p className="block-debug-graphs-hint">
                      Add graphs to visualize variables while debugging your function
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!isJsonMode &&
            state.graphs &&
            state.graphs.length > 0 &&
            snapshots && (
              <div className="block-graphs-display">
                {state.graphs.map((graph) => (
                  <div key={graph.id} className="block-section">
                    <Chart graphDefinition={graph} snapshots={snapshots} />
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default Block;
