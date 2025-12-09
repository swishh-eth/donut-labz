"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import SpinWheelPage from "@/components/spin-wheel-page";

export default function WheelPage() {
  const { address } = useAccount();
  const [availableSpins, setAvailableSpins] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch user's available spins
  useEffect(() => {
    const fetchSpins = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/spins?address=${address}`);
        const data = await res.json();
        setAvailableSpins(data.availableSpins || 0);
      } catch (err) {
        console.error("Failed to fetch spins:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSpins();
  }, [address]);

  const handleSpinComplete = async () => {
    // Refetch spins after a spin is used or purchased
    if (address) {
      try {
        const res = await fetch(`/api/spins?address=${address}`);
        const data = await res.json();
        setAvailableSpins(data.availableSpins || 0);
      } catch (err) {
        console.error("Failed to refetch spins:", err);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <SpinWheelPage
      availableSpins={availableSpins}
      onSpinComplete={handleSpinComplete}
    />
  );
}