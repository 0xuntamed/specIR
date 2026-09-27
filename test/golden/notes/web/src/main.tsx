// @appspec:generated — do not edit
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/Login";
import { NoteEditPage } from "./pages/NoteEdit";
import { NoteNewPage } from "./pages/NoteNew";
import { NotesPage } from "./pages/Notes";
import { RegisterPage } from "./pages/Register";
import { RequireAuth } from "./session";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/notes" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/notes" element={<RequireAuth><NotesPage /></RequireAuth>} />
          <Route path="/notes/new" element={<RequireAuth><NoteNewPage /></RequireAuth>} />
          <Route path="/notes/:id/edit" element={<RequireAuth><NoteEditPage /></RequireAuth>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
