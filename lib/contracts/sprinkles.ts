export const SPRINKLES_MINER_ADDRESS = "0x4AcfB87F3CDA3Bb2962F54862181c3f2CdcA5fa0" as const;
export const SPRINKLES_TOKEN_ADDRESS = "0x98DCF4D319fd761EE144C8682300A890Df9f4398" as const;
export const DONUT_ADDRESS = "0xAE4a37d554C6D6F3E398546d8566B25052e0169C" as const;

export const SPRINKLES_MINER_ABI = [
  {
    inputs: [],
    name: "getSlot0",
    outputs: [
      {
        components: [
          { internalType: "uint8", name: "locked", type: "uint8" },
          { internalType: "uint16", name: "epochId", type: "uint16" },
          { internalType: "uint192", name: "initPrice", type: "uint192" },
          { internalType: "uint40", name: "startTime", type: "uint40" },
          { internalType: "uint256", name: "dps", type: "uint256" },
          { internalType: "address", name: "miner", type: "address" },
          { internalType: "string", name: "uri", type: "string" },
        ],
        internalType: "struct SprinklesMiner.Slot0",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getDps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "sprinkles",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "donut",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "miner", type: "address" },
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPrice", type: "uint256" },
      { internalType: "string", name: "uri", type: "string" },
    ],
    name: "mine",
    outputs: [{ internalType: "uint256", name: "price", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const DONUT_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const SPRINKLES_TOKEN_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;