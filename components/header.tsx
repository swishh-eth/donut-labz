"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface HeaderProps {
  title: string;
  user?: {
    displayName?: string;
    username?: string;
    pfpUrl?: string;
  } | null;
}

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export function Header({ title, user }: HeaderProps) {
  const displayName = user?.displayName ?? user?.username ?? "Player";
  const handle = user?.username ? `@${user.username}` : "";
  const avatarUrl = user?.pfpUrl ?? null;

  return (
    <>
      <style>{`
        @keyframes headerFadeIn {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .header-fade-in {
          animation: headerFadeIn 0.3s ease-out forwards;
        }
      `}</style>
      <div className="flex items-center justify-between mb-4 h-12">
        <h1 key={title} className="text-2xl font-bold tracking-wide header-fade-in">{title}</h1>
        <div 
          className={`flex items-center gap-2 rounded-full bg-black px-3 py-1 transition-opacity duration-200 ${user ? 'opacity-100' : 'opacity-0'}`}
        >
          <Avatar className="h-8 w-8 border border-zinc-800">
            <AvatarImage src={avatarUrl || undefined} alt={displayName} className="object-cover" />
            <AvatarFallback className="bg-zinc-800 text-white">{initialsFrom(displayName)}</AvatarFallback>
          </Avatar>
          <div className="leading-tight text-left">
            <div className="text-sm font-bold">{displayName}</div>
            {handle && <div className="text-xs text-gray-400">{handle}</div>}
          </div>
        </div>
      </div>
    </>
  );
}