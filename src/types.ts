// Shared type definitions for the application

export interface GraphDefinition {
  id: string;
  title: string;
  frequency: "daily" | "monthly" | "yearly";
  verticals: {
    date: Date;
    label: string;
  }[];
  expressions: {
    line?: string[]; // Array of expressions for line series (e.g., ["k401 + cash", "investments"])
    stacked?: string[]; // Array of expressions for stacked series (e.g., ["k401", "cash", "investments"])
    bar?: string[]; // Array of expressions for bar series
  };
}

// Re-export SimulationEngine types for convenience
export type { SimulationSnapshot, SimulationInput } from "./SimulationEngine";
