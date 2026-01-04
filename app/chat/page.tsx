"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Send, MessageCircle, X, Timer, Heart, Image as ImageIcon, User, Reply, CornerDownRight } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { GLAZERY_CHAT_ADDRESS, GLAZERY_CHAT_ABI } from "@/lib/contracts/glazery-chat";
import { SprinklesClaimButton } from "@/components/sprinkles-claim-button";
import { cn } from "@/lib/utils";

// Sprinkles coin logo component
const SprinklesCoin = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span className={`${className} rounded-full overflow-hidden inline-flex items-center justify-center flex-shrink-0`}>
    <img src="/coins/sprinkles_logo.png" alt="SPRINKLES" className="w-full h-full object-cover" />
  </span>
);

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type ChatMessage = {
  sender: string;
  message: string;
  timestamp: bigint;
  transactionHash: string;
  blockNumber: bigint;
  imageUrl?: string;
  replyToHash?: string;
  airdropAmount?: number;
};

type FarcasterProfile = {
  fid: number | null;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  neynarScore: number | null;
};

type TipSettings = {
  amount: string;
};

const SPRINKLES_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as `0x${string}`;
const IMAGE_DISTRIBUTION_WALLET = "0x322BcC769f879549E0c20daFf3e1cbD64A1cf0f1" as `0x${string}`; // Bot wallet for distributing to chatters
const IMAGE_UPLOAD_COST = 10n * 10n ** 18n; // 10 SPRINKLES (1 each to last 10 chatters)

const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const CHAT_REWARDS_START_TIME = 1765159200; // December 8th, 2025 2:00 AM UTC (aligned with SPRINKLES miner halving)
const HALVING_PERIOD = 30 * 24 * 60 * 60;
const MULTIPLIER_SCHEDULE = [2, 1, 0.5, 0.25, 0];
const MIN_SPRINKLES_FOR_REWARDS = 100000; // 100,000 SPRINKLES to earn

const getCurrentMultiplier = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  
  // If rewards haven't started yet, return the initial multiplier
  if (elapsed < 0) return MULTIPLIER_SCHEDULE[0];
  
  const halvings = Math.floor(elapsed / HALVING_PERIOD);
  if (halvings >= MULTIPLIER_SCHEDULE.length) return 0;
  return MULTIPLIER_SCHEDULE[halvings];
};

const getTimeUntilNextHalving = () => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - CHAT_REWARDS_START_TIME;
  
  // If rewards haven't started yet, show time until start
  if (elapsed < 0) {
    const secondsRemaining = CHAT_REWARDS_START_TIME - now;
    const days = Math.floor(secondsRemaining / 86400);
    const hours = Math.floor((secondsRemaining % 86400) / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);
    if (days > 0) return `Starts in ${days}d ${hours}h`;
    if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
    return `Starts in ${minutes}m`;
  }
  
  const currentPeriod = Math.floor(elapsed / HALVING_PERIOD);
  if (currentPeriod >= MULTIPLIER_SCHEDULE.length - 1) return null;
  const nextHalvingTime = CHAT_REWARDS_START_TIME + ((currentPeriod + 1) * HALVING_PERIOD);
  const secondsRemaining = nextHalvingTime - now;
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const timeAgo = (timestamp: bigint) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const DEFAULT_TIP_SETTINGS: TipSettings = {
  amount: "1",
};

const PRESET_AMOUNTS = ["1", "10", "100"];

