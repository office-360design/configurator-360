// Only this entry point runs in the existing configurator document.
const button = document.createElement("button");
button.type = "button";
button.id = "roofBuilderOpen";
button.className = "estimate-button";
button.style.cssText =
  "width:100%;min-height:56px;margin:12px 0;text-align:left;white-space:normal";
const title = document.createElement("span"),
  subtitle = document.createElement("strong");
title.textContent = "Desenare 2D Pante";
subtitle.textContent = "Construiește acoperișul pas cu pas";
button.append(title, subtitle);
const intro = document.querySelector(".sidebar .intro-section");
intro?.append(button);
let dialog = null,
  frame = null,
  opener = null;
function closeBuilder() {
  if (!dialog) return;
  frame?.contentWindow?.postMessage(
    { type: "roof-builder:dispose" },
    location.origin,
  );
  dialog.close();
  dialog.remove();
  dialog = null;
  frame = null;
  opener?.focus();
}
function openBuilder() {
  if (dialog || !window.ROOF_CONFIGURATOR_API) return;
  opener = document.activeElement;
  dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Roof builder");
  dialog.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#f5f7f9;overflow:hidden";
  frame = document.createElement("iframe");
  frame.title = "Roof builder";
  frame.style.cssText = "width:100%;height:100%;border:0;display:block";
  const state = window.ROOF_CONFIGURATOR_API.getState();
  const url = new URL("./index.html", import.meta.url);
  url.searchParams.set("locale", state.locale || "ro-RO");
  url.searchParams.set("units", state.units || "metric");
  frame.src = url.href;
  dialog.append(frame);
  document.body.append(dialog);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeBuilder();
  });
  dialog.showModal();
}
button.addEventListener("click", openBuilder);
button.disabled = !window.ROOF_CONFIGURATOR_API;
function syncLabel() {
  const locale = window.ROOF_CONFIGURATOR_API?.getState?.().locale || "ro-RO",
    language = locale.split("-")[0];
  title.textContent =
    language === "de"
      ? "2D-Dachflächen zeichnen"
      : language === "en"
        ? "Draw 2D slopes"
        : "Desenare 2D Pante";
  subtitle.textContent =
    language === "de"
      ? "Dach Schritt für Schritt bauen"
      : language === "en"
        ? "Build your roof step by step"
        : "Construiește acoperișul pas cu pas";
  button.disabled = !window.ROOF_CONFIGURATOR_API;
}
window.addEventListener("roof-configurator-ready", syncLabel);
window.addEventListener("roof-tools-state-change", syncLabel);
syncLabel();
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow)
    return;
  if (event.data?.type === "roof-builder:close") closeBuilder();
  if (event.data?.type === "roof-builder:copy") {
    const snapshot = window.ROOF_CONFIGURATOR_API?.captureState?.();
    frame.contentWindow.postMessage(
      {
        type: "roof-builder:snapshot",
        snapshot: snapshot ? structuredClone(snapshot) : null,
      },
      location.origin,
    );
  }
});
