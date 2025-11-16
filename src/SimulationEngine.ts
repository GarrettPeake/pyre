import { type BlockState } from "./components/Block";
import { executeCode } from "./MathLangUtils";

/**
 * Represents a snapshot of the global context at a specific date.
 */
export interface SimulationSnapshot {
  date: string; // ISO date string (YYYY-MM-DD)
  context: Record<string, number>; // Complete global context at this point in time
}

/**
 * Input configuration for running a complete financial simulation.
 */
export interface SimulationInput {
  globalInit: string; // Global initialization code run once at simulation start
  blocks: Array<{
    id: string;
    state: BlockState;
  }>;
  birthDate: Date; // Calculated from current age
  currentAge: number;
  endAge: number; // Default: 100
}

/**
 * Executes a complete financial simulation with global context and multiple blocks.
 *
 * Algorithm:
 * 1. Global Init Phase: Execute globalInit code once, populating global context
 * 2. Time Iteration Phase: Iterate every day from birth to endAge
 *    - Execute block init code on the block's start date
 *    - Execute block execution code based on frequency (daily/monthly/yearly)
 * 3. Return: Array of snapshots containing global context at each date
 *
 * @param input - Simulation configuration including global init, blocks, and age range
 * @returns Array of SimulationSnapshot objects, one per day
 */
export function runGlobalSimulation(
  input: SimulationInput
): SimulationSnapshot[] {
  console.log(input);

  // Step 1: Global Init Phase
  const globalContext: Record<string, number> = {};

  if (input.globalInit.trim()) {
    try {
      executeCode(input.globalInit, globalContext);
    } catch (error) {
      console.error("Error in global init:", error);
    }
  }

  // Step 2: Time Iteration Phase
  const snapshots: SimulationSnapshot[] = [];
  const blockContexts: Map<string, Record<string, number>> = new Map();

  // Calculate date range: from birth to endAge
  const startDate = new Date(input.birthDate);
  const endDate = new Date(input.birthDate);
  endDate.setFullYear(endDate.getFullYear() + input.endAge);

  // Iterate every day from birth to endAge
  for (
    let currentDate = new Date(startDate);
    currentDate <= endDate;
    currentDate.setDate(currentDate.getDate() + 1)
  ) {
    // For each block in order:
    for (const block of input.blocks) {
      const blockStartDate = new Date(block.state.startDate);
      const blockEndDate = new Date(block.state.endDate);

      // Skip if current date is before block start or after block end
      if (currentDate < blockStartDate || currentDate > blockEndDate) {
        continue;
      }

      // Execute block init code on the first day of the block (block start date)
      if (!blockContexts.get(block.id)) {
        // Create the initial inputs
        const totalPeriods = calculateTotalPeriods(
          blockStartDate,
          blockEndDate,
          block.state.frequency
        );
        // Initialize the context
        const initContext: Record<string, number> = {
          ...globalContext,
          periods_from_start: 0,
          total_periods: totalPeriods,
        };
        // Parse inputs from block.state.inputs (string values → numbers)
        for (const [key, value] of Object.entries(block.state.inputs)) {
          const numValue = parseFloat(value);
          initContext[key] = isNaN(numValue) ? 0 : numValue;
        }

        // Execute block init code
        if (block.state.init.trim()) {
          try {
            executeCode(block.state.init, initContext);
          } catch (error) {
            console.error(`Error in block init (${block.id}):`, error);
          }
        }

        // Extract exports and copy to global context
        const exportVars = block.state.exports
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .concat(Object.keys(globalContext));

        for (const varName of exportVars) {
          if (varName in initContext) {
            globalContext[varName] = initContext[varName];
          }
        }

        // Store the updated context and mark as initialized
        blockContexts.set(block.id, initContext);
      }

      // Check if block should execute on this date (based on frequency)
      if (!shouldBlockExecute(currentDate, block.state)) {
        continue;
      }

      // Calculate periods_from_start for this execution
      const periodsFromStart = calculatePeriodsFromStart(
        blockStartDate,
        currentDate,
        block.state.frequency
      );

      // Get persisted block-local context
      const blockContext = blockContexts.get(block.id)!;

      // Create combined context
      const execContext: Record<string, number> = {
        ...blockContext,
        ...globalContext,
        periods_from_start: periodsFromStart,
        total_periods: blockContext.total_periods || 0,
      };

      // Execute block execution code
      try {
        executeCode(block.state.execution, execContext);
      } catch (error) {
        console.error(
          `Error in block execution (${block.id}) at ${
            currentDate.toISOString().split("T")[0]
          }:`,
          error
        );
      }

      // Copy exports and global vars back to global context
      const exportVars = block.state.exports
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .concat(Object.keys(globalContext));

      for (const varName of exportVars) {
        if (varName in execContext) {
          globalContext[varName] = execContext[varName];
        } else {
          console.log(`Cannot find ${varName} to lift to global`);
        }
      }

      // We store the entire execution context since any globals and defaults will simply be overriden on the next iteration
      blockContexts.set(block.id, { ...execContext });
    }

    // Store snapshot of global context for this date
    snapshots.push({
      date: currentDate.toISOString().split("T")[0],
      context: { ...globalContext }, // Deep copy
    });
  }

  return snapshots;
}

/**
 * Checks if a block should execute on a given date based on its frequency and date range.
 */
function shouldBlockExecute(date: Date, blockState: BlockState): boolean {
  const startDate = new Date(blockState.startDate);
  const endDate = new Date(blockState.endDate);

  // Date must be in range
  if (date < startDate || date > endDate) {
    return false;
  }

  // Check frequency alignment
  if (blockState.frequency === "daily") {
    return true; // Execute every day
  } else if (blockState.frequency === "monthly") {
    // Execute on same day of month as start date
    return date.getDate() === startDate.getDate();
  } else {
    // yearly
    // Execute on same day and month as start date
    return (
      date.getDate() === startDate.getDate() &&
      date.getMonth() === startDate.getMonth()
    );
  }
}

/**
 * Calculates how many periods have elapsed since block start date.
 */
function calculatePeriodsFromStart(
  startDate: Date,
  currentDate: Date,
  frequency: "daily" | "monthly" | "yearly"
): number {
  if (frequency === "daily") {
    const diffTime = currentDate.getTime() - startDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } else if (frequency === "monthly") {
    const diffYears = currentDate.getFullYear() - startDate.getFullYear();
    const diffMonths = currentDate.getMonth() - startDate.getMonth();
    return diffYears * 12 + diffMonths;
  } else {
    // yearly
    return currentDate.getFullYear() - startDate.getFullYear();
  }
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
