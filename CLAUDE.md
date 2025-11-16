# About the project

This project is a financial planning calculator that takes a very configurable approach to financial planning.

It represents everything using a simple math language to enable building complex financial plans from the ground up.

To start, the user defines their current age and target retirement age, then they define an initialization block to set parameters at their current age. And finally they can define the graphs that they want to be shown for the simulation

```
-- Ages
30, 62

-- Init
401k = 100000
cash = 100000
investments = 200000
bonds = 100000
property = 0
debts = 0

-- Graphs (these graphs have vertical lines for the current and retirement ages)
Net Worth:
    frequency: daily
    line: 401k + cash + investments + bonds + property - debts
    stacked: 401k,cash,investments,bonds,property,-debts
Mortgage (Interest vs Principle contributions):
    frequency: daily
    line: interest_portion, principle_portion
```

The variables in the top level initialization are 'global' and are then accessible to every 'block'

A block defines a financial function that affects our global variables. For instance we can declare a large purchase on a loan using:

```
-- Purchase using a loan

-- Frequency
Monthly

-- Inputs
down_payment, original_principle, apr

-- Init
asset_price = down_payment + original_principle
current_principle = original_principle
payments = total_periods
monthly_interest = apr / 12
payment = original_principle * (monthly_interest * (1 + monthly_interest)^(payments))/((1+monthly_interest)^(payments)-1)
debts = debts + original_principle
property = property + asset_price
expenses = expenses + down_payment

-- Execution
interest_portion = current_principle * monthly_interest
principle_portion = payment - interest_Portion
current_principle = current_principle - principle_portion
# Comments use a hashtag
liabilities = liabilities - principle_portion
expenses = expenses + payment

-- Export (variables to be added to the global scope to be used by the following blocks)
interest_portion, principle_portion

-- Graph (used to let the user debug their formulas, uses the same frequency as the block itself)
Portions:
    line: interest_portion, principle_portion
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

   - Main application interface with sticky header containing PYRE logo, plan ID with save status indicator, and GitHub/Ko-Fi links
   - Receives plan ID from URL params
   - Overview card containing:
     - Age inputs row with FloatingLabelInput components: Current Age and Target Retirement Age (default 25 and 65)
     - Main charts defined by the user with vertical lines indicting the current and target retirement ages
   - Financial Blocks section with collapsible block cards (see Block component below)
   - Informationally dense layout with compact spacing (1000px max width)

   **Backend Integration:**

   - On page load, fetches plan data from backend using the planId via `/api/get_plan/<planId>`
   - If no saved plan exists, uses default example block configuration
   - Saves plan data when user clicks "Save" button in Block edit mode
   - Save process: Block calls `onSave` callback → AppPage updates block state → saves to backend via `/api/save_plan/<planId>`
   - Save status indicator (checkmark icon) next to planId in header:
     - Green when data is saved
     - Grey when unsaved changes exist (block execution results change)
   - Only saves block configurations (initialState), not computed execution results

   **Data Aggregation:**

   - Maintains array of BlockData objects containing block configuration and execution results
   - Each block reports its execution results via `onExecutionResultsChange` callback
   - Aggregates data across all blocks over 100-year span (ages 0-100):
     - First creates a lookup map of all block execution results keyed by date
     - Iterates through every single date (365 days per year) from birth to age 100
     - For each date: inherits assets and liabilities from the previous day, starts with income and expenses at 0
     - Checks if any blocks have execution results for that date and adds them if present
     - Assets and liabilities accumulate day-by-day as running totals (quantities)
     - Income and expenses apply only to their specific dates (rates)
   - Charts automatically update when any block's execution results change

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

A reusable textarea component with animated floating label behavior, sharing the same CSS as FloatingLabelInput.

**Props:**

- `label`: Label text to display
- `value`: Textarea value
- `onChange`: Change handler
- `className`: Optional CSS class for the textarea element
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

**Chart Component** (`src/Chart.tsx`)

A reusable, D3-powered chart component for rendering financial data visualizations. Used throughout the application for displaying quantities and rates charts in both the main AppPage and individual Block components.

**Props:**

- `title`: Chart title (displayed above the chart)
- `data`: Array of ChartDataPoint objects with `date: Date` and any number of numeric data series
- `verticals`: Optional array of vertical indicator lines with position (timestamp), label, and color
- `graphType`: Chart type - currently supports "line" (bar and stacked to be implemented)
- `lineColors`: Optional array of colors for multiple data series (defaults to orange accent color)

**Features:**

- Automatically scales axes based on data domain with padding
- Supports multiple data series in a single chart
- Renders vertical indicator lines with labels (e.g., current age, retirement age)
- Displays placeholder when no data is available
- Fully responsive with consistent styling across the application

**Block Component** (`src/Block.tsx`)

A fully-featured collapsible card component for displaying and configuring financial blocks. Uses FloatingLabelInput, FloatingLabelTextarea, and FloatingLabelSelect components for all form inputs. The component automatically executes block calculations using the BlockRunner utility and displays results using the Chart component.

**State Management:**

- Maintains comprehensive block state including: title, date range (startDate/endDate), inputs, init calculations, init quantities/rates (assets, liabilities, income, expenses), execution frequency (daily/monthly/yearly), execution calculations, execution quantities/rates, graph variables, and graph type (bar/stacked/line)
- Input values are tracked separately from input definitions, allowing users to configure which inputs are required vs setting their actual values
- Stores execution results from BlockRunner and re-executes whenever inputs or configuration changes
- Supports identifier validation for variable names (only allows `[a-zA-Z_]*` pattern)

**Execution:**

- Uses `useEffect` to automatically run block execution via BlockRunner whenever dates, frequency, calculations, or input values change
- Converts string input values to numbers before passing to BlockRunner
- Handles errors gracefully and displays empty state when dates are not set

**UI Modes:**

- **Normal Mode**: Shows expand/collapse icon, title, date range, Edit and Delete buttons
- **Edit Mode**:
  - Title becomes editable inline in the header
  - Comprehensive configuration form appears with all block parameters
  - Edit button becomes highlighted green "Done" button
  - Input fields are disabled (edit mode is for configuration only)

**Content Sections (when expanded):**

1. **Block Configuration** (edit mode only):
   - Single row with Start Date, End Date, Frequency, and Inputs (comma-separated) - dates use HTML5 date inputs
   - Initialization textarea for init calculations
   - Execution textarea for per-period calculations
   - Bottom row with Graph Variables (comma-separated) and Graph Type selector
2. **Inputs**: Dynamic grid of input fields based on comma-separated inputs configuration (disabled in edit mode)
3. **Quantities Chart**: Rendered using Chart component, showing Assets - Liabilities over time
4. **Rates Chart**: Rendered using Chart component, showing Income - Expenses over time
5. **Custom Variables Graph**: Rendered using Chart component when graph variables are defined, displays all specified graph variables as separate series with different colors, supports line/bar/stacked types (currently line only)

**Props:**

- `initialState`: Optional partial BlockState for pre-populating block configuration
- `onDelete`: Optional callback when Delete button is clicked
- `onExecutionResultsChange`: Optional callback invoked with BlockRunnerResult[] whenever execution results change
- `onSave`: Optional callback invoked with updated BlockState when Save button is clicked (exiting edit mode)

**Exports:**

- `Block` (default): The Block component
- `BlockRunnerResult` (type): Type definition for execution results, exported for use by AppPage

**BlockRunner Utility** (`src/BlockRunner.ts`)

A utility module that executes financial block calculations and returns computed values for each time period.

**Key Functions:**

- `runBlock(input: BlockRunnerInput): BlockRunnerResult[]` - Main execution function that processes a block configuration and returns results for each period
- `calculateTotalPeriods()` - Calculates number of execution periods based on date range and frequency
- `calculatePeriodDate()` - Computes the date for a specific period index
- `executeCode()` - Safely executes JavaScript code with security restrictions (disallows `.{}[]'"` characters)
- `evaluateExpression()` - Evaluates a single mathematical expression and returns numeric result

