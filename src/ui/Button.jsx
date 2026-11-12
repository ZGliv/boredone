import React from "react";
import Icon from "./Icon.jsx";

// variant: "primary" (gold, one per screen), "quiet" (hairline outline) or
// "text". Renders an <a> when given href.
export default function Button({ variant = "quiet", icon, iconAfter, block = false, className = "", children, href, ...rest }) {
  const cls = `btn btn-${variant}${block ? " btn-block" : ""}${!children ? " btn-icon" : ""} ${className}`;
  const body = <>{icon && <Icon name={icon} size={20} />}{children && <span>{children}</span>}{iconAfter && <Icon name={iconAfter} size={20} />}</>;
  if (href) return <a className={cls} href={href} target="_blank" rel="noreferrer" {...rest}>{body}</a>;
  return <button type="button" className={cls} {...rest}>{body}</button>;
}
