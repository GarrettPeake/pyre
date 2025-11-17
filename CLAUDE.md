# About the project

This project is a financial planning calculator that takes a very configurable approach to financial planning.

It represents everything using a simple math language to enable building complex financial plans from the ground up.

To start, the user defines their current age and target retirement age, then they define an initialization block to set parameters at their current age. And finally they can define the graphs that they want to be shown for the simulation

```
-- Ages
30, 62

-- Init
k401 = 100000
cash = 100000
investments = 200000
bonds = 100000
property = 0
debts = 0

-- Graphs (these graphs have vertical lines for the current and retirement ages)
Net Worth:
    frequency: daily
    line: k401 + cash + investments + bonds + property - debts
    stacked: k401,cash,investments,bonds,property,-debts
Mortgage (Interest vs principal contributions):
    frequency: daily
    line: interest_portion, principal_portion
```

The variables in the top level initialization are 'global' and are then accessible to every 'block'

A block defines a financial function that affects our global variables. For instance we can declare a large purchase on a loan using:

```
-- Purchase using a loan

-- Frequency
Monthly

-- Inputs
down_payment, original_principal, apr

-- Init
asset_price = down_payment + original_principal
current_principal = original_principal
payments = total_periods
monthly_interest = apr / 12
payment = original_principal * (monthly_interest * (1 + monthly_interest)^(payments))/((1+monthly_interest)^(payments)-1)
debts = debts + original_principal
property = property + asset_price

-- Execution
interest_portion = current_principal * monthly_interest
principal_portion = payment - interest_portion
current_principal = current_principal - principal_portion
# Comments use a hashtag
debts = debts - principal_portion

-- Export (variables to be added to the global scope to be used by the following blocks)
interest_portion, principal_portion

-- Graph (used to let the user debug their formulas, uses the same frequency as the block itself)
Portions:
    line: interest_portion, principal_portion
```

Note that everything is actually in JSON format, the formatting above is just for brevity/clarity

When the user wants to add this to their financial plan, they simply add this block, defining the start and end of the block period and then entering the inputs of the loan. If they wish to change the math behind the loan, they can actually open this pseudo-code as an interface and modify it!

The block receives default inputs such as the length of the block period which you can see was used in the original block without being defined as well as all of the global variables

Eventually, the program will maintain a library of these different block types

```
-- Default Inputs
total_periods
periods_from_start
```

# User Flow

After entering their initialization parameters, the user starts creating blocks. These blocks use a simple math language, but in reality are evaluated using `eval()` on the frontend, we simply disallow the use of /:{}[]'"`<> and restrict the character following a period to be a number to prevent actual code execution.

After the user has defined their init and execution, they can fill in the inputs and press run to see the entire simulation update. During this update the `Graph` values are shown in the dropdown of the block using the specified chart type.

The simulation runs by executing the global init, then the init for each block and then iterates over every day of every year from when the user was born to the age of 100, invoking daily block executions, invoking monthly block executions on the same day each month as when they started, and invoking yearly block executions on the same day of each year as when they started. Blocks run in the order they are defined in. On each execution, global variables are updated

# Tech Stack

This project uses Cloudflare workers to serve both the front and backend. The backend worker lives in /worker/ and the frontend code in /src/. Static assets are served from /Public/

## Backend Architecture

The backend is intentionally simple - all computational logic runs on the frontend. The backend worker serves only two purposes:

1. **`/api/get_plan/<key>`** - Retrieves saved financial plans from Cloudflare KV storage
2. **`/api/save_plan/<key>`** - Saves financial plans to Cloudflare KV storage

All calculations, block execution, and financial modeling happen client-side. The backend is purely a persistence layer using Cloudflare's KV store with the `FINANCIAL_PLANS` binding.

## Frontend Architecture

The frontend uses React with React Router for navigation. The application has two main pages:

### Routing Structure

- **`/`** - Splash page (landing page)
- **`/app/:planId`** - Main application page with a unique plan ID

