import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#141d2e",
            color: "#f1f5f9",
            border: "1px solid rgba(255,255,255,0.07)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "14px",
            borderRadius: "12px",
          },
          success: { iconTheme: { primary: "#22c55e", secondary: "#0a0f1a" } },
          error:   { iconTheme: { primary: "#f87171", secondary: "#0a0f1a" } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
