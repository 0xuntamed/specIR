// @appspec:generated — do not edit
import { useEffect, useState, type DependencyList } from "react";

// Loads data when deps change; reload() fetches again.
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setState((prev) => ({ ...prev, loading: true }));
    load().then(
      (data) => live && setState({ data, loading: false }),
      (error: unknown) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return { ...state, reload: () => setVersion((v) => v + 1) };
}

// Runs a mutation, tracking busy and error for the UI.
export function useAction() {
  const [state, setState] = useState<{ busy: boolean; error?: unknown }>({ busy: false });
  async function run(action: () => Promise<unknown>): Promise<void> {
    setState({ busy: true });
    try {
      await action();
      setState({ busy: false });
    } catch (error) {
      setState({ busy: false, error });
    }
  }
  return { ...state, run };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
