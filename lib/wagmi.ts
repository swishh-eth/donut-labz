import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { fallback, http, createStorage, cookieStorage } from "wagmi";
import { base } from "wagmi/chains";
import { createConfig } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";

// Primary RPC from env (Alchemy) with fallbacks
const baseTransports = [
  // Primary - your paid Alchemy plan
  http(process.env.NEXT_PUBLIC_BASE_RPC_URL, { timeout: 10_000 }),
  // Fallbacks in case Alchemy fails
  http("https://mainnet.base.org", { timeout: 15_000 }),
  http("https://base.llamarpc.com", { timeout: 15_000 }),
  http("https://1rpc.io/base", { timeout: 15_000 }),
  http("https://base.meowrpc.com", { timeout: 15_000 }),
];

export const wagmiConfig = createConfig({
  chains: [base],
  ssr: true,
  connectors: [
    farcasterMiniApp(),
    injected({
      shimDisconnect: true,
    }),
    coinbaseWallet({ appName: "Sprinkles" }),
  ],
  transports: {
    [base.id]: fallback(baseTransports),
  },
  storage: createStorage({
    storage: cookieStorage,
  }),
  pollingInterval: 8_000,
});