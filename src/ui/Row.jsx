import React from "react";
import Icon from "./Icon.jsx";

// One line in a list: optional icon, a title, a detail line, and a trailing
// fact or control. Becomes a button when given onClick.
export default function Row({ icon, title, detail, trail, onClick, accent, className = "", children, ...rest }) {
  const body = (
    <>
      {icon && <span className={`row-icon${accent ? ` row-icon-${accent}` : ""}`}><Icon name={icon} size={22} /></span>}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {detail && <span className="row-detail">{detail}</span>}
        {children}
      </span>
      {trail != null && <span className="row-trail">{trail}</span>}
    </>
  );
  if (onClick) return <button type="button" className={`row row-button ${className}`} onClick={onClick} {...rest}>{body}</button>;
  return <div className={`row ${className}`} {...rest}>{body}</div>;
}
