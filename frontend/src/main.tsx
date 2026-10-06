import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DedicatedLogin, Login } from "./login/Login";
import ForgotPassword from './login/ForgotPassword';
import { Register } from './login/Register';
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
        <Route path="/customer-login" element={<DedicatedLogin role="customer" />} />
        <Route path="/manager-login" element={<DedicatedLogin role="manager" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/register" element={<Register />} />
        <Route path="/inventory" element={<InventoryPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
