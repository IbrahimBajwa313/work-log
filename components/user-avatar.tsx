import type { WorklogUser } from "@/hooks/useWorkLogSessionGate";

function initialsForUser(user: Pick<WorklogUser, "name" | "email">): string {
  const name = user.name.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  }
  return (user.email.slice(0, 2) || "?").toUpperCase();
}

type UserAvatarProps = {
  user: Pick<WorklogUser, "name" | "email" | "picture">;
  size?: "sm" | "md";
  className?: string;
};

export function UserAvatar({ user, size = "sm", className = "" }: UserAvatarProps) {
  const sizeClass = size === "md" ? "h-9 w-9 text-sm" : "h-8 w-8 text-xs";

  if (user.picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full border border-[var(--card-border)] object-cover ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--accent-cyan)]/35 bg-[var(--accent-cyan)]/15 font-bold text-[var(--accent-cyan)] ${sizeClass} ${className}`}
    >
      {initialsForUser(user)}
    </span>
  );
}
