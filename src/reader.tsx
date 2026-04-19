import "./styles/reader.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Reader } from "./components/Reader";
import { ThemeRoot } from "./components/ThemeRoot";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <ThemeRoot>
      <Reader />
    </ThemeRoot>
  </StrictMode>,
);
