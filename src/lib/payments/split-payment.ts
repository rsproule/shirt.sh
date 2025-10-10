import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// USDC contract on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_DECIMALS = 6;

// Base payment address (your main address)
const BASE_PAYMENT_ADDRESS = "0xc0541B06F703c6753B842D83cF62d55F93EE81bE" as const;

/**
 * Transfer USDC from main address to creator address
 * This is called after receiving payment to split the margin with the creator
 */
export async function transferMarginToCreator(params: {
  creatorAddress: string;
  marginInCents: number;
}): Promise<{ txHash: string }> {
  if (!process.env.PAYMENT_SPLITTER_PRIVATE_KEY) {
    throw new Error("PAYMENT_SPLITTER_PRIVATE_KEY not configured");
  }

  // Convert cents to USDC (6 decimals)
  const marginInDollars = params.marginInCents / 100;
  const amount = parseUnits(marginInDollars.toString(), USDC_DECIMALS);

  // Create wallet client
  const account = privateKeyToAccount(process.env.PAYMENT_SPLITTER_PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  // USDC ERC20 transfer
  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: [
      {
        name: "transfer",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "transfer",
    args: [params.creatorAddress as `0x${string}`, amount],
  });

  return { txHash: hash };
}

/**
 * Get the dynamic price for an order based on product metadata
 */
export function calculateOrderPrice(
  basePrice: number,
  margin: number,
): {
  totalInCents: number;
  basePriceInCents: number;
  marginInCents: number;
} {
  return {
    totalInCents: basePrice + margin,
    basePriceInCents: basePrice,
    marginInCents: margin,
  };
}

/**
 * Format price for x402 (converts cents to dollar string)
 */
export function formatPriceForX402(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}



