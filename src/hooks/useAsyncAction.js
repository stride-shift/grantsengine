import { useState, useRef, useEffect, useCallback } from "react";
import { isAIError } from "@/utils";

/**
 * Wraps an async function with busy + error state — the repeating
 * "set busy / try / catch / parse-AI-error / clear busy" pattern that was
 * inlined across components. Components call `run(...)` and render `busy`/`error`.
 *
 * The wrapped fn's resolved value is returned from `run`. AI calls resolve to a
 * STRING that may itself be an error message; when the result is a string and
 * `isError(result)` is true it is treated as a failure (error set, `run` → null).
 *
 * @param fn the async function to wrap (latest closure is always used)
 * @param opts.onSuccess called with the result on success
 * @param opts.onError   called with the error (Error object, or AI error string)
 * @param opts.isError   predicate to flag a string result as an error (default: isAIError)
 * @returns { run, busy, error, reset }
 */
export default function useAsyncAction(fn, opts = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async (...args) => {
    const { onSuccess, onError, isError = isAIError } = optsRef.current || {};
    setBusy(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      if (typeof result === "string" && isError(result)) {
        if (mounted.current) setError(result);
        onError?.(result);
        return null;
      }
      onSuccess?.(result);
      return result;
    } catch (e) {
      const msg = e?.message || String(e);
      if (mounted.current) setError(msg);
      onError?.(e);
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const reset = useCallback(() => { if (mounted.current) setError(null); }, []);

  return { run, busy, error, reset };
}
