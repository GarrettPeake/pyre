/**
 * Executes JavaScript code in a restricted context.
 * Every statement must be an assignment and is used to update the context
 * Prevents use of dangerous characters: { } [ ] ' " ` / : #
 * Periods are only allowed when followed by digits (for decimal numbers)
 */
export function executeCode(
  code: string,
  context: Record<string, number>
): void {
  code
    .split("\n") // Split into statements
    .map((s) => s.trim()) // Trim whitespace
    .filter((line) => !line.startsWith("#") && line.length > 0) // Remove empty and comment lines
    .map((statement) => {
      const [updatedVarName, updatedVarStatement] = statement
        .split("=")
        .map((s) => s.trim());
      context[updatedVarName] = evaluateExpression(
        updatedVarStatement,
        context,
        true
      );
    });
}

/**
 * Evaluates a single expression and returns its numeric value.
 */
export function evaluateExpression(
  expr: string,
  context: Record<string, number>,
  raise_errors = false
): number {
  // If the expression is empty return 0
  if (!expr?.trim()) return 0;

  // If the expression is just a float return it
  if (!Number.isNaN(parseFloat(expr))) return parseFloat(expr);

  // Security check - disallow dangerous characters
  if (/[{}[\]`'"\\]/.test(expr)) {
    console.error(
      "Expression contains disallowed characters (/[{}[\\]`'\"\\\\:]/):",
      expr
    );
    return 0;
  }

  // Security check - ensure any period is followed by a digit (for decimals only)
  const exprNoSpace = expr.replace(/\s/g, "");
  if (/\.[^\d]/.test(exprNoSpace)) {
    console.error(
      "Periods must be followed by digits (decimal numbers only):",
      expr
    );
    return 0;
  }

  try {
    const contextKeys = Object.keys(context);
    const contextValues = contextKeys.map((key) => context[key]);
    const func = new Function(...contextKeys, `return (${expr}) || 0`);
    const result = func(...contextValues);
    return typeof result === "number" ? result : 0;
  } catch (error) {
    if (raise_errors) {
      throw error;
    }
    return 0;
  }
}
