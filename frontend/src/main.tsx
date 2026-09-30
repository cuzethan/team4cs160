import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Login } from "./login/Login";
import { ForgotPassword } from './login/ForgotPassword';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { InventoryPage } from "./inventory/InventoryPage";
import { HomePage } from "./home/HomePage";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/inventory" element={<InventoryPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
