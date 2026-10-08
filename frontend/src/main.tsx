import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DedicatedLogin, Login } from "./login/Login";
import ForgotPassword from './login/ForgotPassword';
import { Register } from './login/Register';
import { AuthProvider } from "./auth/AuthContext";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { InventoryPage } from "./inventory/InventoryPage";
import { HomePage } from "./home/HomePage";
import { CartPage } from "./cart/CartPage";
import { ManagerDashboard } from "./manager/ManagerDashboard";
import { CustomerOrderHistoryPage } from "./orders/CustomerOrderHistoryPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/customer-storefront" element={<HomePage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/customer-login" element={<DedicatedLogin role="customer" />} />
          <Route path="/manager-login" element={<DedicatedLogin role="manager" />} />
          <Route path="/manager-dashboard" element={<ManagerDashboard />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/orders" element={<CustomerOrderHistoryPage />} />
          <Route path="/cart" element={<CartPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