**Execution Flow:**

1. Parses start/end dates and calculates total periods based on frequency (daily/monthly/yearly)
2. Creates execution context with user-provided inputs and default inputs (total_months, months_since_start, etc.)
3. Runs initialization calculations once to set up variables
4. Initializes quantities (assets, liabilities) and rates (income, expenses) from init expressions
5. For each period:
   - Updates period-specific context variables (months_since_start, years_since_start, etc.)
   - Executes per-period calculations
   - Evaluates execution addends for assets, liabilities, income, expenses
   - Accumulates values and stores result with date
6. Returns array of results containing date, assets, liabilities, income, expenses, and any graph variables

**Security:**

- All code execution is sandboxed using `Function()` constructor
- Dangerous characters are explicitly disallowed to prevent object/array access and code injection
- Expressions are wrapped in try-catch to handle errors gracefully

### Styling

The project uses a centralized design system defined in `src/variables.css` with:

- Solid green (`#4caf50`) as the primary color for UI elements
- Pastel green (`#c8e6c9`) as the brand color
- Orange (`#ff6f00`) as the accent color for CTAs and branding
- Complete color palette including neutrals, text colors, and backgrounds
- CSS custom properties for spacing, typography, shadows, and border radius
- All component styles are kept in separate `.css` files (never inline in TypeScript)

### Dependencies

- **D3.js** (`d3`, `@types/d3`) - Used for all graph visualizations throughout the application

# Rules

- NEVER read package-lock.json, worker-configuration.d.ts
- Always use `npm install` to get new dependencies rather than directly adding them to the package.json
- Never create temporary files
- Never place CSS inside the typescript files, it must all be kept within .css files
- Never run `npm run dev` or the like, just instruct the user that the changes are ready
- Your task cannot be considered complete until you have reflected the work you did in ./CLAUDE.md. Your changes should be concise, highly targeted, and update any now-outdated information.
- Do not make up CSS variables, if you need to know what colors are available in the palette, you must read variables.css
