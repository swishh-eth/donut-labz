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
  storageKey = "donutlabs-add-miniapp-prompt-shown",
}: AddToFarcasterDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "adding" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Check if we should show the dialog on mount
  useEffect(() => {
    if (!showOnFirstVisit) return;

    const checkAndShowDialog = async () => {
      try {
        // First check if app is already added via SDK
        const context = await sdk.context;
        
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

  const handleAddToFarcaster = useCallback(async () => {
    try {
      setStatus("adding");
      setErrorMessage("");

      await sdk.actions.addMiniApp();

      setStatus("success");
      // Mark as shown so we don't prompt again
      localStorage.setItem(storageKey, "true");
      
      setTimeout(() => {
        setIsOpen(false);
        setStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("Failed to add Mini App:", error);

      const errorName = error instanceof Error ? error.name : "";
      if (errorName === "AddMiniApp.RejectedByUser") {
        setStatus("idle");
        // Still mark as shown so we don't nag them
        localStorage.setItem(storageKey, "true");
        setIsOpen(false);
        return;
      }

      setStatus("error");

      const errorMsg = error instanceof Error ? error.message : "Failed to add app";

      if (errorName === "AddMiniApp.InvalidDomainManifest" || errorMsg.includes("domain")) {
        setErrorMessage("App must be on production domain with valid manifest");
      } else if (errorMsg.includes("not supported")) {
        setErrorMessage("This feature is not available in your current environment");
      } else {
        setErrorMessage("Unable to add app. Please try again.");
      }

      setTimeout(() => {
        setStatus("idle");
        setErrorMessage("");
      }, 5000);
    }
  }, [storageKey]);

  const handleClose = useCallback(() => {
    if (status === "adding") return;
    setIsOpen(false);
    setStatus("idle");
    setErrorMessage("");
    // Mark as shown when they dismiss
    localStorage.setItem(storageKey, "true");
  }, [status, storageKey]);

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
            disabled={status === "adding"}
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
                alt="DonutLabs"
                className="h-16 w-16"
              />
            </div>
          </div>

          {/* Content */}
          <div className="mb-6 text-center">
            <h2 className="mb-2 text-2xl font-bold text-white">
              Install Sprinkles
            </h2>
            <p className="text-sm text-gray-400">
              Earn & Burn Sprinkles while chatting with fellow $Donut enjoyers.
            </p>
          </div>

          {/* Error message */}
          {status === "error" && errorMessage && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-center">
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleAddToFarcaster}
              disabled={status === "adding" || status === "success"}
              className={cn(
                "w-full gap-2 rounded-xl py-6 text-base font-bold transition-all",
                status === "idle" && "bg-white hover:bg-gray-200 text-black",
                status === "success" && "bg-green-600 hover:bg-green-600 text-white",
                status === "error" && "bg-red-600 hover:bg-red-600 text-white"
              )}
            >
              {status === "adding" && (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Adding to Farcaster...</span>
                </>
              )}
              {status === "success" && (
                <>
                  <Check className="h-5 w-5" />
                  <span>Added Successfully!</span>
                </>
              )}
              {status === "error" && (
                <>
                  <AlertCircle className="h-5 w-5" />
                  <span>Try Again</span>
                </>
              )}
              {status === "idle" && (
                <>
                  <Plus className="h-5 w-5" />
                  <span>Add to Farcaster</span>
                </>
              )}
            </Button>

            <Button
              onClick={handleClose}
              disabled={status === "adding"}
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
              <span>Quick access to the Global $Donut Auction and $Sprinkles Mines!</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Compete in weekly ETH, Donut, & Sprinkles reward leaderboards powered by in app glazes.</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              <span>Talk with fellow $Donut enjoyers in the glazery chat. Earn Sprinkles & claim weekly every friday.</span>
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