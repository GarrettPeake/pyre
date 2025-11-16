export interface BlockRunnerInput {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  frequency: "daily" | "monthly" | "yearly";
  inputs: Record<string, number>; // User-provided input values
  initCalculations: string; // JavaScript code to run once
  initQuantities: {
    assets: string;
    liabilities: string;
    income: string;
    expenses: string;
  };
  executionCalculations: string; // JavaScript code to run each period
  executionQuantities: {
    assets: string;
    liabilities: string;
    income: string;
    expenses: string;
  };
  graphVars: string[]; // Variables to include in results
}

export interface BlockRunnerResult {
  date: string; // ISO date string
  assets: number;
  liabilities: number;
  income: number;
  expenses: number;
  [key: string]: number | string; // For graph variables
}

/**
 * Executes a financial block and returns computed values for each time period.
 *
 * @param input - Block configuration including dates, frequency, calculations, etc.
 * @returns Array of results, one per execution period (day/month/year)
 */
export function runBlock(input: BlockRunnerInput): BlockRunnerResult[] {
  // Parse dates
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);

  // Calculate total periods
  const totalPeriods = calculateTotalPeriods(
    startDate,
    endDate,
    input.frequency
  );

  // Create execution context with inputs
  const context: Record<string, number> = { ...input.inputs };

  // Add default inputs
  context.total_periods = totalPeriods;
  context.periods_from_start = 0;

  // Run initialization calculations
  executeCode(input.initCalculations, context);

  // Initialize quantities from init values
  const initialAssetEffect = evaluateExpression(
    input.initQuantities.assets,
    context
  );
  const initialLiabilityEffect = evaluateExpression(
    input.initQuantities.liabilities,
    context
  );

  // Initialize starting rates from init values and set the 0th result
  const initialIncome = evaluateExpression(
    input.initQuantities.income,
    context
  );
  const initialExpense = evaluateExpression(
    input.initQuantities.expenses,
    context
  );
  const results: BlockRunnerResult[] = [
    {
      date: calculatePeriodDate(startDate, 0, input.frequency)
        .toISOString()
        .split("T")[0],
      assets: initialAssetEffect,
      liabilities: initialLiabilityEffect,
      income: initialIncome,
      expenses: initialExpense,
    },
  ];

  // Execute for each period
  for (let period = 1; period <= totalPeriods; period++) {
    // Calculate current date
    const currentDate = calculatePeriodDate(startDate, period, input.frequency);

    // Update period-specific context variables
    context.periods_from_start = period;

    // Run execution calculations
    try {
      executeCode(input.executionCalculations, context);
    } catch (error) {
      console.error(
        `Error in execution calculations at period ${period}:`,
        error
      );
    }

    // Update quantities and rates with execution addends
    const assetEffect = evaluateExpression(
      input.executionQuantities.assets,
      context
    );
    const liabilitiesEffect = evaluateExpression(
      input.executionQuantities.liabilities,
      context
    );
    const income = evaluateExpression(
      input.executionQuantities.income,
      context
    );
    const expense = evaluateExpression(
      input.executionQuantities.expenses,
      context
    );

    // Build result object
    const result: BlockRunnerResult = {
      date: currentDate.toISOString().split("T")[0],
      assets: assetEffect,
      liabilities: liabilitiesEffect,
      income: income,
      expenses: expense,
    };

    // Add graph variables
    for (const varName of input.graphVars) {
      if (varName in context) {
        result[varName] = context[varName];
      }
    }

    results.push(result);
  }

  console.log(results);
  return results;
}

/**
 * Calculates the total number of periods between two dates based on frequency.
 */
function calculateTotalPeriods(
  start: Date,
  end: Date,
  frequency: "daily" | "monthly" | "yearly"
): number {
  if (frequency === "daily") {
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } else if (frequency === "monthly") {
    const diffYears = end.getFullYear() - start.getFullYear();
    const diffMonths = end.getMonth() - start.getMonth();
    return diffYears * 12 + diffMonths + 1;
  } else {
    // yearly
    return end.getFullYear() - start.getFullYear() + 1;
  }
}

/**
 * Calculates the date for a specific period based on start date and frequency.
 */
function calculatePeriodDate(
  start: Date,
  period: number,
  frequency: "daily" | "monthly" | "yearly"
): Date {
  const date = new Date(start);

  if (frequency === "daily") {
    date.setDate(date.getDate() + period);
  } else if (frequency === "monthly") {
    date.setMonth(date.getMonth() + period);
  } else {
    // yearly
    date.setFullYear(date.getFullYear() + period);
  }

  return date;
}

/**
 * Executes JavaScript code in a restricted context.
 * Every statement must be an assignment and is used to update the context
 * Prevents use of dangerous characters: . { } [ ] ' "
 */
function executeCode(code: string, context: Record<string, number>): void {
  if (!code.trim()) return;

  // Security check - disallow dangerous characters
  if (/[.{}[\]`'"]/.test(code)) {
    throw new Error("Code contains disallowed characters: . { } [ ] ' \" `");
  }

  // Split into statements (by newlines
  const statements = code
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Execute each statement
  for (const statement of statements) {
    try {
      // Build function that executes statement and updates context
      const contextKeys = Object.keys(context);
      const contextValues = contextKeys.map((key) => context[key]);

      const [updatedVarName, updatedVarStatement] = statement
        .split("=")
        .map((s) => s.trim());

      const func = new Function(
        ...contextKeys,
        `return ${updatedVarStatement}`
      );
      context[updatedVarName] = func(...contextValues);
    } catch (error) {
      console.error(`Error executing statement: ${statement}`, error);
    }
  }
}

/**
 * Evaluates a single expression and returns its numeric value.
 */
function evaluateExpression(
  expr: string,
  context: Record<string, number>
): number {
  // If the expression is empty return 0
  if (!expr?.trim()) return 0;

  // If the expression is just a float return it
  if (!Number.isNaN(parseFloat(expr))) return parseFloat(expr);

  // Security check - disallow dangerous characters
  if (/[.{}[\]'"]/.test(expr)) {
    console.error("Expression contains disallowed characters:", expr);
    return 0;
  }

  try {
    const contextKeys = Object.keys(context);
    const contextValues = contextKeys.map((key) => context[key]);
    const func = new Function(...contextKeys, `return (${expr}) || 0`);
    const result = func(...contextValues);
    return typeof result === "number" ? result : 0;
  } catch (error) {
    console.error(`Error evaluating expression: ${expr}`, error);
    return 0;
  }
}
