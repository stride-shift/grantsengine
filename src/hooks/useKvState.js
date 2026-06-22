import { useState, useEffect, useRef, useCallback } from "react";
import { kvGet, kvSet } from "@/api";

const isEmpty = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

/**
 * KV-backed state: loads `key` from the server on mount, and persists every
 * update via kvSet. Replaces the inlined kvGet/kvSet + local-state pattern in
 * Funders (owners), DocVault (references), etc.
 *
 * `setValue` accepts a value or an updater fn (like useState) and persists the
 * resolved value. A stored value that is empty/missing leaves `initialValue`.
 *
 * @returns { value, setValue, loading, error }
 */
export default function useKvState(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    kvGet(key)
      .then((stored) => { if (active && !isEmpty(stored)) setValue(stored); })
      .catch((e) => { if (active) setError(e?.message || String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key]);

  const save = useCallback(async (next) => {
    const resolved = typeof next === "function" ? next(valueRef.current) : next;
    setValue(resolved);
    try {
      await kvSet(key, resolved);
    } catch (e) {
      if (mounted.current) setError(e?.message || String(e));
    }
    return resolved;
  }, [key]);

  return { value, setValue: save, loading, error };
}
