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

    describe("advanced math operations", () => {
      it("should handle division", () => {
        expect(evaluateExpression("a / b", { a: 20, b: 4 })).toBe(5);
        expect(evaluateExpression("a / b", { a: 10, b: 3 })).toBeCloseTo(3.333, 2);
      });

      it("should handle modulo", () => {
        expect(evaluateExpression("a % b", { a: 17, b: 5 })).toBe(2);
        expect(evaluateExpression("a % b", { a: 10, b: 3 })).toBe(1);
      });

      it("should handle exponentiation", () => {
        expect(evaluateExpression("a ** b", { a: 2, b: 10 })).toBe(1024);
        expect(evaluateExpression("a ** b", { a: 2, b: 0.5 })).toBeCloseTo(1.414, 2);
      });

      it("should handle parentheses for order of operations", () => {
        expect(evaluateExpression("(a + b) * c", { a: 2, b: 3, c: 4 })).toBe(20);
        expect(evaluateExpression("a * (b + c)", { a: 2, b: 3, c: 4 })).toBe(14);
        expect(
          evaluateExpression("((a + b) * c) / d", { a: 2, b: 3, c: 4, d: 2 })
        ).toBe(10);
      });

      it("should handle nested parentheses", () => {
        expect(
          evaluateExpression("((a + b) * (c - d))", { a: 1, b: 2, c: 5, d: 2 })
        ).toBe(9);
      });

      it("should handle negative numbers", () => {
        expect(evaluateExpression("-a", { a: 5 })).toBe(-5);
        expect(evaluateExpression("a + -b", { a: 10, b: 3 })).toBe(7);
        expect(evaluateExpression("-a * -b", { a: 5, b: 3 })).toBe(15);
      });

      it("should handle very small decimal numbers", () => {
        expect(evaluateExpression("a * b", { a: 0.001, b: 1000 })).toBe(1);
        expect(evaluateExpression("a * 0.0001", { a: 10000 })).toBe(1);
      });

      it("should handle very large numbers", () => {
        expect(evaluateExpression("a * b", { a: 1000000, b: 1000000 })).toBe(1e12);
        expect(evaluateExpression("a * b", { a: 1e10, b: 1e5 })).toBe(1e15);
      });
    });

    describe("edge cases", () => {
      it("should handle division by zero as Infinity", () => {
        const result = evaluateExpression("a / b", { a: 10, b: 0 });
        expect(result).toBe(Infinity);
      });

      it("should handle undefined variables as NaN (returns 0)", () => {
        // When a variable is not in context, JS returns undefined
        // The expression will fail and return 0
        const result = evaluateExpression("undefined_var + 5", {});
        expect(result).toBe(0);
      });

      it("should handle whitespace in expressions", () => {
        expect(evaluateExpression("  a   +   b  ", { a: 5, b: 3 })).toBe(8);
        expect(evaluateExpression("\ta\t*\tb\t", { a: 4, b: 2 })).toBe(8);
      });

      it("should handle null values in expression", () => {
        expect(evaluateExpression("null", {})).toBe(0);
      });

      it("should handle scientific notation", () => {
        expect(evaluateExpression("1e5", {})).toBe(100000);
        expect(evaluateExpression("1.5e3", {})).toBe(1500);
        expect(evaluateExpression("a + 1e2", { a: 50 })).toBe(150);
      });

      it("should handle logical operators with boolean coercion", () => {
        // Note: comparison operators like > < are blocked as dangerous characters
        // So we test math expressions that naturally evaluate to 0 or non-zero
        expect(evaluateExpression("a - b", { a: 5, b: 5 })).toBe(0);
        expect(evaluateExpression("a - b", { a: 5, b: 3 })).toBe(2);
      });

      it("should handle conditional-like logic using math", () => {
        // Without comparison operators, we use subtraction to check differences
        // If a > b, then (a - b) is positive
        const diff = evaluateExpression("a - b", { a: 10, b: 5 });
        expect(diff).toBeGreaterThan(0);
      });
    });

    describe("additional blocked keywords", () => {
      it("should block location keyword", () => {
        expect(evaluateExpression("location", {})).toBe(0);
      });

      it("should block history keyword", () => {
        expect(evaluateExpression("history", {})).toBe(0);
      });

      it("should block navigator keyword", () => {
        expect(evaluateExpression("navigator", {})).toBe(0);
      });

      it("should block Worker keyword", () => {
        expect(evaluateExpression("Worker", {})).toBe(0);
      });

      it("should block WebSocket keyword", () => {
        expect(evaluateExpression("WebSocket", {})).toBe(0);
      });

      it("should block XMLHttpRequest keyword", () => {
        expect(evaluateExpression("XMLHttpRequest", {})).toBe(0);
      });

      it("should block Proxy keyword", () => {
        expect(evaluateExpression("Proxy", {})).toBe(0);
      });

      it("should block Reflect keyword", () => {
        expect(evaluateExpression("Reflect", {})).toBe(0);
      });

      it("should block Symbol keyword", () => {
        expect(evaluateExpression("Symbol", {})).toBe(0);
      });

      it("should block Function keyword", () => {
        expect(evaluateExpression("Function", {})).toBe(0);
      });
    });

    describe("financial calculation patterns", () => {
      it("should calculate simple interest", () => {
        // Interest = Principal * Rate * Time
        const result = evaluateExpression("principal * rate * time", {
          principal: 10000,
          rate: 0.05,
          time: 2,
        });
        expect(result).toBe(1000);
      });

      it("should calculate compound interest factor", () => {
        // (1 + rate)^periods
        const result = evaluateExpression("(1 + rate) ** periods", {
          rate: 0.05,
          periods: 10,
        });
        expect(result).toBeCloseTo(1.6289, 3);
      });

      it("should calculate loan payment factor", () => {
        // r * (1+r)^n / ((1+r)^n - 1)
        const result = evaluateExpression(
          "(r * (1 + r) ** n) / ((1 + r) ** n - 1)",
          { r: 0.005, n: 360 }
        );
        expect(result).toBeCloseTo(0.006, 3);
      });

      it("should calculate percentage changes", () => {
        expect(
          evaluateExpression("(new_val - old_val) / old_val * 100", {
            new_val: 110,
            old_val: 100,
          })
        ).toBe(10);
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

    describe("additional executeCode tests", () => {
      it("should handle empty code", () => {
        const context: Record<string, number> = { a: 5 };
        executeCode("", context);
        expect(context.a).toBe(5);
      });

      it("should handle whitespace-only code", () => {
        const context: Record<string, number> = { a: 5 };
        executeCode("   \n   \n   ", context);
        expect(context.a).toBe(5);
      });

      it("should handle only comments", () => {
        const context: Record<string, number> = { a: 5 };
        executeCode("# comment 1\n# comment 2\n# comment 3", context);
        expect(context.a).toBe(5);
      });

      it("should handle mixed comments and code", () => {
        const context: Record<string, number> = { a: 1 };
        executeCode("# first comment\nb = a + 1\n# second comment\nc = b * 2", context);
        expect(context.b).toBe(2);
        expect(context.c).toBe(4);
      });

      it("should handle inline calculations", () => {
        const context: Record<string, number> = {};
        executeCode("x = 10\ny = x * 2\nz = y + x", context);
        expect(context.x).toBe(10);
        expect(context.y).toBe(20);
        expect(context.z).toBe(30);
      });

      it("should update existing variables", () => {
        const context: Record<string, number> = { x: 5 };
        executeCode("x = x + 10\nx = x * 2", context);
        expect(context.x).toBe(30);
      });

      it("should handle variable reassignment in sequence", () => {
        const context: Record<string, number> = { balance: 1000 };
        executeCode("deposit = 500\nbalance = balance + deposit\nwithdrawal = 200\nbalance = balance - withdrawal", context);
        expect(context.balance).toBe(1300);
        expect(context.deposit).toBe(500);
        expect(context.withdrawal).toBe(200);
      });

      it("should handle underscore in variable names", () => {
        const context: Record<string, number> = {};
        executeCode("my_var = 10\nmy_other_var = my_var * 2", context);
        expect(context.my_var).toBe(10);
        expect(context.my_other_var).toBe(20);
      });

      it("should handle complex financial calculations", () => {
        const context: Record<string, number> = {
          principal: 100000,
          apr: 0.06,
          years: 30,
        };
        executeCode(
          "monthly_rate = apr / 12\nmonths = years * 12\npayment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)",
          context
        );
        expect(context.monthly_rate).toBeCloseTo(0.005, 5);
        expect(context.months).toBe(360);
        expect(context.payment).toBeCloseTo(599.55, 0);
      });

      it("should handle variable names with numbers", () => {
        const context: Record<string, number> = {};
        executeCode("var1 = 10\nvar2 = 20\nsum = var1 + var2", context);
        expect(context.var1).toBe(10);
        expect(context.var2).toBe(20);
        expect(context.sum).toBe(30);
      });

      it("should handle trailing whitespace", () => {
        const context: Record<string, number> = { a: 5 };
        executeCode("b = a + 5   \nc = b * 2   ", context);
        expect(context.b).toBe(10);
        expect(context.c).toBe(20);
      });

      it("should handle blank lines between code", () => {
        const context: Record<string, number> = { a: 1 };
        executeCode("b = a + 1\n\n\nc = b + 1", context);
        expect(context.b).toBe(2);
        expect(context.c).toBe(3);
      });
    });
  });
});
