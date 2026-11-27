import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type UnsavedValue = {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const UnsavedContext = createContext<UnsavedValue>({
  dirty: false,
  setDirty: () => undefined,
});

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty]);
  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

export function useUnsaved(): UnsavedValue {
  return useContext(UnsavedContext);
}
