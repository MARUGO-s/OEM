import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthGate } from "./AuthGate";
import { QrWorkspace } from "./QrWorkspace";
import "./styles.css";
import "./qr.css";
import "./application.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      {(application, chooseApplication) =>
        application === "qr" ? (
          <QrWorkspace onChooseApp={chooseApplication} />
        ) : (
          <App onChooseApp={chooseApplication} />
        )
      }
    </AuthGate>
  </React.StrictMode>,
);
