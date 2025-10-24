import { facilitator } from "@coinbase/x402";
import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { exact } from "x402/schemes";
import { findMatchingPaymentRequirements, processPriceToAtomicAmount } from "x402/shared";
import { SupportedEVMNetworks, type Network } from "x402/types";
import { useFacilitator } from "x402/verify";

const PAY_TO_ADDRESS = "0xDDeAeb4639A7fC213264b57c8dc81a36229687dB";
const x402Version = 1;

/**
 * Payment configuration for an endpoint
 */
export interface PaymentConfig {
  price: string;
  network: Network;
  description: string;
  resource: string;
}

/**
 * Verify that a request has valid x402 payment
 * Returns verification result without settling
 */
export async function verifyPayment(
  req: NextRequest,
  config: PaymentConfig,
): Promise<
  { success: true; payment: any; requirements: any } | { success: false; response: NextResponse }
> {
  const { verify } = useFacilitator(facilitator);

  // Process price to atomic amount
  const atomicAmountForAsset = processPriceToAtomicAmount(config.price, config.network);
  if ("error" in atomicAmountForAsset) {
    return {
      success: false,
      response: NextResponse.json({ error: atomicAmountForAsset.error }, { status: 500 }),
    };
  }

  const { maxAmountRequired, asset } = atomicAmountForAsset;

  // Build payment requirements
  const paymentRequirements = [];
  if (SupportedEVMNetworks.includes(config.network)) {
    paymentRequirements.push({
      scheme: "exact" as const,
      network: config.network,
      maxAmountRequired,
      resource: config.resource,
      description: config.description,
      mimeType: "application/json",
      payTo: getAddress(PAY_TO_ADDRESS),
      maxTimeoutSeconds: 300,
      asset: getAddress(asset.address),
      extra: "eip712" in asset ? asset.eip712 : undefined,
    });
  } else {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Unsupported network: ${config.network}` },
        { status: 500 },
      ),
    };
  }

  // Check for payment header
  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return {
      success: false,
      response: NextResponse.json(
        {
          x402Version,
          error: "X-PAYMENT header is required",
          accepts: paymentRequirements,
        },
        { status: 402 },
      ),
    };
  }

  // Decode payment
  let decodedPayment;
  try {
    decodedPayment = exact.evm.decodePayment(paymentHeader);
    decodedPayment.x402Version = x402Version;
  } catch (error) {
    return {
      success: false,
      response: NextResponse.json(
        {
          x402Version,
          error: error instanceof Error ? error.message : "Invalid payment",
          accepts: paymentRequirements,
        },
        { status: 402 },
      ),
    };
  }

  // Find matching requirements
  const selectedPaymentRequirements = findMatchingPaymentRequirements(
    paymentRequirements,
    decodedPayment,
  );

  if (!selectedPaymentRequirements) {
    return {
      success: false,
      response: NextResponse.json(
        {
          x402Version,
          error: "Unable to find matching payment requirements",
          accepts: paymentRequirements,
        },
        { status: 402 },
      ),
    };
  }

  // Verify payment
  const verification = await verify(decodedPayment, selectedPaymentRequirements);
  if (!verification.isValid) {
    return {
      success: false,
      response: NextResponse.json(
        {
          x402Version,
          error: verification.invalidReason || "Payment verification failed",
          accepts: paymentRequirements,
          payer: verification.payer,
        },
        { status: 402 },
      ),
    };
  }

  // Return success with payment details
  return {
    success: true,
    payment: decodedPayment,
    requirements: selectedPaymentRequirements,
  };
}

/**
 * Settle a verified payment after successful operation
 * Call this ONLY after your operation succeeds
 */
export async function settlePayment(
  payment: any,
  requirements: any,
): Promise<{
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  error?: string;
}> {
  const { settle } = useFacilitator(facilitator);

  try {
    const settlement = await settle(payment, requirements);
    if (settlement.success) {
      return {
        success: true,
        transaction: settlement.transaction,
        network: settlement.network,
        payer: settlement.payer,
      };
    } else {
      return {
        success: false,
        error: "Settlement failed",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Settlement error",
    };
  }
}
