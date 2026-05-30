import type { CSSProperties, JSX } from "react";

export type IconName =
  | "menu"
  | "search"
  | "bell"
  | "help"
  | "apps"
  | "clock"
  | "home"
  | "users"
  | "device"
  | "sparkle"
  | "shield"
  | "folder"
  | "chart"
  | "card"
  | "at"
  | "rules"
  | "cloud"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "plus"
  | "filter"
  | "info"
  | "settings"
  | "close"
  | "check"
  | "sort-asc"
  | "sort-desc"
  | "more-vert"
  | "mail"
  | "trash"
  | "download"
  | "lock"
  | "user"
  | "external"
  | "calendar"
  | "logo";

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: IconProps): JSX.Element | null {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
  };

  switch (name) {
    case "menu":
      return (
        <svg {...props}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "help":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" />
          <circle cx="12" cy="17" r=".5" fill="currentColor" />
        </svg>
      );
    case "apps":
      return (
        <svg {...props} strokeWidth={0} fill="currentColor">
          <circle cx="5" cy="5" r="1.5" />
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="19" cy="5" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
          <circle cx="5" cy="19" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
          <circle cx="19" cy="19" r="1.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15 14c3 0 6 1.5 6 5" />
        </svg>
      );
    case "device":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="14" height="10" rx="1.5" />
          <path d="M7 19h6" />
          <path d="M10 15v4" />
          <rect x="17.5" y="9" width="4" height="10" rx="1" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...props}>
          <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6Z" />
          <path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 3 4 6v6c0 4.5 3.4 8.5 8 9 4.6-.5 8-4.5 8-9V6Z" />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M4 20V8M10 20V4M16 20v-8M22 20H2" />
        </svg>
      );
    case "card":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="13" rx="1.5" />
          <path d="M3 10h18" />
        </svg>
      );
    case "at":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.9" />
        </svg>
      );
    case "rules":
      return (
        <svg {...props}>
          <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
          <path d="M8 11h8M8 15h5" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...props}>
          <path d="M7 18a4 4 0 0 1-.6-7.9 6 6 0 0 1 11.6 1.4A3.5 3.5 0 0 1 17.5 18Z" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...props}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...props}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "chevron-up":
      return (
        <svg {...props}>
          <path d="m18 15-6-6-6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "filter":
      return (
        <svg {...props}>
          <path d="M3 5h18l-7 9v6l-4-2v-4Z" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8v.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.7l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    case "close":
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="m5 13 4 4L19 7" />
        </svg>
      );
    case "sort-asc":
      return (
        <svg {...props}>
          <path d="M12 19V5m0 0-5 5m5-5 5 5" />
        </svg>
      );
    case "sort-desc":
      return (
        <svg {...props}>
          <path d="M12 5v14m0 0-5-5m5 5 5-5" />
        </svg>
      );
    case "more-vert":
      return (
        <svg {...props} strokeWidth={0} fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      );
    case "mail":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "trash":
      return (
        <svg {...props}>
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
        </svg>
      );
    case "download":
      return (
        <svg {...props}>
          <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />
        </svg>
      );
    case "lock":
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case "external":
      return (
        <svg {...props}>
          <path d="M14 4h6v6M20 4 10 14M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="1.5" />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      );
    case "logo":
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <path d="M16 4 28 11v10L16 28 4 21V11Z" fill="#5e9bf8" />
          <path d="M16 4 28 11 16 18 4 11Z" fill="#7baef9" />
          <path d="M16 18v10L4 21V11Z" fill="#4285f4" />
        </svg>
      );
    default:
      return null;
  }
}
