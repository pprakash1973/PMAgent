"use client";
import React, { createContext, useContext, useState, useCallback } from "react";

export interface CopilotTabContext {
  tab: string;
  projectId?: string;
  projectName?: string;
  kpiSnapshot?: {
    spi?: number | null;
    pv?: number | null;
    ev?: number | null;
    healthStatus?: string;
    risksOpen?: number;
    risksCritical?: number;
    issuesOpen?: number;
    issuesCritical?: number;
  };
}

interface CopilotContextValue {
  tabContext: CopilotTabContext;
  setTabContext: (ctx: CopilotTabContext) => void;
  isOpen: boolean;
  openPanel: (prefill?: string) => void;
  closePanel: () => void;
  prefillMessage: string;
  clearPrefill: () => void;
}

const CopilotContext = createContext<CopilotContextValue>({
  tabContext: { tab: "default" },
  setTabContext: () => {},
  isOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  prefillMessage: "",
  clearPrefill: () => {},
});

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [tabContext, setTabContext] = useState<CopilotTabContext>({ tab: "default" });
  const [isOpen, setIsOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState("");

  const openPanel = useCallback((prefill?: string) => {
    if (prefill) setPrefillMessage(prefill);
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => setIsOpen(false), []);
  const clearPrefill = useCallback(() => setPrefillMessage(""), []);

  return (
    <CopilotContext.Provider value={{ tabContext, setTabContext, isOpen, openPanel, closePanel, prefillMessage, clearPrefill }}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  return useContext(CopilotContext);
}
