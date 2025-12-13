export const DONUT_DICE_ADDRESS = "0x49826C6C884ed7A828c06f75814Acf8bd658bb76" as const;

export const DONUT_DICE_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "target", type: "uint8" },
      { name: "isOver", type: "bool" },
      { name: "commitHash", type: "bytes32" }
    ],
    name: "commitBet",
    outputs: [{ name: "betId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "betId", type: "uint256" },
      { name: "secret", type: "bytes32" }
    ],
    name: "revealBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "claimExpiredBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "betId", type: "uint256" }],
    name: "bets",
    outputs: [
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "target", type: "uint8" },
      { name: "isOver", type: "bool" },
      { name: "commitHash", type: "bytes32" },
      { name: "commitBlock", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "result", type: "uint8" },
      { name: "won", type: "bool" },
      { name: "payout", type: "uint256" },
      { name: "revealedSecret", type: "bytes32" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "player", type: "address" }],
    name: "getPlayerBetIds",
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "player", type: "address" },
      { name: "count", type: "uint256" }
    ],
    name: "getPlayerRecentBets",
    outputs: [
      {
        components: [
          { name: "player", type: "address" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "target", type: "uint8" },
          { name: "isOver", type: "bool" },
          { name: "commitHash", type: "bytes32" },
          { name: "commitBlock", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "result", type: "uint8" },
          { name: "won", type: "bool" },
          { name: "payout", type: "uint256" },
          { name: "revealedSecret", type: "bytes32" }
        ],
        name: "",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "token", type: "address" }],
    name: "getBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "token", type: "address" }],
    name: "getTokenConfig",
    outputs: [
      { name: "enabled", type: "bool" },
      { name: "minBet", type: "uint256" },
      { name: "maxBet", type: "uint256" },
      { name: "totalWagered", type: "uint256" },
      { name: "totalPaidOut", type: "uint256" },
      { name: "balance", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getSupportedTokens",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalBets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextBetId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "betId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: true, name: "token", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "target", type: "uint8" },
      { indexed: false, name: "isOver", type: "bool" },
      { indexed: false, name: "commitHash", type: "bytes32" },
      { indexed: false, name: "commitBlock", type: "uint256" }
    ],
    name: "BetCommitted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "betId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "secret", type: "bytes32" },
      { indexed: false, name: "blockHash", type: "bytes32" },
      { indexed: false, name: "result", type: "uint8" },
      { indexed: false, name: "won", type: "bool" },
      { indexed: false, name: "payout", type: "uint256" }
    ],
    name: "BetRevealed",
    type: "event"
  }
] as const;

// Supported tokens
export const DONUT_TOKEN_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;
export const SPRINKLES_TOKEN_ADDRESS = "0xa890060BE1788a676dBC3894160f5dc5DeD2C98D" as const;

export const SUPPORTED_TOKENS = {
  DONUT: {
    address: DONUT_TOKEN_ADDRESS,
    symbol: "DONUT",
    emoji: "🍩",
    enabled: true,
  },
  SPRINKLES: {
    address: SPRINKLES_TOKEN_ADDRESS,
    symbol: "SPRINKLES",
    emoji: "✨",
    enabled: false, // Coming soon
  },
} as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;