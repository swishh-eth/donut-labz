"use client";

import { useState, useCallback, useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { X, Plus, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AddToFarcasterDialogProps = {
  showOnFirstVisit?: boolean;
  storageKey?: string;
};

export function AddToFarcasterDialog({
  showOnFirstVisit = true,
  storageKey = "sprinkles-add-miniapp-prompt-shown",
}: AddToFarcasterDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [addStatus, setAddStatus] = useState<"idle" | "adding" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isAppAdded, setIsAppAdded] = useState(false);

  // Check if we should show the dialog on mount
  useEffect(() => {
    if (!showOnFirstVisit) return;

    const checkAndShowDialog = async () => {
      try {
        // First check if app is already added via SDK
        const context = await sdk.context;
        
        // Set initial state based on context
        if (context?.client?.added) {
          setIsAppAdded(true);
          setAddStatus("success");
        }
        
        // If already added, don't show the dialog
        if (context?.client?.added) {
          console.log("App already added, skipping prompt");
          return;
        }

        // Check localStorage to avoid showing repeatedly in same session
        const hasSeenPrompt = localStorage.getItem(storageKey);
        if (hasSeenPrompt) {
          return;
        }

        // Show dialog after a short delay for better UX
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 2000);

        return () => clearTimeout(timer);
      } catch (error) {
        console.warn("Could not check app status:", error);
      }
    };

    checkAndShowDialog();
  }, [showOnFirstVisit, storageKey]);

  // Refresh state from context
  const refreshStateFromContext = useCallback(async () => {
    try {
      const ctx = await sdk.context;
      console.log("[Dialog RefreshContext]", ctx?.client);
      if (ctx?.client?.added) {
        setIsAppAdded(true);
        setAddStatus("success");
      }
      return ctx;
    } catch (e) {
      console.error("[Dialog RefreshContext] Error:", e);
      return null;
    }
  }, []);

  const handleAddToFarcaster = useCallback(async () => {
    if (isAppAdded) {
      setAddStatus("success");
      return;
    }
    
    setAddStatus("adding");
    setErrorMessage("");
    
    try {
      // Check if already added first
      const ctx = await refreshStateFromContext();
      if (ctx?.client?.added) {
        return;
      }
      
      // Try to add
      await sdk.actions.addMiniApp();
    } catch (e) {
      console.log("[AddToFarcaster] Action error (expected if already added):", e);
    }
    
    // Always check context after action to get true state
    const finalCtx = await refreshStateFromContext();
    
    // If still not added after checking context, show error briefly then reset
    if (!finalCtx?.client?.added) {
      setAddStatus("error");
      setErrorMessage("Unable to add app. Please try again.");
      setTimeout(() => {
        setAddStatus("idle");
        setErrorMessage("");
      }, 3000);
    }
  }, [isAppAdded, refreshStateFromContext]);

  const handleClose = useCallback(() => {
    if (addStatus === "adding") return;
    setIsOpen(false);
    setAddStatus("idle");
    setErrorMessage("");
    // Mark as shown when they dismiss
    localStorage.setItem(storageKey, "true");
  }, [addStatus, storageKey]);

  // Auto-close after successful add
  useEffect(() => {
    if (isAppAdded) {
      localStorage.setItem(storageKey, "true");
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isAppAdded, storageKey]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-in fade-in-0"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
        <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-black p-6 shadow-2xl">
          {/* Close button */}
          <button
            onClick={handleClose}
            disabled={addStatus === "adding"}
            className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="mb-4 flex justify-center">
            <div className="rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-800 p-4">
              <img
                src="/media/icon.png"
                alt="Sprinkles"
                className="h-16 w-16"
              />
            </div>
          </div>

          {/* Content */}
          <div className="mb-6 text-center">
            <h2 className="mb-2 text-2xl font-bold text-white">
              Add Sprinkles
            </h2>
            <p className="text-sm text-gray-400">
              Earn & Burn Sprinkles while competing in weekly USDC Leaderboards.
            </p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-center">
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Add to Farcaster Button */}
            <Button
              onClick={handleAddToFarcaster}
              disabled={addStatus === "adding" || isAppAdded}
              className={cn(
                "w-full gap-2 rounded-xl py-6 text-base font-bold transition-all",
                !isAppAdded && addStatus === "idle" && "bg-white hover:bg-gray-200 text-black",
                isAppAdded && "bg-green-600 hover:bg-green-600 text-white",
                addStatus === "error" && "bg-red-600 hover:bg-red-600 text-white"
              )}
            >
              {addStatus === "adding" && (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Adding to Farcaster...</span>
                </>
              )}
              {isAppAdded && (
                <>
                  <Check className="h-5 w-5" />
                  <span>Added Successfully!</span>
                </>
              )}
              {addStatus === "error" && !isAppAdded && (
                <>
                  <AlertCircle className="h-5 w-5" />
                  <span>Try Again</span>
                </>
              )}
              {addStatus === "idle" && !isAppAdded && (
                <>
                  <Plus className="h-5 w-5" />
                  <span>Add to Farcaster</span>
                </>
              )}
            </Button>

            <Button
              onClick={handleClose}
              disabled={addStatus === "adding"}
              variant="ghost"
              className="w-full text-gray-400 hover:text-white hover:bg-zinc-800"
            >
              Not Right Now
            </Button>
          </div>

          {/* Benefits list */}
          <div className="mt-6 space-y-2 border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Quick access to the $Donut Auction and $Sprinkles Auction!</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Compete in weekly USDC, Donut, & Sprinkles reward leaderboards!</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Chat with fellow $Donut ecosystem enjoyers and earn rewards!</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function useAddToFarcasterDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    open,
    close,
    Dialog: () => <AddToFarcasterDialog showOnFirstVisit={false} />,
  };
}