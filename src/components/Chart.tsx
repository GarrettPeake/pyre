import { useEffect, useRef } from "react";
import * as d3 from "d3";
import "./Chart.css";

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
  title: string;
  data: ChartDataPoint[];
  verticals?: ChartVertical[];
  graphType: "bar" | "stacked" | "line";
  lineColors?: string[];
}

function Chart({
  title,
  data,
  verticals = [],
  graphType,
  lineColors = ["var(--color-accent-orange)"],
}: ChartProps) {
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

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
    if (title) {
      g.append("text")
        .attr("x", width / 2)
        .attr("y", -20)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .style("fill", "var(--color-text-primary)")
        .text(title);
    }

    // Extract all numeric keys from data (excluding 'date')
    const dataKeys = Object.keys(data[0]).filter((key) => key !== "date");

    // X scale (time-based)
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, width + 90]);

    // Y scale - calculate domain based on all data values
    let yMin = 0;
    let yMax = 0;

    data.forEach((d) => {
      dataKeys.forEach((key) => {
        const value = d[key] as number;
        yMin = Math.min(yMin, value);
        yMax = Math.max(yMax, value);
      });
    });

    const yPadding = Math.abs(yMax - yMin) * 0.1 || 1;
    const y = d3
      .scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([height, 0]);

    // Render based on graph type
    // eslint-disable-next-line no-constant-condition
    if (graphType === "line" || true) {
      // Render a line for each data key
      dataKeys.forEach((key, index) => {
        const line = d3
          .line<ChartDataPoint>()
          .x((d) => x(d.date))
          .y((d) => y(d[key] as number));

        g.append("path")
          .datum(data)
          .attr("fill", "none")
          .attr("stroke", lineColors[index % lineColors.length])
          .attr("stroke-width", 2)
          .attr("d", line);
      });
    }
    // TODO: Implement bar and stacked graph types

    // Add vertical indicator lines
    verticals.forEach((vertical) => {
      g.append("line")
        .attr("x1", x(new Date(vertical.position)))
        .attr("y1", 0)
        .attr("x2", x(new Date(vertical.position)))
        .attr("y2", height)
        .attr("stroke", vertical.color)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

      // Add label for vertical line
      g.append("text")
        .attr("x", x(new Date(vertical.position)))
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", vertical.color)
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
  }, [data, verticals, graphType, lineColors]);

  return (
    <div className="chart-container">
      {data.length > 0 ? (
        <svg ref={chartRef} className="chart-svg"></svg>
      ) : (
        <div className="chart-placeholder">No data to display</div>
      )}
    </div>
  );
}

export default Chart;
