"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleUserRound, HelpCircle, X, MessageCircle, Sparkles, Trophy, ImagePlus } from "lucide-react";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, parseUnits, zeroAddress, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SPRINKLES_MINER_ADDRESS, SPRINKLES_MINER_ABI, DONUT_ADDRESS, DONUT_ABI } from "@/lib/contracts/sprinkles";
import { cn, getEthPrice } from "@/lib/utils";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

type Slot0 = {
  locked: number;
  epochId: number;
  initPrice: bigint;
  startTime: number;
  dps: bigint;
  miner: Address;
  uri: string;
};

type RecentMiner = {
  address: string;
  username: string | null;
  pfpUrl: string | null;
  fid: number | null;
  amount: string;
  message: string;
  imageUrl: string | null;
  timestamp: number;
};

const SPRINKLES_DECIMALS = 18;
const DONUT_DECIMALS = 18;
const DEADLINE_BUFFER_SECONDS = 15 * 60;
const AUCTION_DURATION = 3600;
const MIN_PRICE = 1n * 10n ** 18n;

const SPRINKLES_DONUT_PAIR = "0x47E8b03017d8b8d058bA5926838cA4dD4531e668";
const TREASURY_ADDRESS = "0x4c1599CB84AC2CceDfBC9d9C2Cb14fcaA5613A9d" as const;
const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
const IMAGE_FEE = 1n * 10n ** 18n;

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const DEFAULT_MESSAGES = [
  "Every donut needs sprinkles - Donut Labs",
  "Sprinkling magic on Base - Donut Labs",
  "Powered by Chromium Donut Tech - Donut Labs",
  "Stay glazed, stay based - Donut Labs",
  "The donut shop never closes - Donut Labs",
  "More sprinkles, more fun - Donut Labs",
];

const getRandomDefaultMessage = () => {
  return DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
};

const ANON_PFPS = [
  "/media/anonpfp1.png",
  "/media/anonpfp2.png",
  "/media/anonpfp3.png",
  "/media/anonpfp4.png",
  "/media/anonpfp5.png",
  "/media/anonpfp6.png",
];

const getAnonPfp = (address: string): string => {
  const lastChar = address.slice(-1).toLowerCase();
  const charCode = lastChar.charCodeAt(0);
  const index = charCode % ANON_PFPS.length;
  return ANON_PFPS[index];
};

