export const GLAZERY_CHAT_ADDRESS = "0x543832Fe5EFB216a79f64BE52A24547D6d875685";

export const GLAZERY_CHAT_ABI = [
  {
    type: "function",
    name: "sendMessage",
    inputs: [
      {
        name: "message",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "MessageSent",
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "message",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "timestamp",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
] as const;