When users click "Start with examples" or "Start from scratch" on the splash page, a new UUID is generated and they are navigated to `/app/<uuid>`. This UUID serves as the unique identifier for their financial plan and will be used for saving/loading plans via the backend API.

### Pages

1. **Splash Page** (`src/Splash.tsx`)

   - Landing page with modern, finance-focused design
   - Features the PYRE logo (orange with drop shadow) and tagline "Plan Your Retirement Early"
   - Shows app preview placeholder (currently vite.svg, will be replaced with app screenshot)
   - Displays feature highlights: "Free, Ad Free, Open Source, No Login, No Tracking"
   - Two CTA buttons: "Start with examples" and "Start from scratch"
   - Links to GitHub and Ko-Fi (placeholders for now)

2. **App Page** (`src/AppPage.tsx`)

   - Main application interface with sticky header containing PYRE logo with info icon, plan ID with save status indicator, conditionally-shown Simulate button, and GitHub/Ko-Fi links
   - Info icon (next to logo) opens tutorial modal with comprehensive usage instructions
   - Sticky header shows a duplicate Simulate button when the original button in the Simulation Setup section scrolls out of view, using Intersection Observer API
   - Receives plan ID from URL params
   - Simulation Setup card with editable simulation name (replaces the static "Simulation Setup" title)
   - Overview card containing:
     - Age inputs row with FloatingLabelInput components: Current Age and Target Retirement Age (default 25 and 65)
     - Main charts defined by the user with vertical lines indicting the current and target retirement ages
   - Financial Blocks section with collapsible block cards (see Block component below)
   - Informationally dense layout with compact spacing (1000px max width)

   **Backend Integration:**

   - On page load, fetches plan data from backend using the planId via `/api/get_plan/<planId>`
   - If no saved plan exists, uses default example block configuration with simulationName "My Retirement Plan"
   - Automatically saves plan data (simulationName, currentAge, retirementAge, globalInit, graphs, blocks) on changes with 1-second debounce
   - Save status indicator (checkmark icon) next to planId in header:
     - Green when data is saved
     - Grey when unsaved changes exist
   - SavedPlanData includes: simulationName, currentAge, retirementAge, globalInit, graphs, blocks[]

   **Simulation Execution:**

   - Maintains array of BlockData objects containing block configurations
   - Uses SimulationEngine to run centralized simulation, triggered via:
     - Automatically once when page finishes loading
     - Manually via "Simulate" button in Simulation Setup panel header OR header button when scrolled
   - "Simulate" button shows spinner and "Simulating..." text while running, and is disabled during execution
   - When the original Simulate button scrolls out of view, a duplicate button appears in the sticky header (tracked via Intersection Observer and useRef)
   - Simulation produces SimulationSnapshot[] containing global context at each date
   - Global variables (defined in globalInit) persist throughout simulation and are modified by blocks through exports
   - Block-local variables persist only within that block's executions
   - Charts receive snapshots and evaluate expressions to render visualizations
   - All execution is coordinated through runGlobalSimulation(), not individual block execution

   **Performance Optimizations:**

   - Graph definitions with vertical indicators are memoized using `useMemo` to prevent unnecessary object recreation (`src/pages/AppPage.tsx:303-324`)
   - Charts only re-render when simulation snapshots change, not on every state update
   - Vertical indicators (current age, retirement age) are computed once and reused across all graphs

### Components

**FloatingLabelInput Component** (`src/FloatingLabelInput.tsx`)

A reusable input component with animated floating label behavior. The label floats above the input when focused or when there's a value present.

**Props:**

- `label`: Label text to display
- `type`: Input type (default: 'text')
- `value`: Input value (string or number)
- `onChange`: Change handler
- `className`: Optional CSS class for the input element
- `placeholder`: Optional placeholder text

**FloatingLabelTextarea Component** (`src/FloatingLabelTextarea.tsx`)

A reusable textarea component with animated floating label behavior, sharing the same CSS as FloatingLabelInput. Textareas are styled with monospace font (Courier New) for code editing.

