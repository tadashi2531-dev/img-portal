import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase.ts";

export type CompanySettings = {
  companyName: string;
  trade: string;
  address: string;
  phone: string;
  email: string;
};

const empty: CompanySettings = { companyName: "", trade: "", address: "", phone: "", email: "" };

const CompanyContext = createContext<{ settings: CompanySettings; reload: () => Promise<void> }>({
  settings: empty,
  reload: async () => undefined,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(empty);

  async function reload() {
    const { data, error } = await supabase
      .from("company_settings")
      .select("company_name, trade, address, phone, email")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return;
    const row = data as { company_name: string; trade: string; address: string; phone: string; email: string };
    setSettings({
      companyName: row.company_name ?? "",
      trade: row.trade ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
    });
  }

  useEffect(() => {
    void reload();
  }, []);

  const value = useMemo(() => ({ settings, reload }), [settings]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  return useContext(CompanyContext);
}
