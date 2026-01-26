import { describe, it, expect } from "vitest";
import {
  runGlobalSimulation,
  type SimulationInput,
} from "../SimulationEngine";
import type { BlockState } from "../components/Block";

/**
 * Helper to create a minimal valid BlockState for testing
 */
function createBlockState(overrides: Partial<BlockState> = {}): BlockState {
  return {
    title: "Test Block",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    inputs: {},
    init: "",
    frequency: "daily",
    execution: "",
    exports: "",
    graphs: [],
    ...overrides,
  };
}

/**
 * Helper to create a SimulationInput for testing
 */
function createSimulationInput(
  overrides: Partial<SimulationInput> = {}
): SimulationInput {
  return {
    globalInit: "",
    blocks: [],
    birthDate: new Date("2000-01-01"),
    currentAge: 25,
    endAge: 100,
    ...overrides,
  };
}

describe("SimulationEngine", () => {
  describe("runGlobalSimulation", () => {
    describe("global initialization", () => {
      it("should return snapshots for each day from birth to endAge", () => {
        const input = createSimulationInput({
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Just 1 year for test performance
        });

        const snapshots = runGlobalSimulation(input);

        // 2000 is a leap year (366 days) + Jan 1 2001 = 367 snapshots
        expect(snapshots.length).toBe(367);
        expect(snapshots[0].date).toBe("2000-01-01");
        expect(snapshots[366].date).toBe("2001-01-01");
      });

      it("should execute global init code and populate context", () => {
        const input = createSimulationInput({
          globalInit: "cash = 10000\ninvestments = 50000",
          birthDate: new Date("2000-01-01"),
          endAge: 0, // Minimal run - just one day
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots[0].context.cash).toBe(10000);
        expect(snapshots[0].context.investments).toBe(50000);
      });

      it("should handle empty global init", () => {
        const input = createSimulationInput({
          globalInit: "",
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots.length).toBeGreaterThan(0);
        expect(Object.keys(snapshots[0].context).length).toBe(0);
      });

      it("should handle whitespace-only global init", () => {
        const input = createSimulationInput({
          globalInit: "   \n   \n   ",
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots.length).toBeGreaterThan(0);
      });
    });

    describe("block initialization", () => {
      it("should execute block init on the block start date", () => {
        const input = createSimulationInput({
          globalInit: "debts = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-15",
                endDate: "2000-01-31",
                init: "debts = debts + 100000",
                exports: "debts",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Need at least 1 year to cover the full range
        });

        const snapshots = runGlobalSimulation(input);

        // Before block start date, debts should be 0
        const jan14 = snapshots.find((s) => s.date === "2000-01-14");
        expect(jan14?.context.debts).toBe(0);

        // On block start date and after, debts should be 100000
        const jan15 = snapshots.find((s) => s.date === "2000-01-15");
        expect(jan15?.context.debts).toBe(100000);
      });

      it("should parse block inputs as numbers", () => {
        const input = createSimulationInput({
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                inputs: { principal: "50000", rate: "0.05" },
                init: "result = principal * rate",
                exports: "result",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots[0].context.result).toBe(2500);
      });

      it("should handle non-numeric input values as 0", () => {
        const input = createSimulationInput({
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                inputs: { invalid: "not-a-number" },
                init: "result = invalid + 10",
                exports: "result",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        // "not-a-number" should be parsed as 0
        expect(snapshots[0].context.result).toBe(10);
      });
    });

    describe("block execution frequency", () => {
      it("should execute daily blocks every day", () => {
        const input = createSimulationInput({
          globalInit: "counter = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                frequency: "daily",
                init: "",
                execution: "counter = counter + 1",
                exports: "counter",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Need at least 1 year to cover Jan 1-5
        });

        const snapshots = runGlobalSimulation(input);

        // 5 days of execution (Jan 1-5)
        const jan5 = snapshots.find((s) => s.date === "2000-01-05");
        expect(jan5?.context.counter).toBe(5);
      });

      it("should execute monthly blocks on the same day of each month", () => {
        const input = createSimulationInput({
          globalInit: "payments = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-15",
                endDate: "2000-05-16", // Include May 15 by extending end date
                frequency: "monthly",
                init: "",
                execution: "payments = payments + 1",
                exports: "payments",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1,
        });

        const snapshots = runGlobalSimulation(input);

        // Execution runs on: Jan 15, Feb 15, Mar 15, Apr 15, May 15 = 5 times
        const may15 = snapshots.find((s) => s.date === "2000-05-15");
        expect(may15?.context.payments).toBe(5);

        // Day before should have 4 payments (from Apr 15)
        const may14 = snapshots.find((s) => s.date === "2000-05-14");
        expect(may14?.context.payments).toBe(4);
      });

      it("should execute yearly blocks on the same date each year", () => {
        const input = createSimulationInput({
          globalInit: "years = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-06-01",
                endDate: "2001-06-02", // Include Jun 1 2001 by extending end date
                frequency: "yearly",
                init: "",
                execution: "years = years + 1",
                exports: "years",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 3,
        });

        const snapshots = runGlobalSimulation(input);

        // Should have 2 yearly executions (2000, 2001)
        const jun2001 = snapshots.find((s) => s.date === "2001-06-01");
        expect(jun2001?.context.years).toBe(2);
      });
    });

    describe("block date range", () => {
      it("should not execute blocks outside their date range", () => {
        const input = createSimulationInput({
          globalInit: "counter = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-03-01",
                endDate: "2000-03-31",
                frequency: "daily",
                execution: "counter = counter + 1",
                exports: "counter",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1,
        });

        const snapshots = runGlobalSimulation(input);

        // Before block starts, counter should be 0
        const feb28 = snapshots.find((s) => s.date === "2000-02-28");
        expect(feb28?.context.counter).toBe(0);

        // During block execution, counter increments
        const mar15 = snapshots.find((s) => s.date === "2000-03-15");
        expect(mar15?.context.counter).toBe(15);

        // After block ends, counter stops incrementing
        const apr1 = snapshots.find((s) => s.date === "2000-04-01");
        const mar31 = snapshots.find((s) => s.date === "2000-03-31");
        expect(apr1?.context.counter).toBe(mar31?.context.counter);
      });
    });

    describe("variable exports", () => {
      it("should export specified variables to global context", () => {
        const input = createSimulationInput({
          globalInit: "",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                init: "local_var = 100",
                execution: "local_var = local_var + 10",
                exports: "local_var",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Need at least 1 year to reach Jan 5
        });

        const snapshots = runGlobalSimulation(input);

        // local_var should be exported and visible in snapshots
        // Init sets local_var=100, then 5 days of execution each add 10 = 100 + 50 = 150
        const jan5 = snapshots.find((s) => s.date === "2000-01-05");
        expect(jan5?.context.local_var).toBe(150);
      });

      it("should handle multiple exports comma-separated", () => {
        const input = createSimulationInput({
          globalInit: "",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-01",
                init: "var_a = 10\nvar_b = 20\nvar_c = 30",
                exports: "var_a, var_b",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots[0].context.var_a).toBe(10);
        expect(snapshots[0].context.var_b).toBe(20);
        // var_c not exported, should not be in global context
        expect(snapshots[0].context.var_c).toBeUndefined();
      });

      it("should preserve existing global variables through exports", () => {
        const input = createSimulationInput({
          globalInit: "existing = 500",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-01",
                init: "new_var = 100",
                exports: "new_var",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots[0].context.existing).toBe(500);
        expect(snapshots[0].context.new_var).toBe(100);
      });
    });

    describe("default inputs", () => {
      it("should provide total_periods to block init", () => {
        const input = createSimulationInput({
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-31",
                frequency: "daily",
                init: "captured_total = total_periods",
                exports: "captured_total",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        // 31 days from Jan 1 to Jan 31
        expect(snapshots[0].context.captured_total).toBe(30); // ceil of diff
      });

      it("should provide periods_from_start starting at 0 then incrementing", () => {
        const input = createSimulationInput({
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                frequency: "daily",
                init: "first_period = periods_from_start",
                execution: "last_period = periods_from_start",
                exports: "first_period,last_period",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Need at least 1 year to reach Jan 5
        });

        const snapshots = runGlobalSimulation(input);

        // Init runs with periods_from_start = 0
        expect(snapshots[0].context.first_period).toBe(0);

        // After 5 days, periods_from_start should be 5
        const jan5 = snapshots.find((s) => s.date === "2000-01-05");
        expect(jan5?.context.last_period).toBe(5);
      });
    });

    describe("multiple blocks", () => {
      it("should execute blocks in order", () => {
        const input = createSimulationInput({
          globalInit: "value = 0",
          blocks: [
            {
              id: "block1",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-01",
                init: "value = value + 10",
                exports: "value",
              }),
            },
            {
              id: "block2",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-01",
                init: "value = value * 2",
                exports: "value",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        // block1 adds 10, then block2 multiplies by 2
        expect(snapshots[0].context.value).toBe(20);
      });

      it("should allow blocks to share data via exports", () => {
        const input = createSimulationInput({
          globalInit: "",
          blocks: [
            {
              id: "producer",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-10",
                frequency: "daily",
                init: "interest = 0",
                execution: "interest = interest + 100",
                exports: "interest",
              }),
            },
            {
              id: "consumer",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-10",
                frequency: "daily",
                init: "total_interest = 0",
                execution: "total_interest = total_interest + interest",
                exports: "total_interest",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1, // Need at least 1 year to reach Jan 10
        });

        const snapshots = runGlobalSimulation(input);

        // Producer increments interest daily
        // Consumer accumulates total_interest
        const jan10 = snapshots.find((s) => s.date === "2000-01-10");
        expect(jan10?.context.interest).toBe(1000); // 100 * 10 days
        // Sum of 100+200+300+...+1000 = 5500
        expect(jan10?.context.total_interest).toBe(5500);
      });
    });

    describe("complex financial scenario", () => {
      it("should correctly accumulate savings over time", () => {
        // Simple savings scenario: deposit $1000/month for 5 months
        const input = createSimulationInput({
          globalInit: "savings = 0",
          blocks: [
            {
              id: "savings",
              state: createBlockState({
                title: "Monthly Savings",
                startDate: "2000-01-15",
                endDate: "2000-05-16", // Include May 15 by extending end date
                frequency: "monthly",
                inputs: { monthly_deposit: "1000" },
                init: "",
                execution: "savings = savings + monthly_deposit",
                exports: "savings",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1,
        });

        const snapshots = runGlobalSimulation(input);

        // After 5 months (Jan-May), should have 5000 in savings
        const may15 = snapshots.find((s) => s.date === "2000-05-15");
        expect(may15?.context.savings).toBe(5000);
      });

      it("should correctly model compound growth", () => {
        // Investments grow by 1% monthly
        const input = createSimulationInput({
          globalInit: "investments = 10000",
          blocks: [
            {
              id: "growth",
              state: createBlockState({
                title: "Investment Growth",
                startDate: "2000-01-15",
                endDate: "2000-03-15",
                frequency: "monthly",
                inputs: { growth_rate: "0.01" },
                init: "",
                execution: "investments = investments * (1 + growth_rate)",
                exports: "investments",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 1,
        });

        const snapshots = runGlobalSimulation(input);

        // After 3 months: 10000 * 1.01^3 = 10303.01
        const mar15 = snapshots.find((s) => s.date === "2000-03-15");
        expect(mar15?.context.investments).toBeCloseTo(10303.01, 1);
      });
    });

    describe("error handling", () => {
      it("should continue simulation despite errors in global init", () => {
        const input = createSimulationInput({
          globalInit: "invalid syntax here !!!",
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        // Should not throw, should return snapshots
        const snapshots = runGlobalSimulation(input);
        expect(snapshots.length).toBeGreaterThan(0);
      });

      it("should continue simulation despite errors in block init", () => {
        const input = createSimulationInput({
          globalInit: "value = 100",
          blocks: [
            {
              id: "bad_block",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                init: "this is not valid code !!!",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        // Simulation should continue, global vars preserved
        expect(snapshots[0].context.value).toBe(100);
      });

      it("should continue simulation despite errors in block execution", () => {
        const input = createSimulationInput({
          globalInit: "counter = 0",
          blocks: [
            {
              id: "bad_exec",
              state: createBlockState({
                startDate: "2000-01-01",
                endDate: "2000-01-05",
                execution: "invalid execution code !!!",
              }),
            },
          ],
          birthDate: new Date("2000-01-01"),
          endAge: 0,
        });

        const snapshots = runGlobalSimulation(input);

        expect(snapshots.length).toBeGreaterThan(0);
      });
    });
  });
});