**Props:**

- `label`: Label text to display
- `value`: Textarea value
- `onChange`: Change handler
- `className`: Optional CSS class for the textarea element (not typically needed as default styles are comprehensive)
- `rows`: Number of rows (default: 4)
- `placeholder`: Optional placeholder text

**FloatingLabelSelect Component** (`src/FloatingLabelSelect.tsx`)

A reusable select component with animated floating label behavior, sharing the same CSS as FloatingLabelInput. The label is always in the floating position for select elements.

**Props:**

- `label`: Label text to display
- `value`: Select value
- `onChange`: Change handler
- `className`: Optional CSS class for the select element
- `children`: React nodes (typically `<option>` elements)

**Modal Component** (`src/components/Modal.tsx`)

A reusable modal/dialog component with overlay and close functionality. Used to display tutorial and informational content.

**Props:**

- `isOpen`: Boolean controlling modal visibility
- `onClose`: Callback function when modal is closed
- `title`: Modal title text
- `children`: React nodes for modal body content

**Features:**

- Click overlay to close
- Press Escape key to close
- Prevents body scroll when open
- Auto-focuses close button
- Includes close button (X) in header

**Usage in AppPage:**

- Info icon button in header (next to PYRE logo) opens tutorial modal
- Tutorial modal contains comprehensive documentation on:
  - Getting started and plan auto-save
  - Simulation setup (name, ages, global init, graphs)
  - Financial functions (blocks) configuration
  - Math language syntax and operators
  - Example: home loan block walkthrough
  - Tips for effective use

**Chart Component** (`src/components/Chart.tsx`)

A reusable, D3-powered chart component for rendering financial data visualizations. Supports simultaneous rendering of multiple display types (line, stacked area, and bar charts) in a single chart. Wrapped in `React.memo` for performance optimization to prevent unnecessary re-renders.

**Props:**

- `graphDefinition`: GraphDefinition object containing title, frequency, expressions, and vertical indicators
- `snapshots`: Array of SimulationSnapshot objects containing global context at each date

**Key Features:**

- **Expression Evaluation**: Evaluates mathematical expressions (e.g., `"k401 + cash - debts"`) using snapshot context data via MathLangUtils
- **Frequency Sampling**: Automatically samples snapshots based on frequency (daily/monthly/yearly) to match block execution patterns
- **Multi-Type Rendering**: Supports simultaneous rendering of multiple visualization types:
  - **Line series**: Multiple line charts with distinct colors
  - **Stacked area charts**: Diverging stacked chart - positive values stack upward from zero, negative values stack downward from zero
  - **Bar charts**: Grouped bars with support for multiple series
- **Layered Rendering**: Bars (bottom) → Stacked areas (middle) → Lines (top) for optimal visibility
- **Color Management**: Uses coordinated color palette from CSS variables (orange, green, and accent colors)
- **Vertical Indicators**: Renders vertical lines with labels (e.g., current age, retirement age) from GraphDefinition
- **Automatic Scaling**: Axes scale based on all data values with 10% padding
- **Error Handling**: Gracefully handles expression evaluation errors (defaults to 0)
- **Performance**: Memoized with `React.memo` to only re-render when `graphDefinition` or `snapshots` props change

**Data Flow:**

1. Accepts `SimulationSnapshot[]` from SimulationEngine
2. Samples snapshots based on `graphDefinition.frequency`
3. Evaluates all expressions (line + stacked + bar) for each sampled snapshot
4. Builds `ChartDataPoint[]` with evaluated values
5. Renders using D3 with appropriate visualization types

**Internal Functions:**

- `sampleSnapshots()`: Filters snapshots to match frequency (daily/monthly/yearly)
- `evaluateExpressionsForSnapshot()`: Evaluates all expressions using snapshot context
- `buildChartData()`: Orchestrates sampling and evaluation to build chart data

**Block Component** (`src/components/Block.tsx`)

