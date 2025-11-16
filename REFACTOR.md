# Major Refactor: Global Context & Configurable Graphs

## Summary

### Initial Request

The user requested a major refactor to align the current implementation with the target state described in CLAUDE.md. The key changes include:

1. **Lift block execution out of Block components into AppPage** - Move from isolated per-block execution to centralized orchestration
2. **Remove hardcoded financial variables** - Eliminate the default `assets`, `liabilities`, `income`, `expenses` variables in favor of user-defined variables through a global init block
3. **Enable simultaneous block execution** - Design BlockRunner to execute all blocks together with shared global context
4. **Add configurable main graphs** - Allow users to define custom graphs with multiple expression types (line, stacked, bar)

### Design Decisions

Based on clarifying questions, the following design decisions were made:

1. **Block Charts:** Remove default charts entirely - blocks will only show custom graph variables defined by the user
2. **Variable Persistence:** All variables persist across time - no special treatment for "rate" vs "quantity" variables. The simulation state is persistent; each iteration increments the date and executes blocks again without resetting state. Users can compute rate variables by creating initial/ending blocks that track deltas.
3. **Graph Expressions:** Support multiple expression types per graph (e.g., both `line` and `stacked` in the same graph definition)
4. **Block-Local Variables:** Variables calculated in init/execution but not exported will persist within that block across its execution periods
5. **Security Update:** Add `/` and `:` to the list of banned characters in code execution

Please read @src/BlockRunner.ts @src/components/Block.tsx @src/pages/AppPage.tsx @CLAUDE.md before starting

---

## Phase 1: Update Data Structures

### BlockState Interface Changes (src/components/Block.tsx):

- **Remove:** `init_assets`, `init_liabilities`, `init_income`, `init_expenses`
- **Remove:** `execution_assets`, `execution_liabilities`, `execution_income`, `execution_expenses`
- **Add:** `exports: string` (comma-separated variable names to export to global scope)
- **Modify** `graph_type` and `graph_vars` are replaced with `graphs: GraphDefinition[]`
- **Keep:** All other fields (title, dates, inputs, init, execution, frequency)

### AppPage State Additions (src/pages/AppPage.tsx):

- **Add:** `globalInit: string` - Global initialization code run once at simulation start
- **Add:** `graphs: GraphDefinition[]` - User-defined main graphs

### New GraphDefinition Interface:

```typescript
interface GraphDefinition {
  id: string;
  title: string;
  frequency: "daily" | "monthly" | "yearly";
  verticals: {
    date: Date;
    label: string;
  }[];
  expressions: {
    line?: string[]; // Array of expressions for line series (e.g., ["401k + cash", "investments"])
    stacked?: string[]; // Array of expressions for stacked series (e.g., ["401k", "cash", "investments"])
    bar?: string[]; // Array of expressions for bar series
  };
}
```

The new init/graph/age editor on AppPage should utilize the same form elements as the Block to maintain UI unity. It should additionally also have an Edit/Done toggle which converts it from showing the whole editor to showing nothing but the defined graphs.

### SavedPlanData Interface Update:

- **Add:** `globalInit: string`
- **Add:** `graphs: GraphDefinition[]`
- **Keep:** `currentAge`, `retirementAge`, `blocks`

---

## Phase 2: Update BlockRunner Security

### File: src/BlockRunner.ts

1. **Rename to MathLangUtils.ts**

2. **Update banned characters:**

   - **Old:** `/[.{}[\]'"\`]/`
   - **New:** `/[{}[\]'"\#`/:]/`
   - Add `/`, `:`, and `#` to prevent additional injection vectors
   - Add a check that any period `.` is followed by a digit
   - If `/\.[\s]*[^0-9]/` matches, this check fails (note whitespace is ignored)

3. **Add comment support:**
   - Before processing code, remove lines starting with `#`
   - Implementation: `code.split('\n').filter(line => !line.trim().startsWith('#')).join('\n')`

---

## Phase 3: New Centralized Execution Engine

### Create runGlobalSimulation() function in src/SimulationEngine.ts:

**Purpose:** Replace the distributed execution model from MathLangUtils with a centralized engine that:

1. Maintains global context shared across all blocks
2. Maintains per-block local contexts that persist across that block's executions
3. Executes blocks in order with proper variable scoping and exports
4. Returns complete snapshots of global context at each date

**Algorithm:**

1. **Global Init Phase:**

   - Execute `globalInit` code once exporting all variables to the global context

2. **Block Init Phase:**

   - For each block in order:
     - Create block-local context populated with block inputs
     - Update default inputs (periods_from_start, etc.)
     - Use the spread operator to add the global context and default inputs to the local context
     - Execute block's `init` code using the local context
     - Copy all global and exported variables from the concatenated context back to the global context

