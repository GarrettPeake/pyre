import { useState, useEffect } from "react";

/**
 * A custom hook that debounces a value.
 * Returns the debounced value that only updates after the specified delay
 * has passed since the last change to the input value.
 *
 * @param value - The value to debounce
 * @param delay - The debounce delay in milliseconds (default: 1000ms)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number = 1000): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup: cancel the timer if value changes before delay completes
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
