"use client";

import { useEffect, useState } from "react";
import { User, X, Gamepad2, Trophy, Sparkles, MessageCircle } from "lucide-react";

type UserStats = {
  totalGamesPlayed: number;
  totalWinnings: number;
  favoriteGame: string;
  tipsReceived: number;
  chatSprinklesEarned: number;
};

type UserInfo = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

interface MyProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user?: UserInfo | null;
}

export function MyProfileDialog({ isOpen, onClose, user }: MyProfileDialogProps) {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user?.fid && !userStats) {
      setLoading(true);
      fetch(`/api/user/stats?fid=${user.fid}`)
        .then(res => res.json())
        .then(data => {
          setUserStats(data);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [isOpen, user?.fid, userStats]);

  // Reset stats when dialog closes so they refresh on reopen
  useEffect(() => {
    if (!isOpen) {
      setUserStats(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto">
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-amber-400" />
              My Profile
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info Header */}
          {user && (
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-zinc-800">
              {user.pfpUrl && (
                <img src={user.pfpUrl} alt="" className="w-12 h-12 rounded-full border-2 border-zinc-700" />
              )}
              <div>
                <div className="font-bold text-white">{user.displayName || user.username}</div>
                <div className="text-xs text-gray-400">@{user.username}</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">Loading stats...</div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Gamepad2 className="w-3.5 h-3.5 text-white" />
                    <span className="text-[10px] text-gray-400 uppercase">Games Played</span>
                  </div>
                  <div className="text-xl font-bold text-white">{userStats?.totalGamesPlayed?.toLocaleString() || 0}</div>
                </div>

                <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Trophy className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] text-gray-400 uppercase">Total Won</span>
                  </div>
                  <div className="text-xl font-bold text-green-400">${userStats?.totalWinnings?.toFixed(2) || '0.00'}</div>
                </div>
              </div>

              {/* Chat Sprinkles Earned */}
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                    <span className="text-sm text-white">Chat Sprinkles Earned</span>
                  </div>
                  <span className="font-bold text-white">{userStats?.chatSprinklesEarned?.toLocaleString() || 0}</span>
                </div>
              </div>

              {/* Tips Received */}
              <div className="bg-zinc-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-white" />
                    <span className="text-sm text-white">Tips Received</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                    <span className="font-bold text-white">{userStats?.tipsReceived?.toLocaleString() || 0}</span>
                  </div>
                </div>
              </div>

              {/* Favorite Game */}
              {userStats?.favoriteGame && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-400">⭐ Favorite Game</span>
                    <span className="font-bold text-white">{userStats.favoriteGame}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-white py-2 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}