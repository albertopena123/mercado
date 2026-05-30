// Shared helpers so the same user gets the same avatar everywhere.

const AVATAR_PALETTE = [
  "#7baef9",
  "#f6a96b",
  "#9b8df0",
  "#6ec0a3",
  "#e58a8a",
  "#5e9bf8",
  "#fbbc04",
  "#f87171",
  "#10b981",
  "#a78bfa",
] as const;

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
