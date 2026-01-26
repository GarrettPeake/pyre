import { describe, it, expect } from "vitest";
import { evaluateExpression, executeCode } from "../MathLangUtils";

describe("MathLangUtils", () => {
  describe("evaluateExpression", () => {
    describe("basic math operations", () => {
      it("should evaluate simple addition", () => {
        const result = evaluateExpression("a + b", { a: 5, b: 3 });
        expect(result).toBe(8);
      });

      it("should evaluate multiplication", () => {
        const result = evaluateExpression("a * b", { a: 4, b: 7 });
        expect(result).toBe(28);
      });

      it("should evaluate complex expressions", () => {
        const result = evaluateExpression("a + b * c - d", {
          a: 10,
          b: 2,
          c: 5,
          d: 3,
        });
        expect(result).toBe(17); // 10 + (2*5) - 3 = 17
      });

      it("should handle decimal numbers", () => {
        const result = evaluateExpression("a * 0.5", { a: 10 });
        expect(result).toBe(5);
      });

      it("should return 0 for empty expressions", () => {
        expect(evaluateExpression("", {})).toBe(0);
        expect(evaluateExpression("   ", {})).toBe(0);
      });

      it("should parse standalone numbers", () => {
        expect(evaluateExpression("42", {})).toBe(42);
        expect(evaluateExpression("3.14", {})).toBe(3.14);
      });
    });

    describe("blocked keyword security", () => {
      it("should block document keyword", () => {
        const result = evaluateExpression("document", {});
        expect(result).toBe(0);
      });

      it("should block window keyword", () => {
        const result = evaluateExpression("window", {});
        expect(result).toBe(0);
      });

      it("should block fetch keyword", () => {
        const result = evaluateExpression("fetch", {});
        expect(result).toBe(0);
      });

      it("should block alert keyword", () => {
        const result = evaluateExpression("alert", {});
        expect(result).toBe(0);
      });

      it("should block eval keyword", () => {
        const result = evaluateExpression("eval", {});
        expect(result).toBe(0);
      });

      it("should block localStorage keyword", () => {
        const result = evaluateExpression("localStorage", {});
        expect(result).toBe(0);
      });

      it("should block setTimeout keyword", () => {
        const result = evaluateExpression("setTimeout", {});
        expect(result).toBe(0);
      });

      it("should block constructor keyword", () => {
        const result = evaluateExpression("constructor", {});
        expect(result).toBe(0);
      });

      it("should block prototype keyword", () => {
        const result = evaluateExpression("prototype", {});
        expect(result).toBe(0);
      });

      it("should block __proto__ keyword", () => {
        const result = evaluateExpression("__proto__", {});
        expect(result).toBe(0);
      });

      it("should block globalThis keyword", () => {
        const result = evaluateExpression("globalThis", {});
        expect(result).toBe(0);
      });

      it("should block self keyword", () => {
        const result = evaluateExpression("self", {});
        expect(result).toBe(0);
      });

      it("should block this keyword", () => {
        const result = evaluateExpression("this", {});
        expect(result).toBe(0);
      });

      it("should block keywords within expressions", () => {
        const result = evaluateExpression("a + document + b", { a: 1, b: 2 });
        expect(result).toBe(0);
      });

      it("should block keywords in complex expressions", () => {
        const result = evaluateExpression("fetch * 2 + window", {});
        expect(result).toBe(0);
      });
    });

    describe("word boundary matching (no false positives)", () => {
      it("should allow variables containing blocked words as substrings", () => {
        // "documentation" contains "document" but should be allowed
        const result = evaluateExpression("documentation", {
          documentation: 100,
        });
        expect(result).toBe(100);
      });

      it("should allow fetchData variable", () => {
        const result = evaluateExpression("fetchData + 10", { fetchData: 50 });
        expect(result).toBe(60);
      });

      it("should allow windowSize variable", () => {
        const result = evaluateExpression("windowSize * 2", { windowSize: 25 });
        expect(result).toBe(50);
      });

      it("should allow alertCount variable", () => {
        const result = evaluateExpression("alertCount", { alertCount: 5 });
        expect(result).toBe(5);
      });

      it("should allow selfish variable", () => {
        const result = evaluateExpression("selfish + 1", { selfish: 10 });
        expect(result).toBe(11);
      });

      it("should allow topMargin variable", () => {
        const result = evaluateExpression("topMargin", { topMargin: 20 });
        expect(result).toBe(20);
      });

      it("should allow parentElement variable", () => {
        const result = evaluateExpression("parentElement", {
          parentElement: 15,
        });
        expect(result).toBe(15);
      });

      it("should allow historyLength variable", () => {
        const result = evaluateExpression("historyLength", {
          historyLength: 42,
        });
        expect(result).toBe(42);
      });

      it("should allow evalResult variable", () => {
        const result = evaluateExpression("evalResult", { evalResult: 99 });
        expect(result).toBe(99);
      });
    });

    describe("dangerous character blocking", () => {
      it("should block curly braces", () => {
        expect(evaluateExpression("{}", {})).toBe(0);
        expect(evaluateExpression("a{b}", { a: 1, b: 2 })).toBe(0);
      });

      it("should block square brackets", () => {
        expect(evaluateExpression("[]", {})).toBe(0);
        expect(evaluateExpression("a[0]", { a: 5 })).toBe(0);
      });

      it("should block quotes", () => {
        expect(evaluateExpression('"test"', {})).toBe(0);
        expect(evaluateExpression("'test'", {})).toBe(0);
        expect(evaluateExpression("`test`", {})).toBe(0);
      });

      it("should block backslash", () => {
        expect(evaluateExpression("a\\b", {})).toBe(0);
      });
    });

    describe("period validation", () => {
      it("should allow decimal numbers", () => {
        expect(evaluateExpression("3.14", {})).toBe(3.14);
        expect(evaluateExpression("a + 0.5", { a: 1 })).toBe(1.5);
      });

      it("should block property access attempts", () => {
        // Period followed by non-digit should be blocked
        expect(evaluateExpression("a.b", { a: 5 })).toBe(0);
        expect(evaluateExpression("Math.PI", {})).toBe(0);
      });
    });
  });

  describe("executeCode", () => {
    it("should execute simple assignments", () => {
      const context: Record<string, number> = { a: 10 };
      executeCode("b = a + 5", context);
      expect(context.b).toBe(15);
    });

    it("should execute multiple assignments", () => {
      const context: Record<string, number> = { x: 2 };
      executeCode("y = x * 3\nz = y + 1", context);
      expect(context.y).toBe(6);
      expect(context.z).toBe(7);
    });

    it("should ignore comment lines", () => {
      const context: Record<string, number> = { a: 1 };
      executeCode("# This is a comment\nb = a + 1", context);
      expect(context.b).toBe(2);
      expect(context["# This is a comment"]).toBeUndefined();
    });

    it("should block dangerous keywords in assignments", () => {
      const context: Record<string, number> = {};
      executeCode("x = document", context);
      expect(context.x).toBe(0);
    });

    it("should allow variables that contain blocked words as substrings", () => {
      const context: Record<string, number> = { documentation: 50 };
      executeCode("result = documentation + 10", context);
      expect(context.result).toBe(60);
    });
  });
});
