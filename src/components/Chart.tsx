import { useEffect, useRef, memo } from "react";
import * as d3 from "d3";
import "./Chart.css";
import type { GraphDefinition, SimulationSnapshot } from "../types";
import { evaluateExpression } from "../MathLangUtils";

export interface ChartVertical {
  position: number;
  label: string;
  color: string;
}

export interface ChartDataPoint {
  date: Date;
  [key: string]: number | Date;
}

export interface ChartProps {
  graphDefinition: GraphDefinition;
  snapshots: SimulationSnapshot[];
}

// Color palette for data series
const COLOR_PALETTE = [
  "var(--color-accent-orange)",
  "var(--color-primary)",
  "var(--color-accent-orange-light)",
  "var(--color-primary-green-dark)",
  "var(--color-accent-orange-dark)",
  "var(--color-primary-green)",
];

/**
 * Samples snapshots based on frequency to match block execution patterns.
 */
function sampleSnapshots(
  snapshots: SimulationSnapshot[],
  frequency: "daily" | "monthly" | "yearly"
): SimulationSnapshot[] {
  if (snapshots.length === 0) return [];

  if (frequency === "daily") {
    return snapshots; // No sampling needed
  }

  const firstDate = new Date(snapshots[0].date);

  return snapshots.filter(snapshot => {
    const date = new Date(snapshot.date);

    if (frequency === "monthly") {
      // Include snapshots on same day-of-month as first snapshot
      return date.getDate() === firstDate.getDate();
    } else { // yearly
      // Include snapshots on same day-and-month as first snapshot
      return date.getDate() === firstDate.getDate() &&
             date.getMonth() === firstDate.getMonth();
    }
  });
}

/**
 * Evaluates all expressions for a single snapshot.
 */
function evaluateExpressionsForSnapshot(
  snapshot: SimulationSnapshot,
  expressions: string[]
): Record<string, number> {
  const results: Record<string, number> = {};

  for (const expr of expressions) {
    try {
      results[expr] = evaluateExpression(expr, snapshot.context);
    } catch (error) {
      console.error(`Error evaluating expression "${expr}":`, error);
      results[expr] = 0;
    }
  }

  return results;
}

/**
 * Builds chart data by sampling snapshots and evaluating all expressions.
 */
function buildChartData(
  graphDefinition: GraphDefinition,
  snapshots: SimulationSnapshot[]
): { data: ChartDataPoint[], allExpressions: string[] } {
  // Sample snapshots based on frequency
  const sampledSnapshots = sampleSnapshots(snapshots, graphDefinition.frequency);

  // Collect all expressions from all types
  const allExpressions: string[] = [
    ...(graphDefinition.expressions.line || []),
    ...(graphDefinition.expressions.stacked || []),
    ...(graphDefinition.expressions.bar || []),
  ];

  // Build data points
  const data: ChartDataPoint[] = sampledSnapshots.map(snapshot => {
    const point: ChartDataPoint = {
      date: new Date(snapshot.date),
    };

    // Evaluate all expressions and add to data point
    const values = evaluateExpressionsForSnapshot(snapshot, allExpressions);
    Object.assign(point, values);

    return point;
  });

  return { data, allExpressions };
}