A streamlined collapsible card component for displaying and configuring financial blocks. Uses FloatingLabelInput, FloatingLabelTextarea, and FloatingLabelSelect components for all form inputs. Blocks no longer execute independently - execution is handled centrally by SimulationEngine in AppPage, and blocks receive simulation snapshots for rendering their custom graphs.

**State Management:**

- Maintains block state including: title, date range (startDate/endDate), inputs (Record<string, string>), init code, execution frequency (daily/monthly/yearly), execution code, exports (comma-separated variable names), and graphs (GraphDefinition[])
- Input values are tracked within the inputs object, allowing users to configure which inputs are required and set their actual values
- Supports identifier validation for variable names (only allows `[a-zA-Z_,]*` pattern)

**UI Modes:**

- **Normal Mode**: Shows expand/collapse icon, title, date range, Edit and Delete buttons
- **Edit Mode**:
  - Title becomes editable inline in the header
  - Comprehensive configuration form appears with all block parameters
  - Edit button becomes highlighted green "Done" button
  - Input fields remain enabled in edit mode

**Content Sections (when expanded):**

1. **Block Configuration** (edit mode only):
   - Single row with Start Date, End Date, Frequency, and Inputs (comma-separated) - dates use HTML5 date inputs
   - Initialization textarea for init calculations
   - Execution textarea for per-period calculations
   - Exported Variables input for comma-separated list of variables to export to global scope
2. **Inputs**: Dynamic grid of input fields based on comma-separated inputs configuration (shown in header row)
3. **Custom Graphs**: When not in edit mode and graphs are defined, renders each graph using the Chart component with simulation snapshots

**Props:**

- `state`: BlockState object containing all block configuration
- `onChange`: Callback invoked when block state changes
- `onDelete`: Optional callback when Delete button is clicked
- `snapshots`: Optional SimulationSnapshot[] array from SimulationEngine for rendering graphs

**Exports:**

- `Block` (default): The Block component
- `BlockState` (type): Type definition for block configuration state

**SimulationEngine Module** (`src/SimulationEngine.ts`)

The centralized execution engine that orchestrates the complete financial simulation. This module replaces the distributed per-block execution model with a unified approach that maintains global context and enables variable sharing across blocks.

**Key Functions:**

- `runGlobalSimulation(input: SimulationInput): SimulationSnapshot[]` - Main function that executes the complete simulation and returns snapshots of global context at each date

**Types:**

- `SimulationSnapshot` - Represents global context state at a specific date (includes date string and context object)
- `SimulationInput` - Configuration for simulation including globalInit code, blocks array, birth date, current age, and end age

**Execution Algorithm:**

1. **Global Init Phase**: Execute globalInit code once to populate global context with starting variables (e.g., k401, cash, investments)
2. **Time Iteration Phase**: Iterate every day from birth to endAge (typically 100):
   - For each block within its date range:
     - **On block start date (first time block is encountered)**: Execute block's init code once
       - Create init context combining global context, block inputs, and default inputs (total_periods, periods_from_start=0)
       - Execute block's init code
       - Export specified variables (and all existing global variables) to global context
       - Store block context for future executions
     - **On frequency-matching dates**: Execute block's execution code
       - Check if block should execute based on frequency (daily/monthly/yearly alignment)
       - Restore block-local context and combine with current global context
       - Update periods_from_start based on elapsed time since block start
       - Execute block's execution code
       - Export specified variables (and all existing global variables) to global context
       - Update stored block context
   - Store snapshot of complete global context for that date
3. **Return**: Array of SimulationSnapshot objects, one per day

**Important**: Block init code executes on the block's start date, not at simulation start. This ensures financial events (e.g., taking on debt for a home loan) occur when scheduled, not at birth.

**Context Management:**

- **Global context**: Single shared object persisting across entire simulation, modified by blocks through exports
- **Block-local context**: One per block, persists across that block's execution periods only
- **Exports**: Specified variables (comma-separated) copied from block-local to global context after each execution
- **Default inputs**: Auto-computed values (total_periods, periods_from_start) injected each execution

