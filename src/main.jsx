import React from "react";
import { createRoot } from "react-dom/client";
import Planner from "./Planner.jsx";

/*
 * В отличие от pywebview, Tauri не требует ждать отдельное событие
 * готовности моста ("pywebviewready") - invoke() из @tauri-apps/api
 * доступен сразу же, как только этот скрипт исполняется внутри окна
 * Tauri. Поэтому весь main.jsx теперь - это просто обычный рендер React,
 * без installStorageBridge()/window.pywebview - см. storage.js, там
 * теперь прямые типизированные обёртки над invoke("cmd_...", ...).
 */
const container = document.getElementById("root");
const root = createRoot(container);
root.render(<Planner />);
