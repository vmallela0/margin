import "./styles/newtab.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Library } from "./components/Library";
import { ThemeRoot } from "./components/ThemeRoot";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <ThemeRoot>
      <Library />
    </ThemeRoot>
  </StrictMode>,
);
