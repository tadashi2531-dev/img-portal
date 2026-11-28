import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { CompanyProvider } from "./components/CompanyContext.tsx";
import { Shell } from "./components/Shell.tsx";
import { VoiceBar, VoiceProvider } from "./components/VoiceContext.tsx";
import { HazardStripe } from "./components/ui.tsx";
import { UnsavedProvider } from "./components/unsaved.tsx";
import { CustomersPage } from "./pages/CustomersPage.tsx";
import { DocumentsPage } from "./pages/DocumentsPage.tsx";
import { EstimateEditorPage } from "./pages/EstimateEditorPage.tsx";
import { EstimatePrintPage } from "./pages/EstimatePrintPage.tsx";
import { EstimatesPage } from "./pages/EstimatesPage.tsx";
import { InboxPage } from "./pages/InboxPage.tsx";
import { InvoiceEditorPage } from "./pages/InvoiceEditorPage.tsx";
import { InvoicePrintPage } from "./pages/InvoicePrintPage.tsx";
import { InvoicesPage } from "./pages/InvoicesPage.tsx";
import { JobDetailPage } from "./pages/JobDetailPage.tsx";
import { JobsPage } from "./pages/JobsPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { PhotosPage } from "./pages/PhotosPage.tsx";
import { SalesPage } from "./pages/SalesPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { TripsPage } from "./pages/TripsPage.tsx";
import { EstimateReusePage } from "./pages/EstimateReusePage.tsx";

function Splash() {
  return (
    <div className="login">
      <HazardStripe />
      <div className="brand-bar">
        <div>
          <div className="brand-mark">社内ポータル</div>
          <div className="brand-sub">読み込み中…</div>
        </div>
      </div>
      <HazardStripe />
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <LoginPage />;
  return (
    <CompanyProvider>
      <VoiceProvider>
        <UnsavedProvider>
          <Shell>
            <VoiceBar />
            <Routes>
          <Route path="/" element={<Navigate to="/estimates" replace />} />
          <Route path="/estimates" element={<EstimatesPage />} />
          <Route path="/estimates/new" element={<EstimateEditorPage />} />
          <Route path="/estimates/from-past" element={<EstimateReusePage />} />
          <Route path="/estimates/:id/print" element={<EstimatePrintPage />} />
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:id" element={<TripsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id/print" element={<InvoicePrintPage />} />
          <Route path="/invoices/:id" element={<InvoiceEditorPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/photos" element={<PhotosPage />} />
          <Route path="/photos/:jobId" element={<PhotosPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/estimates" replace />} />
            </Routes>
          </Shell>
        </UnsavedProvider>
      </VoiceProvider>
    </CompanyProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}