const formatTokenAmount = (
  value: bigint,
  decimals: number,
  maximumFractionDigits = 2
) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return formatUnits(value, decimals);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const formatAddress = (addr?: string) => {
  if (!addr) return "—";
  const normalized = addr.toLowerCase();
  if (normalized === zeroAddress) return "No miner";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

const formatCompactNumber = (value: string): string => {
  const num = parseFloat(value.replace(/,/g, ''));
  if (isNaN(num)) return value;
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 10_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return value;
};

const calculatePrice = (initPrice: bigint, startTime: number): bigint => {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - startTime;
  
  if (elapsed >= AUCTION_DURATION) return MIN_PRICE;
  
  const priceRange = initPrice - MIN_PRICE;
  const decay = (priceRange * BigInt(elapsed)) / BigInt(AUCTION_DURATION);
  const currentPrice = initPrice - decay;
  
  return currentPrice > MIN_PRICE ? currentPrice : MIN_PRICE;
};

const formatTimeAgo = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

interface SprinklesMinerProps {
  context: MiniAppContext | null;
}

export default function SprinklesMiner({ context }: SprinklesMinerProps) {
  const autoConnectAttempted = useRef(false);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [sprinklesPerDonut, setSprinklesPerDonut] = useState<number>(0);
  const [mineResult, setMineResult] = useState<"success" | "failure" | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState("");
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [pendingTxType, setPendingTxType] = useState<"mine" | "approve" | "imageFee" | null>(null);
  const pendingTxTypeRef = useRef<"mine" | "approve" | "imageFee" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mineResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvalInputRef = useRef<HTMLInputElement>(null);
  const defaultMessageRef = useRef<string>(getRandomDefaultMessage());
  const prevMinerRef = useRef<string>("");
  const [interpolatedPrice, setInterpolatedPrice] = useState<bigint | null>(null);
  const [scrollFade, setScrollFade] = useState({ top: 0, bottom: 1 });
  const [recentMiners, setRecentMiners] = useState<RecentMiner[]>([]);

  const resetMineResult = useCallback(() => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
      mineResultTimeoutRef.current = null;
    }
    setMineResult(null);
  }, []);

  const showMineResult = useCallback((result: "success" | "failure") => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
    }
    setMineResult(result);
    mineResultTimeoutRef.current = setTimeout(() => {
      setMineResult(null);
      mineResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/base/${SPRINKLES_DONUT_PAIR}`);
        const data = await res.json();
        if (data.pair) {
          const priceInDonut = parseFloat(data.pair.priceNative || "0");
          if (priceInDonut > 0) {
            setSprinklesPerDonut(1 / priceInDonut);
          }
        }
      } catch (e) {
        console.error("Failed to fetch SPRINKLES/DONUT price:", e);
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const triggerPulse = () => {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 600);
      const nextPulse = 3000 + Math.random() * 5000;
      setTimeout(triggerPulse, nextPulse);
    };
    const initialDelay = setTimeout(triggerPulse, 2000);
    return () => clearTimeout(initialDelay);
  }, []);

  useEffect(() => {
    return () => {
      if (mineResultTimeoutRef.current) {
        clearTimeout(mineResultTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let animationId: number;
    let position = 0;
    const speed = 0.5;

    const animate = () => {
      position += speed;
      const halfWidth = scrollContainer.scrollWidth / 2;

      if (position >= halfWidth) {
        position = 0;
      }

      scrollContainer.style.transform = `translateX(-${position}px)`;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      if (scrollHeight > 0) {
        const topFade = Math.min(1, scrollTop / 50);
        const bottomFade = Math.min(1, (scrollHeight - scrollTop) / 50);
        setScrollFade({ top: topFade, bottom: bottomFade });
      }
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const fetchRecentMiners = async () => {
      try {
        const res = await fetch('/api/miners/recent?type=sprinkles&limit=10');
        if (res.ok) {
          const data = await res.json();
          setRecentMiners(data.miners || []);
        }
      } catch (error) {
        console.error('Failed to fetch recent miners:', error);
      }
    };

    fetchRecentMiners();
    const interval = setInterval(fetchRecentMiners, 10_000);
    return () => clearInterval(interval);
  }, []);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  const { data: rawSlot0, refetch: refetchSlot0 } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getSlot0",
    chainId: base.id,
    query: { refetchInterval: 10_000 },
  });

  const { data: currentPrice, refetch: refetchPrice } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getPrice",
    chainId: base.id,
    query: { refetchInterval: 20_000 },
  });

  const { data: currentDps } = useReadContract({
    address: SPRINKLES_MINER_ADDRESS,
    abi: SPRINKLES_MINER_ABI,
    functionName: "getDps",
    chainId: base.id,
    query: { refetchInterval: 30_000 },
  });

  const { data: donutBalance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: DONUT_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: base.id,
    query: { refetchInterval: 30_000, enabled: !!address },
  });

  const { data: donutAllowance, refetch: refetchAllowance } = useReadContract({
    address: DONUT_ADDRESS,
    abi: DONUT_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, SPRINKLES_MINER_ADDRESS],
    chainId: base.id,
    query: { refetchInterval: 30_000, enabled: !!address },
  });

  const slot0 = useMemo(() => {
    if (!rawSlot0) return undefined;
    const s = rawSlot0 as any;
    return {
      locked: Number(s.locked ?? s[0]),
      epochId: Number(s.epochId ?? s[1]),
      initPrice: BigInt(s.initPrice ?? s[2]),
      startTime: Number(s.startTime ?? s[3]),
      dps: BigInt(s.dps ?? s[4]),
      miner: (s.miner ?? s[5]) as Address,
      uri: (s.uri ?? s[6]) as string,
    } as Slot0;
  }, [rawSlot0]);

  useEffect(() => {
    if (!slot0) {
      setInterpolatedPrice(null);
      return;
    }
    setInterpolatedPrice(calculatePrice(slot0.initPrice, slot0.startTime));
    const interval = setInterval(() => {
      setInterpolatedPrice(calculatePrice(slot0.initPrice, slot0.startTime));
    }, 1_000);
    return () => clearInterval(interval);
  }, [slot0]);

  const price = interpolatedPrice ?? (currentPrice as bigint | undefined);
  const dps = currentDps as bigint | undefined;

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  // Ref to store the paid amount at mine time (captured BEFORE the transaction)
  const pendingPaidAmountRef = useRef<string | null>(null);

  useEffect(() => {
    if (!receipt) return;
    
    const txType = pendingTxTypeRef.current;
    
    if (receipt.status === "success" || receipt.status === "reverted") {
      showMineResult(receipt.status === "success" ? "success" : "failure");
      
      if (receipt.status === "success") {
        import("@farcaster/miniapp-sdk").then(({ sdk }) => {
          sdk.haptics.notificationOccurred("success").catch(() => {});
        }).catch(() => {});
      }
      
      refetchSlot0();
      refetchPrice();
      refetchAllowance();
      
      if (receipt.status === "success" && txType === "approve") {
        setIsApprovalMode(false);
        setApprovalAmount("");
        setTimeout(() => {
          refetchAllowance();
        }, 1000);
      }
      
      if (receipt.status === "success" && txType === "imageFee") {
        const mineParams = pendingMineParamsRef.current;
        if (mineParams) {
          setTimeout(() => {
            resetWrite();
            if (executeMineRef.current) {
              executeMineRef.current(mineParams);
            }
          }, 500);
          return;
        }
      }
      
      if (receipt.status !== "success" && txType === "imageFee") {
        showMineResult("failure");
        pendingImageUrlRef.current = null;
        pendingMineParamsRef.current = null;
        pendingPaidAmountRef.current = null;
      }
      
      if (receipt.status === "success" && txType === "mine" && address) {
        defaultMessageRef.current = getRandomDefaultMessage();
        pendingMineParamsRef.current = null;
        
        // Capture values immediately before any async operations
        const imageUrl = pendingImageUrlRef.current;
        const txHashToRecord = receipt.transactionHash;
        const paidAmount = pendingPaidAmountRef.current;
        
        console.log('Mine success! Preparing to record glaze:', { imageUrl, txHashToRecord, paidAmount });
        
        const fetchWithRetry = async (url: string, body: object, attempt = 1, maxAttempts = 3): Promise<boolean> => {
          try {
            console.log(`Recording glaze attempt ${attempt}:`, body);
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            
            const responseData = await res.json();
            console.log(`Record glaze response (attempt ${attempt}):`, responseData);
            
            if (!res.ok && attempt < maxAttempts) {
              console.log(`Retrying in 3 seconds...`);
              return new Promise((resolve) => {
                setTimeout(async () => {
                  resolve(await fetchWithRetry(url, body, attempt + 1, maxAttempts));
                }, 3000);
              });
            } else if (res.ok) {
              return true;
            }
            return false;
          } catch (err) {
            console.error(`Record glaze error (attempt ${attempt}):`, err);
            if (attempt < maxAttempts) {
              return new Promise((resolve) => {
                setTimeout(async () => {
                  resolve(await fetchWithRetry(url, body, attempt + 1, maxAttempts));
                }, 3000);
              });
            }
            return false;
          }
        };

        // Call record-glaze with the captured paid amount as fallback
        (async () => {
          try {
            const result = await fetchWithRetry("/api/record-glaze", {
              address: address,
              txHash: txHashToRecord,
              mineType: "sprinkles",
              imageUrl: imageUrl,
              amount: paidAmount, // Pass the captured amount as fallback
            });
            console.log('Record glaze final result:', result);
          } catch (err) {
            console.error('Record glaze failed:', err);
          } finally {
            // Clear refs after recording attempt
            pendingImageUrlRef.current = null;
            pendingPaidAmountRef.current = null;
            setSelectedImage(null);
            setImagePreviewUrl(null);
          }
        })();
        
        // Refresh recent miners after a delay
        setTimeout(async () => {
          try {
            const res = await fetch('/api/miners/recent?type=sprinkles&limit=10');
            if (res.ok) {
              const data = await res.json();
              setRecentMiners(data.miners || []);
            }
          } catch {}
        }, 3000);
      }
      
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
      
      const resetTimer = setTimeout(() => resetWrite(), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [receipt, refetchSlot0, refetchPrice, refetchAllowance, resetWrite, showMineResult, address]);

  const minerAddress = slot0?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;

  useEffect(() => {
    if (prevMinerRef.current && minerAddress !== prevMinerRef.current && minerAddress !== zeroAddress) {
      import("@farcaster/miniapp-sdk").then(({ sdk }) => {
        sdk.haptics.impactOccurred("light").catch(() => {});
      }).catch(() => {});
      
      setTimeout(async () => {
        try {
          const res = await fetch('/api/miners/recent?type=sprinkles&limit=10');
          if (res.ok) {
            const data = await res.json();
            setRecentMiners(data.miners || []);
          }
        } catch {}
      }, 2000);
    }
    prevMinerRef.current = minerAddress;
  }, [minerAddress]);

  const { data: profileData } = useQuery<{
    profiles: Record<string, {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null>;
  }>({
    queryKey: ["cached-profile-sprinkles", minerAddress],
    queryFn: async () => {
      const res = await fetch(`/api/profiles?addresses=${encodeURIComponent(minerAddress)}`);
      if (!res.ok) throw new Error("Failed to load Farcaster profile.");
      return res.json();
    },
    enabled: hasMiner,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const neynarUser = profileData?.profiles?.[minerAddress.toLowerCase()]
    ? { user: profileData.profiles[minerAddress.toLowerCase()] }
    : { user: null };

  const needsApproval = useMemo(() => {
    if (!price || !donutAllowance) return true;
    return (donutAllowance as bigint) < price;
  }, [price, donutAllowance]);

  const parsedApprovalAmount = useMemo(() => {
    if (!approvalAmount || approvalAmount === "") return 0n;
    try {
      return parseUnits(approvalAmount, DONUT_DECIMALS);
    } catch {
      return 0n;
    }
  }, [approvalAmount]);

  const handleApprove = useCallback(async () => {
    if (!address || parsedApprovalAmount === 0n) return;
    setPendingTxType("approve");
    pendingTxTypeRef.current = "approve";
    try {
      await writeContract({
        account: address as Address,
        address: DONUT_ADDRESS,
        abi: DONUT_ABI,
        functionName: "approve",
        args: [SPRINKLES_MINER_ADDRESS, parsedApprovalAmount],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to approve:", error);
      showMineResult("failure");
      resetWrite();
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
    }
  }, [address, parsedApprovalAmount, writeContract, showMineResult, resetWrite]);

  const pendingImageUrlRef = useRef<string | null>(null);
  const pendingMineParamsRef = useRef<{
    targetAddress: string;
    epochId: bigint;
    deadline: bigint;
    maxPrice: bigint;
    message: string;
  } | null>(null);

  const executeMineRef = useRef<((params: {
    targetAddress: string;
    epochId: bigint;
    deadline: bigint;
    maxPrice: bigint;
    message: string;
  }) => Promise<void>) | null>(null);

  const executeMine = useCallback(async (params: {
    targetAddress: string;
    epochId: bigint;
    deadline: bigint;
    maxPrice: bigint;
    message: string;
  }) => {
    setPendingTxType("mine");
    pendingTxTypeRef.current = "mine";
    
    try {
      await writeContract({
        account: params.targetAddress as Address,
        address: SPRINKLES_MINER_ADDRESS,
        abi: SPRINKLES_MINER_ABI,
        functionName: "mine",
        args: [params.targetAddress as Address, zeroAddress, BigInt(params.epochId), params.deadline, params.maxPrice, params.message],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      resetWrite();
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
      pendingImageUrlRef.current = null;
      pendingMineParamsRef.current = null;
      pendingPaidAmountRef.current = null;
    }
  }, [writeContract, showMineResult, resetWrite]);

  useEffect(() => {
    executeMineRef.current = executeMine;
  }, [executeMine]);

  const handleMine = useCallback(async () => {
    if (!slot0 || !price) return;
    await refetchPrice();
    resetMineResult();
    
    // Capture the price BEFORE the transaction - this is what the user will pay
    const priceToPay = (currentPrice as bigint) ?? price;
    const paidAmount = Math.floor(Number(formatUnits(priceToPay, DONUT_DECIMALS))).toString();
    pendingPaidAmountRef.current = paidAmount;
    console.log('Captured paid amount before mine:', paidAmount);
    
    let uploadedImageUrl: string | null = null;
    if (selectedImage) {
      setIsUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedImage);
        formData.append("address", address || "anonymous");
        
        const uploadRes = await fetch("/api/miners/upload-image", {
          method: "POST",
          body: formData,
        });
        
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedImageUrl = uploadData.url;
          pendingImageUrlRef.current = uploadedImageUrl;
        } else {
          console.error("Failed to upload image");
          setIsUploadingImage(false);
          showMineResult("failure");
          pendingPaidAmountRef.current = null;
          return;
        }
      } catch (err) {
        console.error("Failed to upload image:", err);
        setIsUploadingImage(false);
        showMineResult("failure");
        pendingPaidAmountRef.current = null;
        return;
      }
      setIsUploadingImage(false);
    }
    
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available yet.");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address.");

      const epochId = slot0.epochId;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);
      const freshPrice = (currentPrice as bigint) ?? price;
      const maxPrice = freshPrice === 0n ? 0n : (freshPrice * 105n) / 100n;
      const messageToSend = customMessage.trim() || defaultMessageRef.current;

      if (uploadedImageUrl) {
        pendingMineParamsRef.current = {
          targetAddress,
          epochId: BigInt(epochId),
          deadline,
          maxPrice,
          message: messageToSend,
        };
        
        setPendingTxType("imageFee");
        pendingTxTypeRef.current = "imageFee";
        
        await writeContract({
          account: targetAddress as Address,
          address: DONUT_TOKEN_ADDRESS,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [TREASURY_ADDRESS, IMAGE_FEE],
          chainId: base.id,
        });
      } else {
        if (executeMineRef.current) {
          await executeMineRef.current({
            targetAddress,
            epochId: BigInt(epochId),
            deadline,
            maxPrice,
            message: messageToSend,
          });
        }
      }
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      resetWrite();
      setPendingTxType(null);
      pendingTxTypeRef.current = null;
      pendingImageUrlRef.current = null;
      pendingMineParamsRef.current = null;
      pendingPaidAmountRef.current = null;
    }
  }, [address, connectAsync, currentPrice, customMessage, slot0, price, primaryConnector, refetchPrice, resetMineResult, resetWrite, showMineResult, writeContract, selectedImage]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image too large. Max 2MB.");
        return;
      }
      setSelectedImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
    }
  }, []);

  const handleRemoveImage = useCallback(() => {
    setSelectedImage(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }, [imagePreviewUrl]);

  const [mineElapsedSeconds, setMineElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!slot0) { setMineElapsedSeconds(0); return; }
    const startTimeSeconds = slot0.startTime;
    const initialElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
    setMineElapsedSeconds(initialElapsed);
    const interval = setInterval(() => {
      const currentElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
      setMineElapsedSeconds(currentElapsed);
    }, 1_000);
    return () => clearInterval(interval);
  }, [slot0]);

  const earnedSprinkles = useMemo(() => {
    if (!slot0 || !dps) return 0n;
    return BigInt(mineElapsedSeconds) * dps;
  }, [slot0, dps, mineElapsedSeconds]);

  const occupantDisplay = useMemo(() => {
    if (!slot0) return { primary: "—", secondary: "", isYou: false, avatarUrl: null as string | null, isUnknown: true, addressLabel: "—" };
    const minerAddr = slot0.miner;
    const fallback = formatAddress(minerAddr);
    const isYou = !!address && minerAddr.toLowerCase() === (address as string).toLowerCase();
    const fallbackAvatarUrl = getAnonPfp(minerAddr);
    const profile = neynarUser?.user ?? null;
    const profileUsername = profile?.username ? `@${profile.username}` : null;
    const profileDisplayName = profile?.displayName ?? null;
    const contextProfile = context?.user ?? null;
    const contextHandle = contextProfile?.username ? `@${contextProfile.username}` : null;
    const contextDisplayName = contextProfile?.displayName ?? null;
    const addressLabel = fallback;
    const labelCandidates = [profileDisplayName, profileUsername, isYou ? contextDisplayName : null, isYou ? contextHandle : null, addressLabel].filter((label): label is string => !!label);
    const seenLabels = new Set<string>();
    const uniqueLabels = labelCandidates.filter((label) => { const key = label.toLowerCase(); if (seenLabels.has(key)) return false; seenLabels.add(key); return true; });
    const primary = uniqueLabels[0] ?? addressLabel;
    const secondary = uniqueLabels.find((label) => label !== primary && label.startsWith("@")) ?? "";
    const avatarUrl = profile?.pfpUrl ?? (isYou ? contextProfile?.pfpUrl ?? null : null) ?? fallbackAvatarUrl;
    const isUnknown = !profile && !(isYou && (contextHandle || contextDisplayName));
    return { primary, secondary, isYou, avatarUrl, isUnknown, addressLabel };
  }, [address, context?.user, slot0, neynarUser?.user]);

  const mineRateDisplay = dps ? formatTokenAmount(dps, SPRINKLES_DECIMALS, 2) : "—";
  const totalPrice = price ? (selectedImage ? price + IMAGE_FEE : price) : 0n;
  const minePriceDisplay = totalPrice ? Math.floor(Number(formatUnits(totalPrice, DONUT_DECIMALS))).toLocaleString() : "—";
  const earnedDisplay = formatTokenAmount(earnedSprinkles, SPRINKLES_DECIMALS, 0);

  const donutPerSecondDisplay = useMemo(() => {
    if (!dps || sprinklesPerDonut === 0) return null;
    const sprinklesPerSecond = Number(dps) / 1e18;
    const donutEquivalent = sprinklesPerSecond / sprinklesPerDonut;
    if (donutEquivalent < 0.0001) return null;
    return donutEquivalent.toFixed(4);
  }, [dps, sprinklesPerDonut]);

  const earnedInDonut = useMemo(() => {
    if (sprinklesPerDonut === 0) return "0.00";
    const sprinklesNum = Number(formatUnits(earnedSprinkles, SPRINKLES_DECIMALS));
    return (sprinklesNum / sprinklesPerDonut).toFixed(2);
  }, [earnedSprinkles, sprinklesPerDonut]);

  const paidAmountDisplay = slot0 ? formatUnits(slot0.initPrice / 2n, DONUT_DECIMALS).split('.')[0] : '—';

  const pnlData = useMemo(() => {
    if (!slot0 || !slot0.initPrice || !price || sprinklesPerDonut === 0) {
      return { donut: "+🍩0", isPositive: true };
    }
    const paid = slot0.initPrice / 2n;
    const paidNumber = Number(formatUnits(paid, DONUT_DECIMALS));
    const refund = (price * 80n) / 100n;
    const refundNumber = Number(formatUnits(refund, DONUT_DECIMALS));
    const sprinklesEarnedNumber = Number(formatUnits(earnedSprinkles, SPRINKLES_DECIMALS));
    const sprinklesValueInDonut = sprinklesEarnedNumber / sprinklesPerDonut;
    const pnl = sprinklesValueInDonut + refundNumber - paidNumber;
    const isPositive = pnl >= 0;
    return { donut: `${isPositive ? "+" : ""}🍩${Math.floor(Math.abs(pnl)).toLocaleString()}`, isPositive };
  }, [slot0, price, earnedSprinkles, sprinklesPerDonut]);

  const totalPnlUsd = useMemo(() => {
    if (!slot0 || !price || sprinklesPerDonut === 0) return { value: "+$0.00", isPositive: true };
    const paid = slot0.initPrice / 2n;
    const paidNumber = Number(formatUnits(paid, DONUT_DECIMALS));
    const refund = (price * 80n) / 100n;
    const refundNumber = Number(formatUnits(refund, DONUT_DECIMALS));
    const sprinklesEarnedNumber = Number(formatUnits(earnedSprinkles, SPRINKLES_DECIMALS));
    const sprinklesValueInDonut = sprinklesEarnedNumber / sprinklesPerDonut;
    const pnlDonut = sprinklesValueInDonut + refundNumber - paidNumber;
    const total = pnlDonut * 0.00001 * ethUsdPrice;
    return { value: `${total >= 0 ? "+" : "-"}$${Math.abs(total).toFixed(2)}`, isPositive: total >= 0 };
  }, [slot0, price, earnedSprinkles, sprinklesPerDonut, ethUsdPrice]);

  const formatMineTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const mineTimeDisplay = slot0 ? formatMineTime(mineElapsedSeconds) : "—";

  const occupantInitialsSource = occupantDisplay.isUnknown ? occupantDisplay.addressLabel : occupantDisplay.primary || occupantDisplay.addressLabel;
  const occupantFallbackInitials = occupantDisplay.isUnknown ? (occupantInitialsSource?.slice(-2) ?? "??").toUpperCase() : initialsFrom(occupantInitialsSource);

  const donutBalanceDisplay = donutBalance
    ? Math.floor(Number(formatUnits(donutBalance as bigint, DONUT_DECIMALS))).toLocaleString()
    : "—";

  const scrollMessage = slot0?.uri && slot0.uri.trim() !== ""
    ? slot0.uri
    : "Every donut needs sprinkles - Donut Labs";

  const buttonLabel = useMemo(() => {
    if (!slot0 || price === undefined) return "Loading…";
    if (mineResult === "success") return "SUCCESS";
    if (mineResult === "failure") return "FAILED";
    if (isUploadingImage) return "UPLOADING…";
    if (isWriting || isConfirming) {
      if (pendingTxType === "approve") return "APPROVING…";
      if (pendingTxType === "imageFee") return "PAYING FEE…";
      return "MINING…";
    }
    if (needsApproval && !isApprovalMode) return "APPROVE";
    return "MINE";
  }, [mineResult, isConfirming, isWriting, slot0, price, needsApproval, isApprovalMode, pendingTxType, isUploadingImage]);

  const isMineDisabled = !slot0 || price === undefined || isWriting || isConfirming || mineResult !== null || isUploadingImage;
  const isApproveButtonDisabled = isMineDisabled || parsedApprovalAmount === 0n || !approvalAmount;

  const handleViewMinerProfile = useCallback(async () => {
    const fid = neynarUser?.user?.fid;
    const username = neynarUser?.user?.username;
    const url = username ? `https://warpcast.com/${username}` : fid ? `https://warpcast.com/~/profiles/${fid}` : null;
    if (!url) return;
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.openUrl(url);
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [neynarUser?.user?.fid, neynarUser?.user?.username]);

  const handleApproveClick = useCallback(() => {
    if (needsApproval && !isApprovalMode) {
      setIsApprovalMode(true);
      setTimeout(() => approvalInputRef.current?.focus(), 100);
    }
  }, [needsApproval, isApprovalMode]);

  const handleCast = useCallback(async () => {
    const text = `I'm mining some sweet $SPRINKLES ✨\n\nCurrent price: 🍩${minePriceDisplay}`;
    
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({
        text,
        embeds: ["https://donutlabs.vercel.app"],
      });
    } catch (e) {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        const encodedText = encodeURIComponent(text);
        await sdk.actions.openUrl({
          url: `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
        });
      } catch {
        const encodedText = encodeURIComponent(text);
        window.open(
          `https://warpcast.com/~/compose?text=${encodedText}&embeds[]=https://donutlabs.vercel.app`,
          "_blank"
        );
      }
    }
  }, [minePriceDisplay]);

  // Calculate average mine price from recent miners
  const averageMinePrice = useMemo(() => {
    const validAmounts = recentMiners
      .map(m => parseFloat(m.amount))
      .filter(a => !isNaN(a) && a > 0);
    if (validAmounts.length === 0) return null;
    const avg = validAmounts.reduce((sum, a) => sum + a, 0) / validAmounts.length;
    return Math.floor(avg).toLocaleString();
  }, [recentMiners]);

  return (
    <div className="flex flex-col h-full -mx-2 overflow-hidden">
      <style>{`
        .miner-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .miner-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto miner-scroll"
        style={{ 
          WebkitMaskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`,
          maskImage: `linear-gradient(to bottom, ${scrollFade.top > 0.1 ? 'transparent' : 'black'} 0%, black ${scrollFade.top * 8}%, black ${100 - scrollFade.bottom * 8}%, ${scrollFade.bottom > 0.1 ? 'transparent' : 'black'} 100%)`
        }}
      >
        <div className="relative h-[240px] overflow-hidden">
          <style>{`
            @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes pulse-scale { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
            .spin-slow { animation: spin-slow 8s linear infinite; }
            .pulse-scale { animation: pulse-scale 3s ease-in-out infinite; }
            .scrollbar-hide::-webkit-scrollbar { display: none; }
            .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
          
          <div 
            className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
          
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            src="/media/sprinkles-loop.mp4"
          />
          
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div 
              className={cn(
                "flex flex-col items-center pulse-scale",
                neynarUser?.user?.fid && "cursor-pointer pointer-events-auto"
              )}
              onClick={neynarUser?.user?.fid ? handleViewMinerProfile : undefined}
            >
              <div className="rounded-full bg-black p-0.5 spin-slow">
                <Avatar className="h-24 w-24 border-2 border-amber-500/50">
                  <AvatarImage
                    src={occupantDisplay.avatarUrl || undefined}
                    alt={occupantDisplay.primary}
                    className="object-cover bg-black"
                  />
                  <AvatarFallback className="bg-zinc-900 text-white text-lg">
                    {slot0 ? occupantFallbackInitials : <CircleUserRound className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="mt-2 text-center">
                <div className="font-bold text-amber-400 text-sm drop-shadow-lg">{occupantDisplay.primary}</div>
                <div className="text-[10px] text-amber-400/70 drop-shadow-lg">{formatAddress(minerAddress)}</div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] font-bold text-amber-400 drop-shadow-lg uppercase tracking-wider">Current Miner</span>
                <button onClick={() => setShowHelpDialog(true)} className="text-amber-400/70 hover:text-amber-300 pointer-events-auto">
                  <HelpCircle className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          
          <div 
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}
          />
        </div>

        <div className="flex flex-col gap-2 px-2 pt-1 pb-4">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 relative overflow-hidden bg-black border border-zinc-800 rounded-lg">
              <div
                ref={scrollRef}
                className="flex whitespace-nowrap py-1.5 text-xs font-bold text-white"
              >
                {Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} className="inline-block px-8">
                    {scrollMessage}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleCast}
              className="flex items-center gap-1.5 px-3 rounded-lg border border-zinc-800 bg-black hover:bg-zinc-900 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-medium text-white">Cast</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-x-4 gap-y-1">
            <div>
              <div className="text-xs text-gray-500">Paid</div>
              <div className="text-lg font-bold text-white">🍩{paidAmountDisplay}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">PnL</div>
              <div className={cn("text-lg font-bold", pnlData.isPositive ? "text-green-400" : "text-red-400")}>
                {pnlData.donut}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Time</div>
              <div className="text-lg font-bold text-white whitespace-nowrap">
                {(() => {
                  const parts = mineTimeDisplay.split(' ');
                  if (parts.length === 2) {
                    return (
                      <>
                        <span>{parts[0]}</span>
                        <span className="text-sm text-gray-300"> {parts[1]}</span>
                      </>
                    );
                  }
                  return mineTimeDisplay;
                })()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mined</div>
              <div className="text-lg font-bold text-white flex items-center gap-1 whitespace-nowrap">
                <Sparkles className="w-4 h-4 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span>
                  {(() => {
                    const formatted = formatCompactNumber(earnedDisplay);
                    const match = formatted.match(/^([\d,]+)(\.?\d*)([KM]?)$/);
                    if (match) {
                      const [, whole, decimal, suffix] = match;
                      return (
                        <>
                          <span>{whole}</span>
                          {decimal && <span className="text-sm text-gray-300">{decimal}</span>}
                          {suffix && <span className="text-sm text-gray-300">{suffix}</span>}
                        </>
                      );
                    }
                    return formatted;
                  })()}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className={cn("text-lg font-bold", totalPnlUsd.isPositive ? "text-green-400" : "text-red-400")}>
                {totalPnlUsd.value}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mine rate</div>
              <div className="text-lg font-bold text-white flex items-center gap-1">
                <Sparkles className="w-4 h-4 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                <span>{mineRateDisplay}/s</span>
              </div>
              {donutPerSecondDisplay && (
                <div className="text-xs text-green-400">≈ 🍩{donutPerSecondDisplay}/s</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 items-end mt-1">
            <div>
              <div className="text-xs text-gray-500">Mine price</div>
              <div className="text-3xl font-bold text-white">🍩{minePriceDisplay}</div>
              {selectedImage && (
                <div className="text-xs text-amber-400">Includes +1 🍩 image upload fee</div>
              )}
            </div>
            
            <div className="flex flex-col gap-1">
              <div className="text-xs text-gray-500">Balance: 🍩{donutBalanceDisplay}</div>
              
              {needsApproval && isApprovalMode ? (
                <div className="flex w-full rounded-xl overflow-hidden">
                  <input
                    ref={approvalInputRef}
                    type="text"
                    inputMode="decimal"
                    value={approvalAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = value.split('.');
                      if (parts.length > 2) return;
                      setApprovalAmount(value);
                    }}
                    placeholder="Amt"
                    className="w-20 flex-shrink-0 bg-zinc-800 text-white px-2 py-3 text-sm font-bold placeholder-gray-500 focus:outline-none"
                    style={{ fontSize: '16px' }}
                    disabled={isWriting || isConfirming}
                  />
                  <button
                    className={cn(
                      "flex-1 py-3 text-sm font-bold transition-all duration-300",
                      isApproveButtonDisabled
                        ? "bg-zinc-700 text-gray-500 cursor-not-allowed"
                        : "bg-white text-black hover:bg-gray-200",
                      mineResult === "success" && "bg-green-500 text-white",
                      mineResult === "failure" && "bg-red-500 text-white"
                    )}
                    onClick={handleApprove}
                    disabled={isApproveButtonDisabled}
                  >
                    {isWriting || isConfirming ? "..." : "APPROVE"}
                  </button>
                </div>
              ) : (
                <button
                  className={cn(
                    "w-full py-3 rounded-xl text-base font-bold transition-all duration-300",
                    mineResult === "success"
                      ? "bg-green-500 text-white"
                      : mineResult === "failure"
                        ? "bg-red-500 text-white"
                        : isMineDisabled
                          ? "bg-zinc-800 text-gray-500 cursor-not-allowed"
                          : needsApproval
                            ? "bg-white text-black hover:bg-gray-200"
                            : "bg-white text-black hover:bg-gray-200",
                    isPulsing && !isMineDisabled && !mineResult && "scale-[0.95]"
                  )}
                  onClick={needsApproval ? handleApproveClick : handleMine}
                  disabled={isMineDisabled}
                >
                  {buttonLabel}
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a message..."
                maxLength={100}
                className="flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
                style={{ fontSize: '16px' }}
                disabled={isMineDisabled}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isMineDisabled}
                className={cn(
                  "px-3 py-2 rounded-lg border transition-all",
                  selectedImage
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-zinc-800 bg-black text-gray-500 hover:text-white hover:border-zinc-600",
                  isMineDisabled && "opacity-50 cursor-not-allowed"
                )}
                title="Add image (+1 🍩 fee)"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
            </div>
            
            {imagePreviewUrl && (
              <div className="relative w-full">
                <img
                  src={imagePreviewUrl}
                  alt="Preview"
                  className="w-full h-32 rounded-lg border border-zinc-800 object-cover"
                />
                <button
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-1 left-1 bg-black/80 text-amber-400 text-[10px] px-1.5 py-0.5 rounded">
                  +1 🍩 image upload fee
                </div>
              </div>
            )}
          </div>

          <div 
            className="flex flex-col items-center mt-2"
            style={{ opacity: Math.max(0, 1 - scrollFade.top * 0.5) }}
          >
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Scroll down for miner history</div>
          </div>

          {recentMiners.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500 font-semibold">Recent Miners</div>
                {averageMinePrice && (
                  <div className="text-xs text-gray-400">Avg: 🍩{averageMinePrice}</div>
                )}
                <div className="text-xs text-gray-500 font-semibold">Price Paid</div>
              </div>
              <div className="space-y-2">
                {recentMiners.map((miner, index) => (
                  <div 
                    key={`${miner.address}-${miner.timestamp}`}
                    className={cn(
                      "flex gap-3 p-2 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors w-full",
                      miner.imageUrl ? "items-start" : "items-center"
                    )}
                    onClick={async () => {
                      if (miner.fid) {
                        const { sdk } = await import("@farcaster/miniapp-sdk");
                        sdk.actions.viewProfile({ fid: miner.fid }).catch(() => {});
                      } else {
                        const { sdk } = await import("@farcaster/miniapp-sdk");
                        sdk.actions.openUrl({ url: `https://basescan.org/address/${miner.address}` }).catch(() => {});
                      }
                    }}
                  >
                    <Avatar className="h-10 w-10 border border-zinc-700 flex-shrink-0">
                      <AvatarImage src={miner.pfpUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white text-sm">
                        {miner.username ? initialsFrom(miner.username) : miner.address.slice(-2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-base truncate">
                            {miner.username ? `@${miner.username}` : formatAddress(miner.address)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(miner.timestamp)}
                          </span>
                        </div>
                        <span className="text-white text-lg font-bold flex-shrink-0">
                          🍩{!miner.amount || miner.amount === '0' || miner.amount === '' ? '—' : miner.amount}
                        </span>
                      </div>
                      {miner.imageUrl && (
                        <div className="mt-1.5 w-full">
                          <img
                            src={miner.imageUrl}
                            alt="Miner attachment"
                            className="w-full h-32 rounded-lg border border-zinc-700 object-cover"
                            onClick={(e) => {
                              e.stopPropagation();
                              import("@farcaster/miniapp-sdk").then(({ sdk }) => {
                                sdk.actions.openUrl({ url: miner.imageUrl! }).catch(() => {});
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showHelpDialog && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHelpDialog(false)} />
          <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2">
            <div className="relative mx-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
              <button onClick={() => setShowHelpDialog(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-zinc-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                How Mining Works
              </h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">1</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Pay 🍩DONUT to Mine</div>
                    <div className="text-xs text-gray-400 mt-0.5">Pay the current price in DONUT.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">2</div>
                  <div>
                    <div className="font-semibold text-white text-sm flex items-center gap-1">
                      Earn <Sparkles className="w-3 h-3 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />SPRINKLES
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Earn SPRINKLES every second.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">3</div>
                  <div>
                    <div className="font-semibold text-white text-sm">Dutch Auction</div>
                    <div className="text-xs text-gray-400 mt-0.5">Price drops to 🍩1 over 1 hour.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">4</div>
                  <div>
                    <div className="font-semibold text-amber-400 text-sm">Get Paid Back</div>
                    <div className="text-xs text-gray-400 mt-0.5">When outbid, get 80% of their DONUT.</div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 text-center mt-4 flex items-center justify-center gap-1">
                10% of all 🍩DONUT buys and burns <Sparkles className="w-3 h-3 drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />SPRINKLES!
              </p>
              <button onClick={() => setShowHelpDialog(false)} className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}