**MathLangUtils Utility** (`src/MathLangUtils.ts`)

A utility module providing secure math language evaluation with strict character restrictions to prevent code injection. Used by the SimulationEngine and Chart component for expression evaluation.

**Key Functions:**

- `runBlock(input: BlockRunnerInput): BlockRunnerResult[]` - Legacy function for per-block execution (deprecated in favor of SimulationEngine)
- `calculateTotalPeriods()` - Calculates number of execution periods based on date range and frequency
- `calculatePeriodDate()` - Computes the date for a specific period index
- `executeCode()` - Safely executes JavaScript code with security restrictions (internal)
- `evaluateExpression(expr: string, context: Record<string, number>): number` - **[EXPORTED]** Evaluates a single mathematical expression and returns numeric result, used by Chart component for expression evaluation

**Security:**

- All code execution is sandboxed using `Function()` constructor
- Dangerous characters are explicitly disallowed: `{ } [ ] ' " \` / : #`
- Periods must be followed by digits (decimal numbers only) to prevent property access
- Comment lines (starting with `#`) are filtered out before execution
- Expressions are wrapped in try-catch to handle errors gracefully

### Styling

The project uses a centralized design system defined in `src/variables.css` with:

- Solid green (`#4caf50`) as the primary color for UI elements
- Pastel green (`#c8e6c9`) as the brand color
- Orange (`#ff6f00`) as the accent color for CTAs and branding
- Complete color palette including neutrals, text colors, and backgrounds
- CSS custom properties for spacing, typography, shadows, and border radius
- All component styles are kept in separate `.css` files (never inline in TypeScript)

### Default Example Configuration

When users select "Start with examples" or load a plan that doesn't exist, the application provides a comprehensive default configuration demonstrating the new architecture (`src/pages/AppPage.tsx:73-146`):

**Global Initialization** establishes a diversified starting portfolio:

```
k401 = 100000
cash = 100000
investments = 200000
bonds = 100000
property = 0
debts = 0
```

**Main Graphs** visualize the complete financial picture:

1. **Net Worth**: Shows total net worth as a line and breaks down all assets/debts as stacked areas
   - Line: `k401 + cash + investments + bonds + property - debts`
   - Stacked: `k401, cash, investments, bonds, property, -debts`
   - Frequency: Monthly
2. **Mortgage (Interest vs principal)**: Tracks mortgage payment breakdown using exported block variables
   - Line: `interest_portion, principal_portion`
   - Frequency: Monthly

**Default Block** demonstrates a 30-year home loan (2025-2055):

- **Inputs**: `down_payment` (25000), `original_principal` (175000), `apr` (0.06)
- **Init**: Calculates loan parameters, adds to property and debts
- **Execution**: Computes monthly interest/principal portions, reduces debt
- **Exports**: `interest_portion`, `principal_portion` for use in graphs and other blocks
- **Block Graph**: Visualizes the interest vs principal portions over time

This example showcases:

- Direct manipulation of global variables (no hardcoded categories)
- Variable exports enabling cross-block communication
- Multiple visualization types (line + stacked areas)
- Realistic financial modeling with proper amortization math

### Dependencies

- **D3.js** (`d3`, `@types/d3`) - Used for all graph visualizations throughout the application

# Rules

- NEVER read package-lock.json, worker-configuration.d.ts
- Always use `npm install` to get new dependencies rather than directly adding them to the package.json
- Never create temporary files
- Never place CSS inside the typescript files, it must all be kept within .css files
- Never run dev or build commands, just instruct the user to check that your work succeeded by telling them what to look for
- Your task cannot be considered complete until you have reflected the work you did in ./CLAUDE.md. Your changes should be concise, highly targeted, and update any now-outdated information.
- Do not make up CSS variables, if you need to know what colors are available in the palette, you must read variables.css
- You have access to src/types.ts please use it when following TypeScript best practices
