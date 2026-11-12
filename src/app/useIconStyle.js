import { useEffect, useState } from "react";

// Line or solid map icons, remembered in this browser.
export default function useIconStyle() {
  const [iconStyle, setIconStyle] = useState(() => {
    try { return localStorage.getItem("boredone-icon-style") === "solid" ? "solid" : "line"; } catch { return "line"; }
  });
  useEffect(() => {
    document.documentElement.dataset.iconStyle = iconStyle;
    try { localStorage.setItem("boredone-icon-style", iconStyle); } catch { /* Optional appearance preference. */ }
  }, [iconStyle]);
  return [iconStyle, setIconStyle];
}