export default function ChatPage() {
  const readyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showTipSettings, setShowTipSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [pendingMessageConfirmed, setPendingMessageConfirmed] = useState(false);
  const [pendingMessageFadingOut, setPendingMessageFadingOut] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [rateLimitBanRemaining, setRateLimitBanRemaining] = useState(0);
  const [eligibilityError, setEligibilityError] = useState<string[] | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [currentMultiplier, setCurrentMultiplier] = useState(getCurrentMultiplier());
  const [timeUntilHalving, setTimeUntilHalving] = useState(getTimeUntilNextHalving());
  const [tippingMessageHash, setTippingMessageHash] = useState<string | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 1, bottom: 0 });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const [readyToAnimate, setReadyToAnimate] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const pendingReplyToHashRef = useRef<string | null>(null);

  const [tipSettings, setTipSettings] = useState<TipSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat-tip-settings-v2');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_TIP_SETTINGS;
        }
      }
    }
    return DEFAULT_TIP_SETTINGS;
  });
  const [tempTipSettings, setTempTipSettings] = useState<TipSettings>(tipSettings);
  const [customAmount, setCustomAmount] = useState("");

  useEffect(() => {
    localStorage.setItem('chat-tip-settings-v2', JSON.stringify(tipSettings));
  }, [tipSettings]);

  const COOLDOWN_SECONDS = 30;
  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: tipHash, writeContract: writeTip, isPending: isTipPending, reset: resetTip } = useWriteContract();
  const { isLoading: isTipConfirming, isSuccess: isTipSuccess } = useWaitForTransactionReceipt({ hash: tipHash });

  // For burning SPRINKLES when uploading images
  const { data: burnHash, writeContract: writeBurn, isPending: isBurnPending, reset: resetBurn } = useWriteContract();
  const { isLoading: isBurnConfirming, isSuccess: isBurnSuccess } = useWaitForTransactionReceipt({ hash: burnHash });

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      
      if (scrollHeight > 0) {
        const topFade = Math.min(1, scrollTop / 100);
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 100);
        setScrollFade({ top: topFade, bottom: bottomFade });
      } else {
        setScrollFade({ top: 0, bottom: 0 });
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMultiplier(getCurrentMultiplier());
      setTimeUntilHalving(getTimeUntilNextHalving());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rateLimitBanRemaining <= 0) return;
    const timer = setInterval(() => {
      setRateLimitBanRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitBanRemaining]);

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as any).context) as MiniAppContext;
        if (!cancelled) setContext(ctx);
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages?limit=20");
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      return data.messages
        .filter((m: any) => !m.is_system_message)
        .map((m: any) => ({
          sender: m.sender,
          message: m.message,
          timestamp: BigInt(m.timestamp),
          transactionHash: m.transaction_hash,
          blockNumber: BigInt(m.block_number),
          imageUrl: m.image_url || null,
          replyToHash: m.reply_to_hash || null,
          airdropAmount: m.airdrop_amount || 0,
        })) as ChatMessage[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["chat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/chat/leaderboard?limit=50");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const userPoints = statsData?.leaderboard?.find(
    (entry: { address: string; total_points: number }) =>
      entry.address.toLowerCase() === address?.toLowerCase()
  )?.total_points || 0;

  const senderAddresses = [...new Set(messages?.map((m) => m.sender.toLowerCase()) || [])];

  const { data: profilesData } = useQuery<{ profiles: Record<string, FarcasterProfile | null> }>({
    queryKey: ["chat-profiles-batch", senderAddresses.join(",")],
    queryFn: async () => {
      if (senderAddresses.length === 0) return { profiles: {} };
      const res = await fetch(`/api/profiles?addresses=${encodeURIComponent(senderAddresses.join(","))}`);
      if (!res.ok) return { profiles: {} };
      return res.json();
    },
    enabled: senderAddresses.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const messageHashes = messages?.map(m => m.transactionHash) || [];
  const { data: tipCountsData, refetch: refetchTipCounts } = useQuery<{ tips: Record<string, number> }>({
    queryKey: ["chat-tips", messageHashes.join(",")],
    queryFn: async () => {
      if (messageHashes.length === 0) return { tips: {} };
      const res = await fetch(`/api/chat/tips?hashes=${encodeURIComponent(messageHashes.join(","))}`);
      if (!res.ok) return { tips: {} };
      return res.json();
    },
    enabled: messageHashes.length > 0,
    staleTime: 30000,
  });

  const tipCounts = tipCountsData?.tips || {};
  const profiles = profilesData?.profiles || {};

  useEffect(() => {
    if (isTipSuccess && tippingMessageHash) {
      const recordTip = async () => {
        try {
          const msg = messages?.find(m => m.transactionHash === tippingMessageHash);
          if (msg) {
            await fetch("/api/chat/tips", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageHash: tippingMessageHash,
                fromAddress: address,
                toAddress: msg.sender,
                amount: tipSettings.amount,
                token: "sprinkles",
              }),
            });
            refetchTipCounts();
          }
        } catch (e) {
          console.error("Failed to record tip:", e);
        }
      };
      recordTip();
      setTippingMessageHash(null);
      resetTip();
    }
  }, [isTipSuccess, tippingMessageHash, resetTip, refetchTipCounts, messages, address, tipSettings]);

  const recordPoints = useCallback(async () => {
    if (!address) return;
    try {
      await fetch("/api/chat/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address, message: pendingMessage }),
      });
      queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
    } catch (e) {
      console.error("Failed to record points:", e);
    }
  }, [address, queryClient, pendingMessage]);

  useEffect(() => {
    if (isSuccess && hash) {
      const completeMessage = async () => {
        // If we uploaded an image, save the image URL to the message
        // Use ref for reliable access (state might not be updated yet due to React batching)
        const imageUrlToSave = pendingImageUrlRef.current;
        const replyToHashToSave = pendingReplyToHashRef.current;
        const normalizedHash = hash.toLowerCase(); // Ensure consistent case
        
        if (imageUrlToSave && imageUrlToSave.startsWith("http")) {
          try {
            const saveRes = await fetch("/api/chat/save-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                transactionHash: normalizedHash,
                imageUrl: imageUrlToSave,
              }),
            });
            if (!saveRes.ok) {
              console.error("Failed to save image URL:", await saveRes.text());
            }
          } catch (e) {
            console.error("Failed to save image URL:", e);
          }
        }
        
        // Save reply relationship
        if (replyToHashToSave) {
          try {
            await fetch("/api/chat/save-reply", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                transactionHash: normalizedHash,
                replyToHash: replyToHashToSave,
              }),
            });
          } catch (e) {
            console.error("Failed to save reply:", e);
          }
        }
        
        recordPoints();
        setMessage("");
        clearSelectedImage();
        setReplyingTo(null);
        setCooldownRemaining(COOLDOWN_SECONDS);
        setPendingMessageConfirmed(true);
        
        // Clear image and reply state AFTER save calls complete
        setPendingImageUrl(null);
        pendingImageUrlRef.current = null;
        pendingReplyToHashRef.current = null;
        
        // Wait longer for blockchain to propagate, then sync and invalidate cache
        setTimeout(async () => {
          await fetch("/api/chat/messages?sync=true");
          // Invalidate cache to force fresh fetch
          queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
          await refetchMessages();
          
          // Second sync attempt after another delay to catch any stragglers
          setTimeout(async () => {
            await fetch("/api/chat/messages?sync=true");
            queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
            await refetchMessages();
          }, 2000);
          
          setPendingMessageFadingOut(true);
          setTimeout(() => {
            setPendingMessage("");
            setPendingMessageConfirmed(false);
            setPendingMessageFadingOut(false);
          }, 400);
        }, 4000);
      };
      completeMessage();
    }
  }, [isSuccess, hash, recordPoints, refetchMessages, queryClient]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedImage) || !isConnected || isPending || isConfirming || cooldownRemaining > 0 || rateLimitBanRemaining > 0 || isVerifying || isBurnPending || isBurnConfirming || isUploadingImage) return;
    
    if (currentMultiplier === 0) {
      setEligibilityError(["Chat rewards have ended. You can still send messages but won't earn sprinkles."]);
      setTimeout(() => setEligibilityError(null), 3000);
    }
    
    setEligibilityError(null);
    setIsVerifying(true);
    try {
      const verifyRes = await fetch("/api/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress: address, message: message.trim() || (selectedImage ? "📷" : "") }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.eligible) {
        if (verifyData.rateLimitBan && verifyData.banSecondsRemaining) {
          setRateLimitBanRemaining(verifyData.banSecondsRemaining);
        }
        setEligibilityError(verifyData.reasons || ["Not eligible to send messages"]);
        setIsVerifying(false);
        return;
      }
      
      setPendingMessage(message.trim() || (selectedImage ? "📷" : ""));
      setIsVerifying(false);
      
      // Store reply hash in ref for reliable access
      if (replyingTo) {
        pendingReplyToHashRef.current = replyingTo.transactionHash;
      }
      
      // If there's an image, burn SPRINKLES first
      if (selectedImage) {
        setPendingImageUrl(imagePreview); // Show preview while uploading
        writeBurn({
          address: SPRINKLES_ADDRESS,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [IMAGE_DISTRIBUTION_WALLET, IMAGE_UPLOAD_COST],
        });
      } else {
        // No image, send message directly
        writeContract({
          address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
          abi: GLAZERY_CHAT_ABI,
          functionName: "sendMessage",
          args: [message.trim()],
        });
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      setEligibilityError(["Something went wrong, try again"]);
      setPendingMessage("");
      setPendingImageUrl(null);
      setIsVerifying(false);
    }
  };

  const handleTip = async (recipientAddress: string, messageHash: string) => {
    if (!isConnected || isTipPending || isTipConfirming) return;
    if (recipientAddress.toLowerCase() === address?.toLowerCase()) return;
    
    try {
      await sdk.haptics.impactOccurred("light");
    } catch {}
    
    const amount = parseUnits(tipSettings.amount, 18);
    
    setTippingMessageHash(messageHash);
    writeTip({
      address: SPRINKLES_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipientAddress as `0x${string}`, amount],
    });
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
    try {
      sdk.haptics.impactOccurred("light").catch(() => {});
    } catch {}
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const openUserProfile = async (username: string | null) => {
    if (!username) return;
    const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
    try {
      await sdk.actions.openUrl(`https://warpcast.com/${cleanUsername}`);
    } catch {
      window.open(`https://warpcast.com/${cleanUsername}`, "_blank", "noopener,noreferrer");
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith("image/")) {
      setEligibilityError(["Please select an image file"]);
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setEligibilityError(["Image must be less than 5MB"]);
      return;
    }
    
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const uploadImageToSupabase = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("senderAddress", address || "");
      
      const res = await fetch("/api/chat/upload-image", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to upload image");
      }
      
      const data = await res.json();
      return data.url;
    } catch (e) {
      console.error("Failed to upload image:", e);
      return null;
    }
  };

  // Handle burn success - upload image and send message
  useEffect(() => {
    if (isBurnSuccess && burnHash && selectedImage && pendingMessage !== undefined) {
      const completeImageUpload = async () => {
        setIsUploadingImage(true);
        try {
          const imageUrl = await uploadImageToSupabase(selectedImage);
          if (imageUrl) {
            setPendingImageUrl(imageUrl);
            pendingImageUrlRef.current = imageUrl; // Store in ref for reliable access
            
            // Trigger the distribution to last 10 chatters (fire and forget)
            fetch('/api/chat/distribute-image-tips', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                triggerTxHash: burnHash,
                senderAddress: address 
              }),
            }).catch(e => console.error('Distribution trigger failed:', e));
            
            // Now send the actual chat message
            writeContract({
              address: GLAZERY_CHAT_ADDRESS as `0x${string}`,
              abi: GLAZERY_CHAT_ABI,
              functionName: "sendMessage",
              args: [message.trim() || "📷"],
            });
          } else {
            setEligibilityError(["Failed to upload image. SPRINKLES were sent but image upload failed."]);
            clearSelectedImage();
          }
        } catch (e) {
          console.error("Image upload error:", e);
          setEligibilityError(["Failed to upload image"]);
        }
        setIsUploadingImage(false);
        resetBurn();
      };
      completeImageUpload();
    }
  }, [isBurnSuccess, selectedImage]);

  // Messages are displayed oldest first, scroll to bottom on load
  const hasInitialScrolledRef = useRef(false);
  const prevMessagesLengthRef = useRef(0);
  
  useEffect(() => {
    if (!hasInitialScrolledRef.current && messages && messages.length > 0 && !messagesLoading) {
      // Small delay to ensure messages render with opacity: 0 first
      requestAnimationFrame(() => {
        setReadyToAnimate(true);
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
            hasInitialScrolledRef.current = true;
            prevMessagesLengthRef.current = messages.length;
          }
          // Mark animation as complete after all messages have animated
          setTimeout(() => setHasAnimatedIn(true), messages.length * 30 + 300);
        });
      });
    }
  }, [messages, messagesLoading]);
  
  // Scroll to bottom when new messages arrive (but not on initial load)
  useEffect(() => {
    if (hasInitialScrolledRef.current && messages && messages.length > prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = messages.length;
      const container = messagesContainerRef.current;
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  }, [messages?.length]);

  // Scroll to bottom when pendingMessage is set (to show spinner)
  useEffect(() => {
    if (pendingMessage && !pendingMessageConfirmed) {
      const container = messagesContainerRef.current;
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  }, [pendingMessage, pendingMessageConfirmed]);

  const userDisplayName = context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

  const formatBanTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const openTipSettings = () => {
    setTempTipSettings(tipSettings);
    setCustomAmount("");
    setShowTipSettings(true);
  };

  const saveTipSettings = () => {
    const finalAmount = customAmount || tempTipSettings.amount;
    const parsed = parseFloat(finalAmount);
    if (isNaN(parsed) || parsed <= 0) {
      return;
    }
    setTipSettings({ amount: finalAmount });
    setShowTipSettings(false);
  };

  const rewardsEnded = currentMultiplier === 0;

  // Helper to find the message being replied to
  const getReplyMessage = (replyToHash: string | undefined) => {
    if (!replyToHash || !messages) return null;
    return messages.find(m => m.transactionHash.toLowerCase() === replyToHash.toLowerCase());
  };

  return (
    <main className="flex h-[100dvh] w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <style jsx global>{`
        .chat-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .chat-scroll::-webkit-scrollbar { display: none; }
        .help-dialog-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .help-dialog-scroll::-webkit-scrollbar { display: none; }
        @keyframes messagePopIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-messagePopIn {
          animation: messagePopIn 0.3s ease-out forwards;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
      `}</style>

      <div 
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2 shadow-inner" 
        style={{ 
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)", 
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)" 
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden relative">
          <div className="flex-shrink-0">
            <Header title="CHAT" user={context?.user} />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            {/* Your Sprinkles Tile */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center h-[80px]">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-white" />
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Your Sprinkles</span>
              </div>
              <div className="text-2xl font-bold text-white fade-in-up stagger-1 opacity-0">{typeof userPoints === 'number' ? userPoints.toFixed(2) : '0.00'}</div>
            </div>
            <SprinklesClaimButton userFid={context?.user?.fid} compact hideClaimAmount />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
            <button onClick={() => setShowHelpDialog(true)} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] hover:bg-zinc-800 transition-colors">
              <div className="flex items-center justify-center h-full">
                <span className="text-xs font-bold text-white">HOW TO EARN</span>
              </div>
            </button>
            <button onClick={openTipSettings} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 h-[36px] hover:bg-zinc-800 transition-colors">
              <div className="flex items-center justify-center gap-2 h-full">
                <span className="text-xs font-bold text-white">TIP SETTINGS</span>
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <SprinklesCoin className="w-3 h-3" />
                  {tipSettings.amount}
                </span>
              </div>
            </button>
          </div>

          {/* Help Dialog */}
          {showHelpDialog && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                  <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10">
                    <X className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2 flex-shrink-0">
                    <MessageCircle className="w-4 h-4 text-white" />
                    How to Earn Sprinkles
                  </h2>
                  <div className="space-y-3 overflow-y-auto flex-1 help-dialog-scroll">
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Hold 100,000 SPRINKLES</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">You must hold at least 100,000 SPRINKLES to earn rewards.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Send Onchain Messages</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Every message earns sprinkles. Stored permanently on Base.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">3</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Halving Schedule</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Rewards halve every 30 days: 2x → 1x → 0.5x → 0.25x → 0 (ends). Aligned with SPRINKLES miner halving.</div>
                        {!rewardsEnded && (
                          <div className="mt-1.5 flex items-center gap-2 bg-white/5 border border-white/20 rounded-lg px-2 py-1.5">
                            <Timer className="w-3 h-3 text-white" />
                            <span className="text-[11px] text-white font-medium">
                              Current: {currentMultiplier.toFixed(1)}x • {timeUntilHalving ? (timeUntilHalving.startsWith('Starts') ? timeUntilHalving : `Halving in ${timeUntilHalving}`) : 'Final period'}
                            </span>
                          </div>
                        )}
                        {rewardsEnded && (
                          <div className="mt-1.5 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1.5">
                            <span className="text-[11px] text-red-400 font-medium">Rewards have ended</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">4</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Image Airdrop Game</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Upload an image for 10 SPRINKLES → automatically distributed to the last 10 unique chatters (1 each). Be active to catch airdrops!</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white">5</div>
                      <div>
                        <div className="font-semibold text-white text-xs">Weekly Airdrop</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Claim earned points as real SPRINKLES tokens every Friday!</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">!</div>
                      <div>
                        <div className="font-semibold text-red-400 text-xs">Rate Limit</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Max 5 messages per 5 minutes to prevent spam.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">!</div>
                      <div>
                        <div className="font-semibold text-red-400 text-xs">No Duplicate Messages</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Repeated messages will be blocked to prevent spam.</div>
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">!</div>
                      <div>
                        <div className="font-semibold text-red-400 text-xs">No SPRINKLES = No Earnings</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">Anyone can chat, but you won't earn points without holding 100,000 SPRINKLES.</div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowHelpDialog(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors flex-shrink-0">Got it</button>
                </div>
              </div>
            </div>
          )}

          {/* Tip Settings Dialog */}
          {showTipSettings && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowTipSettings(false)} />
              <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
                <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                  <button onClick={() => setShowTipSettings(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white z-10">
                    <X className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <SprinklesCoin className="w-4 h-4" />
                    Tip Settings
                  </h2>
                  
                  <div className="mb-4 text-xs text-gray-400">
                    Set how much SPRINKLES to send when tipping messages.
                  </div>

                  <div className="mb-4">
                    <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Amount</label>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {PRESET_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          onClick={() => {
                            setTempTipSettings({ amount: amt });
                            setCustomAmount("");
                          }}
                          className={cn(
                            "p-3 rounded-lg border text-sm font-semibold transition-all flex items-center justify-center gap-1",
                            tempTipSettings.amount === amt && !customAmount
                              ? "border-white bg-white/10 text-white"
                              : "border-zinc-700 bg-zinc-900 text-gray-400 hover:border-zinc-600"
                          )}
                        >
                          <SprinklesCoin className="w-3 h-3" />
                          {amt}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder="Custom amount..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-white transition-colors"
                        min="0.01"
                        step="0.01"
                      />
                      {customAmount && (
                        <button
                          onClick={() => setCustomAmount("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Preview</div>
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-white fill-white/50" />
                      <span className="text-base font-bold text-white flex items-center gap-1">
                        {customAmount || tempTipSettings.amount} <SprinklesCoin className="w-4 h-4" /> SPRINKLES
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={saveTipSettings} 
                    className="w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors"
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages container */}
          <div 
            ref={messagesContainerRef} 
            className="flex-1 overflow-y-auto space-y-2 min-h-0 chat-scroll pb-14"
            style={{
              WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
              transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
            }}
          >
            {messagesLoading || (!readyToAnimate && messages && messages.length > 0) ? (
              <div />
            ) : (!messages || messages.length === 0) && !pendingMessage ? (
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4"><MessageCircle className="w-8 h-8 text-gray-600" /></div>
                <h3 className="text-lg font-semibold text-white mb-2">No messages yet</h3>
                <p className="text-sm text-gray-400 text-center max-w-xs">Be the first to send an onchain message!</p>
              </div>
            ) : (
              <>
                {messages?.map((msg, index) => {
                  const profile = profiles?.[msg.sender.toLowerCase()];
                  const displayName = profile?.displayName || formatAddress(msg.sender);
                  const username = profile?.username ? `@${profile.username}` : null;
                  const avatarUrl = profile?.pfpUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.sender.toLowerCase()}`;
                  const isOwnMessage = address?.toLowerCase() === msg.sender.toLowerCase();
                  const isTipping = tippingMessageHash === msg.transactionHash;
                  const tipCount = tipCounts[msg.transactionHash] || 0;
                  
                  // Get replied message info
                  const repliedMsg = getReplyMessage(msg.replyToHash);
                  const repliedProfile = repliedMsg ? profiles?.[repliedMsg.sender.toLowerCase()] : null;
                  const repliedDisplayName = repliedProfile?.displayName || (repliedMsg ? formatAddress(repliedMsg.sender) : null);

                  return (
                    <div 
                      key={`${msg.transactionHash}-${index}`} 
                      className={`flex gap-2 p-2 rounded-lg ${isOwnMessage ? "bg-zinc-800 border border-zinc-700" : "bg-zinc-900 border border-zinc-800"} ${!hasAnimatedIn ? 'animate-messagePopIn' : ''}`}
                      style={!hasAnimatedIn ? {
                        opacity: 0,
                        animationDelay: `${index * 30}ms`,
                        animationFillMode: 'forwards',
                      } : undefined}
                    >
                      <button onClick={() => openUserProfile(username)} disabled={!username} className={`flex-shrink-0 ${username ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                        <Avatar className="h-8 w-8 border border-zinc-700">
                          <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                          <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(displayName)}</AvatarFallback>
                        </Avatar>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <button onClick={() => openUserProfile(username)} disabled={!username} className={`font-semibold text-white text-xs truncate ${username ? "hover:text-gray-300" : ""}`}>{displayName}</button>
                          {username && <button onClick={() => openUserProfile(username)} className="text-[10px] text-gray-500 truncate hover:text-gray-300">{username}</button>}
                        </div>
                        
                        {/* Reply indicator - show original message being replied to */}
                        {repliedMsg && (
                          <div className="flex items-start gap-1 mb-1 pl-1 border-l-2 border-zinc-600">
                            <CornerDownRight className="w-3 h-3 text-zinc-500 flex-shrink-0 mt-0.5" />
                            <div className="text-[10px] text-zinc-500 truncate">
                              <span className="font-medium">{repliedDisplayName}</span>: {repliedMsg.message.slice(0, 50)}{repliedMsg.message.length > 50 ? '...' : ''}
                            </div>
                          </div>
                        )}
                        
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="Chat image" 
                            className="max-w-full max-h-[400px] rounded-lg border border-zinc-700 mb-1 object-contain"
                          />
                        )}
                        {msg.message && msg.message !== "📷" && (
                          <p className="text-xs text-gray-300 break-words">{msg.message}</p>
                        )}
                        {/* Airdrop badge - shows when this message received SPRINKLES from an image upload */}
                        {(msg.airdropAmount ?? 0) > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] font-bold text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <SprinklesCoin className="w-3 h-3" />
                              +{msg.airdropAmount}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Time and action buttons in a row */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-gray-600">{timeAgo(msg.timestamp)}</span>
                        {/* Reply button */}
                        <button 
                          onClick={() => handleReply(msg)} 
                          disabled={!isConnected}
                          className={`flex items-center justify-center w-[28px] h-[28px] rounded-lg transition-all ${!isConnected ? "" : "hover:bg-white/10"}`}
                          title={!isConnected ? "Connect wallet to reply" : "Reply"}
                        >
                          <Reply className="w-3.5 h-3.5 text-gray-500 hover:text-white transition-colors" />
                        </button>
                        {/* Tip button */}
                        <button onClick={() => handleTip(msg.sender, msg.transactionHash)} disabled={!isConnected || isOwnMessage || isTipPending || isTipConfirming} className={`flex flex-col items-center justify-center w-[28px] h-[28px] rounded-lg transition-all ${isTipping ? "bg-white/20" : tipCount > 0 ? "bg-white/10" : (!isConnected || isOwnMessage) ? "" : "hover:bg-white/10"}`} title={!isConnected ? "Connect wallet to tip" : isOwnMessage ? "Can't tip yourself" : `Tip ${tipSettings.amount} SPRINKLES`}>
                          <Heart className={`w-3.5 h-3.5 transition-colors ${isTipping ? "text-white animate-pulse fill-white" : tipCount > 0 ? "text-white fill-white/50" : "text-gray-500"}`} />
                          {tipCount > 0 && <span className="text-[7px] font-bold text-white -mt-0.5">{tipCount}</span>}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {pendingMessage && (
                  <div className={`flex gap-2 p-2 rounded-lg bg-zinc-800 border border-zinc-700 transition-all duration-500 ease-out ${
                    pendingMessageFadingOut 
                      ? "opacity-0 scale-95" 
                      : pendingMessageConfirmed 
                        ? "opacity-100" 
                        : "opacity-80"
                  }`}>
                    <Avatar className="h-8 w-8 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={userAvatarUrl || undefined} alt={userDisplayName} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">{initialsFrom(userDisplayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-white text-xs truncate">{userDisplayName}</span>
                      </div>
                      {pendingImageUrl && (
                        <img 
                          src={pendingImageUrl} 
                          alt="Uploading" 
                          className="max-w-full max-h-[400px] rounded-lg border border-zinc-700 mb-1 object-contain opacity-70"
                        />
                      )}
                      {pendingMessage && pendingMessage !== "📷" && (
                        <p className={`text-xs break-words transition-colors duration-500 ${
                          pendingMessageConfirmed ? "text-gray-300" : "text-gray-400"
                        }`}>{pendingMessage}</p>
                      )}
                    </div>
                    {/* Loading spinner */}
                    {!pendingMessageConfirmed && (
                      <div className="flex items-center flex-shrink-0">
                        <svg className="w-5 h-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Floating chat input */}
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-20">
            <div className="pointer-events-auto bg-gradient-to-t from-black via-black to-transparent pt-3">
              <div className="pb-2">
                {!isConnected ? (
                <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-sm text-gray-400">Connect wallet to send messages</p>
                </div>
              ) : (
                <>
                  {eligibilityError && (
                    <div className="mb-2 flex rounded-xl overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                      <div className="flex-1 bg-red-950/50 border border-red-500/50 border-r-0 rounded-l-xl p-3">
                        <div className="flex items-start gap-2">
                          <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-red-400 mb-1">Cannot Send Message</p>
                            <ul className="space-y-1">
                              {eligibilityError.map((reason, i) => <li key={i} className="text-[11px] text-red-300/80 leading-relaxed">{reason}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setEligibilityError(null)} className="flex items-center justify-center px-4 bg-red-900/30 border border-red-500/50 border-l-0 rounded-r-xl hover:bg-red-900/50 transition-colors">
                        <X className="w-4 h-4 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
                      </button>
                    </div>
                  )}
                  {rateLimitBanRemaining > 0 && (
                    <div className="mb-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-red-400">Rate limited! Too many messages.</span>
                      </div>
                      <div className="text-sm font-bold text-red-400">{formatBanTime(rateLimitBanRemaining)}</div>
                    </div>
                  )}
                  {(isTipPending || isTipConfirming) && (
                    <div className="mb-2 bg-white/10 border border-white/30 rounded-xl p-2 flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4 text-white animate-pulse" />
                      <span className="text-xs text-white flex items-center gap-1">
                        {isTipPending ? "Confirm tip in wallet..." : <>Sending {tipSettings.amount} <SprinklesCoin className="w-3 h-3" /> SPRINKLES...</>}
                      </span>
                    </div>
                  )}
                  {isTipSuccess && (
                    <div className="mb-2 bg-white/10 border border-white/30 rounded-xl p-2 flex items-center justify-center gap-2">
                      <Heart className="w-4 h-4 text-white fill-white" />
                      <span className="text-xs text-white flex items-center gap-1">
                        Tip sent! <SprinklesCoin className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                  
                  {/* Reply preview - shown above input when replying */}
                  {replyingTo && (
                    <div className="mb-2 bg-zinc-900 border border-zinc-700 rounded-xl p-2 flex items-center gap-2">
                      <CornerDownRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-zinc-400">Replying to <span className="font-semibold text-white">{profiles?.[replyingTo.sender.toLowerCase()]?.displayName || formatAddress(replyingTo.sender)}</span></div>
                        <div className="text-xs text-zinc-500 truncate">{replyingTo.message.slice(0, 60)}{replyingTo.message.length > 60 ? '...' : ''}</div>
                      </div>
                      <button onClick={cancelReply} className="p-1 hover:bg-zinc-800 rounded transition-colors">
                        <X className="w-4 h-4 text-zinc-500 hover:text-white" />
                      </button>
                    </div>
                  )}
                  
                  {/* Image preview - shown above input when image selected */}
                  {imagePreview && (
                    <div className="mb-2 relative inline-block">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="h-24 w-auto rounded-lg border border-zinc-700 object-cover"
                      />
                      <button
                        onClick={clearSelectedImage}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center hover:bg-zinc-700 transition-colors"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-white flex items-center gap-1">
                        -10 <SprinklesCoin className="w-2.5 h-2.5" /> to recent chatters
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2 h-11">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isPending || isConfirming || isVerifying || isBurnPending || isBurnConfirming || isUploadingImage}
                      className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-50 ${
                        selectedImage ? "text-white bg-zinc-700" : "text-gray-400 hover:text-white hover:bg-zinc-800"
                      }`}
                      title="Add image (10 SPRINKLES)"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      value={message}
                      onChange={(e) => { setMessage(e.target.value.slice(0, 280)); if (eligibilityError) setEligibilityError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                      placeholder={replyingTo ? "Write a reply..." : selectedImage ? "Add caption (optional)..." : "Type a message..."}
                      disabled={isPending || isConfirming || isVerifying || isBurnPending || isBurnConfirming || isUploadingImage}
                      className="flex-1 bg-transparent text-white placeholder-gray-500 text-base px-1 py-1 outline-none disabled:opacity-50 min-w-0"
                      style={{ fontSize: '16px' }}
                    />
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{message.length}/280</span>
                    <button 
                      onClick={handleSendMessage} 
                      disabled={(!message.trim() && !selectedImage) || isPending || isConfirming || isVerifying || isBurnPending || isBurnConfirming || isUploadingImage} 
                      className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
                    >
                      {isVerifying || isUploadingImage ? <span className="text-xs font-bold">...</span> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  
                  {(isPending || isConfirming) && <p className="text-[10px] text-gray-400 text-center mt-1">{isPending ? "Confirm in wallet..." : "Confirming transaction..."}</p>}
                  {(isBurnPending || isBurnConfirming) && <p className="text-[10px] text-gray-400 text-center mt-1">{isBurnPending ? "Confirm 10 SPRINKLES burn..." : "Burning SPRINKLES..."}</p>}
                  {isUploadingImage && <p className="text-[10px] text-gray-400 text-center mt-1">Uploading image...</p>}
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}