import { useState } from "react";
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
}

function Block({ state, onChange, onDelete, snapshots }: BlockProps) {
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

  // Get block state for JSON editing (excludes graphs which are complex objects)
  const getJsonEditableState = () => {
    const { graphs, ...editableState } = state;
    return editableState;
  };

  // Toggle JSON mode - serialize current state to JSON when entering
  const toggleJsonMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isJsonMode) {
      // Entering JSON mode - serialize state
      setJsonText(JSON.stringify(getJsonEditableState(), null, 2));
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
      // Apply valid JSON, preserving graphs
      setJsonError(null);
      onChange({ ...parsed, graphs: state.graphs });
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const inputNames = Object.keys(state.inputs);

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
              className={`block-action-button ${isJsonMode ? "json-active" : ""}`}
              onClick={toggleJsonMode}
            >
              JSON
            </button>
            <button
              className={`block-action-button ${isEditMode ? "save" : ""}`}
              onClick={toggleEditMode}
              disabled={isJsonMode}
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

          {isEditMode && !isJsonMode && (
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
                  rows={9}
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
                />
              </div>
            </div>
          )}

          {!isEditMode &&
            !isJsonMode &&
            state.graphs &&
            state.graphs.length > 0 &&
            snapshots && (
              <>
                {state.graphs.map((graph) => (
                  <div key={graph.id} className="block-section">
                    <Chart graphDefinition={graph} snapshots={snapshots} />
                  </div>
                ))}
              </>
            )}
        </div>
      )}
    </div>
  );
}

export default Block;