3. **Time Iteration Phase:**

   - For each day from age 0 to age 100 (includes every day of each year):
     - For each block in order:
       - Check if block should execute (date within range, frequency matches)
       - If yes:
         - Restore block-local context (persists across this block's executions)
         - Update default inputs (periods_from_start, etc.)
         - Use the spread operator to add the global context and default inputs to the local context
         - Execute block's `execution` code
         - Copy all global and exported variables from the concatenated context back to the global context
     - Store snapshot of complete global context for that date in date map

4. **Return:** Array of `SimulationSnapshot[]`

### Data Structures:

```typescript
interface SimulationSnapshot {
  date: string; // ISO date string
  context: Record<string, number>; // Complete global context at this point in time
}

interface SimulationInput {
  globalInit: string;
  blocks: Array<{
    id: string;
    state: BlockState;
  }>;
  startAge: number;
  currentAge: number;
  endAge: number; // Default: 100
}
```

### Context Management Details:

- **Global context:** Single object persisting across all time, modified by blocks through exports
- **Block-local context:** One per block, persists across that block's execution periods
- **Exports:** Copy specified variables from block-local → global after each execution

You should utilize the MathLangUtils file to execute the code, but after creating the SimulationEngine, you should deprecate the runBlock code from MathLangUtils. SimulationRunner is responsible for flow, MathLangUtils is responsible for evaluating code

---

## Phase 4: Update Chart component

Charts will need to support multiple display types at the same time of stacked bars and/or lines. The @src/components/Chart.tsx will require updating to suport and input of a `GraphDefinition` + `SimulationSnapshot[]` to display a chart.

1. **Update graph rendering:**

   - Sample snapshots at specified frequency
   - For each expression in line/stacked:
     - Evaluate expression using snapshot's context using MathLangUtils
     - Build ChartDataPoint

2. **Update state persistence:**
   - Save/load `globalInit` and `graphs` to backend
   - Remove execution results from save data (already done)

---

## Phase 5: Refactor AppPage

### File: src/pages/AppPage.tsx

1. **Add Global Config UI:**

   - Add section above the current main graphs titled "Simulation Setup" that is only shown when a new Edit button is pressed
   - Include FloatingLabelTextarea for `globalInit` code
   - Show example: `401k = 100000\ncash = 100000\ninvestments = 200000`
   - List of graph definitions with add/edit/delete controls is shown in the
   - Each graph has:
     - Title input
     - Frequency selector
     - Multiple expression inputs (line, stacked, bar)
     - Graph type affects which expression fields are shown

2. **Replace execution logic:**

   - **Remove:** All aggregation logic (aggregateResults, quantitiesData, ratesData computation)
   - **Remove:** handleBlockExecutionResults callback
   - **Add:** Single useEffect that calls `runGlobalSimulation()` when state changes on a debounced timer of 3.5s
   - **Result:** `simulationSnapshots: SimulationSnapshot[]`

3. **Add Graph Management UI:**

   - Replaces current main graphs section between global init and blocks
   - Shows the graphs that have been configured in the Global Config UI

4. **Utilize new Chart Component**
   - Remove hardcoded "Net Worth" and "Monthly Change" graphs
   - Utilize the updated chart component to display the user defined graphs

---

## Phase 6: Update Block Component

### File: src/components/Block.tsx

1. **Remove default chart rendering:**

   - **Delete:** Quantities Chart (Assets - Liabilities)
   - **Delete:** Rates Chart (Income - Expenses)
   - **Keep:** Custom Variables Graph (when graph_vars defined)

2. **Remove execution logic:**

   - **Delete:** Entire useEffect (lines 52-109) that runs BlockRunner
   - **Delete:** executionResults state
   - **Delete:** handleBlockExecutionResults in props
   - Block no longer executes itself

3. **Add exports field:**

   - Add FloatingLabelInput for `exports` (comma-separated) in edit mode
   - Place it near the bottom of edit form, after execution textarea
   - Label: "Exported Variables" or "Export to Global Scope"
   - Placeholder: "interest_portion,principle_portion"

4. **Remove addends fields:**

   - **Delete:** All init addends inputs (init_assets, init_liabilities, init_income, init_expenses)
   - **Delete:** All execution addends inputs (execution_assets, etc.)
   - **Delete:** "Initial addends:" and "Execution addends:" rows from edit form

5. **Update BlockState interface:**

   - Add `exports: string`
   - Remove all `init_*` and `execution_*` addends fields

6. **Simplify expanded view:**

   - Header row: Title, Start Date, End Date (unchanged)
   - Input row: Dynamic inputs (unchanged)
   - Edit mode: Frequency, Inputs, Init textarea, Execution textarea, Exports, Graph Variables, Graph Type
   - Normal mode: Just shows custom graph (if graph_vars defined)

7. **Update props:**
   - Remove `onExecutionResultsChange`
   - Keep `state`, `onChange`, `onDelete`

---

## Phase 7: Update Default Example

### File: src/pages/AppPage.tsx

Rewrite DEFAULT_BLOCKS to use new architecture using the example from @CLAUDE.md

**Key changes:**

- Variables like `home_value` and `mortgage_debt` are manipulated directly (no separate assets/liabilities)
- Uses `exports` to make `interest_portion` and `principle_portion` available globally
- Global init establishes starting values

---