const Chart = memo(function Chart({ graphDefinition, snapshots }: ChartProps) {
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!chartRef.current || snapshots.length === 0) return;

    // Build chart data from snapshots
    const { data, allExpressions } = buildChartData(graphDefinition, snapshots);

    if (data.length === 0) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 20, bottom: 0, left: 70 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left * 1.2},${margin.top})`);

    // Add title
    if (graphDefinition.title) {
      g.append("text")
        .attr("x", width / 2)
        .attr("y", -20)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .style("fill", "var(--color-text-primary)")
        .text(graphDefinition.title);
    }

    // X scale (time-based)
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, width + 90]);

    // Y scale - calculate domain based on all data values
    let yMin = 0;
    let yMax = 0;

    // For line and bar expressions, use individual values
    const lineExprs = graphDefinition.expressions.line || [];
    const barExprs = graphDefinition.expressions.bar || [];

    data.forEach((d) => {
      [...lineExprs, ...barExprs].forEach((expr) => {
        const value = d[expr] as number;
        yMin = Math.min(yMin, value);
        yMax = Math.max(yMax, value);
      });
    });

    // For stacked expressions, calculate cumulative positive and negative stacks
    const stackedExprs = graphDefinition.expressions.stacked || [];
    if (stackedExprs.length > 0) {
      data.forEach((d) => {
        let positiveStack = 0;
        let negativeStack = 0;

        stackedExprs.forEach((expr) => {
          const value = d[expr] as number;
          if (value >= 0) {
            positiveStack += value;
          } else {
            negativeStack += value;
          }
        });

        yMax = Math.max(yMax, positiveStack);
        yMin = Math.min(yMin, negativeStack);
      });
    }

    const yPadding = Math.abs(yMax - yMin) * 0.1 || 1;
    const y = d3
      .scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([height, 0]);

    // Render based on expression types

    // 1. Render bar series (bottom layer)
    if (graphDefinition.expressions.bar && graphDefinition.expressions.bar.length > 0) {
      const barExpressions = graphDefinition.expressions.bar;
      const barWidth = (width + 90) / data.length;
      const barGroupWidth = barWidth * 0.8;
      const individualBarWidth = barGroupWidth / barExpressions.length;

      barExpressions.forEach((expr, index) => {
        const color = COLOR_PALETTE[index % COLOR_PALETTE.length];

        g.selectAll(`.bar-${index}`)
          .data(data)
          .enter()
          .append("rect")
          .attr("class", `bar-${index}`)
          .attr("x", (d) => x(d.date) + index * individualBarWidth - barGroupWidth / 2)
          .attr("y", (d) => {
            const value = d[expr] as number;
            return value >= 0 ? y(value) : y(0);
          })
          .attr("width", individualBarWidth - 1)
          .attr("height", (d) => {
            const value = d[expr] as number;
            return Math.abs(y(value) - y(0));
          })
          .attr("fill", color)
          .attr("opacity", 0.7);
      });
    }

    // 2. Render stacked series (middle layer)
    if (graphDefinition.expressions.stacked && graphDefinition.expressions.stacked.length > 0) {
      const stackedExpressions = graphDefinition.expressions.stacked;

      // Prepare data for diverging stacked chart (separate positive and negative values)
      const stackData = data.map(d => {
        const obj: any = { date: d.date };
        stackedExpressions.forEach(expr => {
          const value = d[expr] as number;
          obj[expr] = value;
        });
        return obj;
      });

      // Separate expressions into positive and negative groups for each data point
      // We'll manually calculate the stacking offsets
      interface StackPoint {
        date: Date;
        expr: string;
        y0: number;
        y1: number;
      }

      const stackPoints: StackPoint[] = [];

      // Process each data point
      stackData.forEach(dataPoint => {
        let positiveOffset = 0;
        let negativeOffset = 0;

        // Process each expression
        stackedExpressions.forEach(expr => {
          const value = dataPoint[expr] as number;

          if (value >= 0) {
            // Stack positive values upward from zero
            stackPoints.push({
              date: dataPoint.date,
              expr: expr,
              y0: positiveOffset,
              y1: positiveOffset + value
            });
            positiveOffset += value;
          } else {
            // Stack negative values downward from zero
            stackPoints.push({
              date: dataPoint.date,
              expr: expr,
              y0: negativeOffset,
              y1: negativeOffset + value
            });
            negativeOffset += value;
          }
        });
      });

      // Group stack points by expression for rendering
      const pointsByExpression = new Map<string, StackPoint[]>();
      stackPoints.forEach(point => {
        if (!pointsByExpression.has(point.expr)) {
          pointsByExpression.set(point.expr, []);
        }
        pointsByExpression.get(point.expr)!.push(point);
      });

      // Create area generator
      const area = d3.area<StackPoint>()
        .x((d) => x(d.date))
        .y0((d) => y(d.y0))
        .y1((d) => y(d.y1));

      // Render each expression's series
      stackedExpressions.forEach((expr, index) => {
        const points = pointsByExpression.get(expr);
        if (!points || points.length === 0) return;

        const color = COLOR_PALETTE[(graphDefinition.expressions.bar?.length || 0) + index % COLOR_PALETTE.length];

        g.append("path")
          .datum(points)
          .attr("fill", color)
          .attr("opacity", 0.6)
          .attr("d", area);
      });
    }

    // 3. Render line series (top layer)
    if (graphDefinition.expressions.line && graphDefinition.expressions.line.length > 0) {
      const lineExpressions = graphDefinition.expressions.line;
      const barCount = graphDefinition.expressions.bar?.length || 0;
      const stackedCount = graphDefinition.expressions.stacked?.length || 0;

      lineExpressions.forEach((expr, index) => {
        const colorIndex = (barCount + stackedCount + index) % COLOR_PALETTE.length;
        const color = COLOR_PALETTE[colorIndex];

        const line = d3
          .line<ChartDataPoint>()
          .x((d) => x(d.date))
          .y((d) => y(d[expr] as number));

        g.append("path")
          .datum(data)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2)
          .attr("d", line);
      });
    }

    // Add vertical indicator lines
    graphDefinition.verticals.forEach((vertical) => {
      g.append("line")
        .attr("x1", x(vertical.date))
        .attr("y1", 0)
        .attr("x2", x(vertical.date))
        .attr("y2", height)
        .attr("stroke", "var(--color-gray-500)")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

      // Add label for vertical line
      g.append("text")
        .attr("x", x(vertical.date))
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", "var(--color-gray-600)")
        .text(vertical.label);
    });

    // Add x-axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .style("color", "var(--color-text-secondary)");

    // Add y-axis
    g.append("g")
      .call(d3.axisLeft(y))
      .style("color", "var(--color-text-secondary)");
  }, [graphDefinition, snapshots]);

  return (
    <div className="chart-container">
      {snapshots.length > 0 ? (
        <svg ref={chartRef} className="chart-svg"></svg>
      ) : (
        <div className="chart-placeholder">No data to display</div>
      )}
    </div>
  );
});

export default Chart;
