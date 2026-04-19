import { useEffect, useState } from "react";
import { subscribe } from "./storage";

export function useStore<T>(load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    load().then((v) => !cancelled && setValue(v));
    const unsub = subscribe(() => {
      load().then((v) => !cancelled && setValue(v));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  return value;
}
