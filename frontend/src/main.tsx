import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Login } from "./Login";
import ForgotPassword from './ForgotPassword';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InventoryPage } from "./inventory/InventoryPage";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/inventory" element={<InventoryPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
