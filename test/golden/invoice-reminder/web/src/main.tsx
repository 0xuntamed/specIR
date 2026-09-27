// @appspec:generated — do not edit
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { ClientEditPage } from "./pages/ClientEdit";
import { ClientNewPage } from "./pages/ClientNew";
import { ClientsPage } from "./pages/Clients";
import { InvoiceDetailPage } from "./pages/InvoiceDetail";
import { InvoiceEditorPage } from "./pages/InvoiceEditor";
import { InvoiceNewPage } from "./pages/InvoiceNew";
import { InvoicesPage } from "./pages/Invoices";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { RequireAuth } from "./session";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/clients" element={<RequireAuth><ClientsPage /></RequireAuth>} />
          <Route path="/clients/new" element={<RequireAuth><ClientNewPage /></RequireAuth>} />
          <Route path="/clients/:id/edit" element={<RequireAuth><ClientEditPage /></RequireAuth>} />
          <Route path="/invoices" element={<RequireAuth><InvoicesPage /></RequireAuth>} />
          <Route path="/invoices/new" element={<RequireAuth><InvoiceNewPage /></RequireAuth>} />
          <Route path="/invoices/:id" element={<RequireAuth><InvoiceDetailPage /></RequireAuth>} />
          <Route path="/invoices/:id/edit" element={<RequireAuth><InvoiceEditorPage /></RequireAuth>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
