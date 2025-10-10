"use client";

import { ConnectWallet } from "@/app/_components/x402/ConnectWallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { Signer, wrapFetchWithPayment } from "x402-fetch";

export default function TestProductsPage() {
  const { data: walletClient } = useWalletClient();
  const account = useAccount();

  // Product creation state
  const [inputMode, setInputMode] = useState<"prompt" | "url">("prompt");
  const [productForm, setProductForm] = useState({
    prompt: "A minimalist astronaut floating in space",
    imageUrl: "",
    title: "",
    description: "",
    margin: "1000", // $10.00 in cents
    creatorAddress: account.address || "",
    placement: "front",
  });
  const [createdProduct, setCreatedProduct] = useState<any>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  // Order state
  const [orderForm, setOrderForm] = useState({
    productId: "",
    size: "XL",
    color: "White",
    quantity: "1",
    first_name: "Ryan",
    last_name: "Sproule",
    email: "ryan@merit.systems",
    phone: "",
    country: "US",
    region: "NY",
    address1: "300 Kent Ave",
    address2: "604",
    city: "Brooklyn",
    zip: "11249",
  });
  const [pricingInfo, setPricingInfo] = useState<any>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);

  // Update creator address when wallet connects
  useState(() => {
    if (account.address && !productForm.creatorAddress) {
      setProductForm((prev) => ({ ...prev, creatorAddress: account.address! }));
    }
  });

  const handleCreateProduct = async () => {
    setCreatingProduct(true);
    setProductError(null);
    setCreatedProduct(null);

    try {
      if (!walletClient) {
        throw new Error("Please connect your wallet first");
      }

      const payload = {
        prompt: inputMode === "prompt" ? productForm.prompt || undefined : undefined,
        imageUrl: inputMode === "url" ? productForm.imageUrl || undefined : undefined,
        title: productForm.title || undefined,
        description: productForm.description || undefined,
        margin: parseInt(productForm.margin),
        creatorAddress: productForm.creatorAddress,
        placement: productForm.placement,
      };

      const paymentFetch = wrapFetchWithPayment(
        fetch,
        walletClient as unknown as Signer,
        BigInt(1_000_000), // $0.01 in USDC (6 decimals)
      );

      const response = await paymentFetch("/api/shirts/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        setCreatedProduct(result);
        // Auto-populate product ID in order form
        setOrderForm((prev) => ({ ...prev, productId: result.productId }));
      } else {
        throw new Error(result.error?.message || "Failed to create product");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to create product";
      setProductError(errorMessage);

      // If AI generation failed, suggest using image URL mode
      if (errorMessage.includes("AI image generation failed")) {
        console.log("AI generation failed - consider switching to URL mode");
      }
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    setPricingInfo(null);
    setOrderError(null);

    try {
      // First, do a regular fetch to get the 402 response with pricing
      const response = await fetch(`/api/shirts/products/${orderForm.productId}/order`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        setPricingInfo(result);
      } else {
        throw new Error(result.error?.message || "Failed to fetch pricing");
      }
    } catch (error: any) {
      setOrderError(error.message);
    } finally {
      setFetchingPrice(false);
    }
  };

  const handlePlaceOrder = async () => {
    setOrdering(true);
    setOrderError(null);
    setOrderResult(null);

    try {
      if (!walletClient) {
        throw new Error("Please connect your wallet first");
      }

      if (!pricingInfo) {
        throw new Error("Please fetch pricing first");
      }

      const payload = {
        size: orderForm.size,
        color: orderForm.color,
        quantity: parseInt(orderForm.quantity),
        address_to: {
          first_name: orderForm.first_name,
          last_name: orderForm.last_name,
          email: orderForm.email,
          phone: orderForm.phone,
          country: orderForm.country,
          region: orderForm.region,
          address1: orderForm.address1,
          address2: orderForm.address2,
          city: orderForm.city,
          zip: orderForm.zip,
        },
      };

      // Use the price from the pricing info (in cents, convert to USDC with 6 decimals)
      const priceInUsdc = BigInt(pricingInfo.pricing.totalInCents * 10000); // Convert cents to USDC (6 decimals)

      const paymentFetch = wrapFetchWithPayment(
        fetch,
        walletClient as unknown as Signer,
        priceInUsdc,
      );

      const response = await paymentFetch(`/api/shirts/products/${orderForm.productId}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        setOrderResult(result);
      } else {
        throw new Error(result.error?.message || "Failed to place order");
      }
    } catch (error: any) {
      setOrderError(error.message);
    } finally {
      setOrdering(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Test Product Creation & Ordering</h1>
        <ConnectWallet />
      </div>

      {!account.isConnected && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Please connect your wallet to test the product creation and ordering flow
            </p>
          </CardContent>
        </Card>
      )}

      {account.isConnected && (
        <>
          {/* Step 1: Create Product */}
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Create Product</CardTitle>
              <CardDescription>
                Create a shirt product with a custom margin. This costs $0.01.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input Mode Selector */}
              <div className="flex gap-2 p-2 bg-gray-100 rounded-lg">
                <Button
                  type="button"
                  variant={inputMode === "prompt" ? "default" : "ghost"}
                  onClick={() => setInputMode("prompt")}
                  className="flex-1"
                >
                  🎨 AI Generate (Recommended)
                </Button>
                <Button
                  type="button"
                  variant={inputMode === "url" ? "default" : "ghost"}
                  onClick={() => setInputMode("url")}
                  className="flex-1"
                >
                  🔗 Use Image URL
                </Button>
              </div>

              {inputMode === "prompt" ? (
                <div className="space-y-2">
                  <Label htmlFor="prompt">Design Prompt</Label>
                  <Textarea
                    id="prompt"
                    value={productForm.prompt}
                    onChange={(e) => setProductForm({ ...productForm, prompt: e.target.value })}
                    placeholder="A minimalist astronaut floating in space with vibrant colors"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    AI will generate a unique design based on your description
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input
                    id="imageUrl"
                    value={productForm.imageUrl}
                    onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be a publicly accessible image URL (PNG, JPG, etc.)
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                      Example URLs to try
                    </summary>
                    <div className="mt-2 space-y-1 pl-4">
                      <div
                        className="cursor-pointer hover:bg-gray-50 p-1 rounded"
                        onClick={() =>
                          setProductForm({
                            ...productForm,
                            imageUrl: "https://picsum.photos/1024/1024",
                          })
                        }
                      >
                        • Random image from Lorem Picsum
                      </div>
                    </div>
                  </details>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="margin">Margin (cents) - Your profit per shirt</Label>
                  <Input
                    id="margin"
                    type="number"
                    value={productForm.margin}
                    onChange={(e) => setProductForm({ ...productForm, margin: e.target.value })}
                    placeholder="1000"
                  />
                  <p className="text-xs text-muted-foreground">
                    ${(parseInt(productForm.margin || "0") / 100).toFixed(2)} profit
                  </p>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="creatorAddress">Creator Address (receives margin)</Label>
                  <Input
                    id="creatorAddress"
                    value={productForm.creatorAddress}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        creatorAddress: e.target.value,
                      })
                    }
                    placeholder="0x..."
                  />
                </div>
              </div>

              <Button
                onClick={handleCreateProduct}
                disabled={
                  creatingProduct ||
                  !productForm.creatorAddress ||
                  (inputMode === "prompt" && !productForm.prompt) ||
                  (inputMode === "url" && !productForm.imageUrl)
                }
                className="w-full"
              >
                {creatingProduct ? "Creating Product..." : "Create Product ($0.01)"}
              </Button>

              {productError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded space-y-2">
                  <div className="text-red-700 font-medium">❌ Error</div>
                  <div className="text-sm text-red-600">{productError}</div>
                  {productError.includes("AI image generation failed") && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                      <div className="text-sm text-blue-800">
                        💡 <strong>Tip:</strong> Try switching to the "Use Image URL" mode above and
                        provide your own image URL instead.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {createdProduct && (
                <div className="p-4 bg-green-50 border border-green-200 rounded space-y-3">
                  <h4 className="font-semibold text-green-900">✅ Product Created!</h4>

                  {/* Product Preview */}
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="flex gap-3">
                      <div className="w-24 h-24 relative bg-gray-100 rounded overflow-hidden flex-shrink-0">
                        <img
                          src={createdProduct.imageUrl}
                          alt="Product"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{createdProduct.title}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Price: ${(createdProduct.priceInCents / 100).toFixed(2)}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          Your margin: ${(createdProduct.marginInCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm space-y-1">
                    <div>
                      <span className="font-medium">Product ID:</span>{" "}
                      <code className="bg-white px-2 py-1 rounded text-xs">
                        {createdProduct.productId}
                      </code>
                    </div>
                  </div>

                  {/* View Product Page Link */}
                  <div className="pt-2 flex gap-2">
                    <a
                      href={`/products/${createdProduct.productId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                    >
                      📄 View Product Page (with OG tags)
                    </a>
                    <a
                      href={createdProduct.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition text-sm"
                    >
                      🖼️ Image
                    </a>
                  </div>

                  <div className="text-xs text-gray-600 bg-white rounded p-2">
                    💡 The product page includes Open Graph tags for social media sharing
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Fetch Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Check Order Price</CardTitle>
              <CardDescription>
                Fetch the pricing information before placing an order (FREE - no payment required)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="productId">Product ID</Label>
                <Input
                  id="productId"
                  value={orderForm.productId}
                  onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                  placeholder="Enter product ID"
                />
              </div>

              <Button
                onClick={handleFetchPrice}
                disabled={fetchingPrice || !orderForm.productId}
                className="w-full"
                variant="outline"
              >
                {fetchingPrice ? "Fetching Price..." : "Fetch Order Price (FREE)"}
              </Button>

              {pricingInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded space-y-2">
                  <h4 className="font-semibold text-blue-900">💰 Pricing Info</h4>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="font-medium">Product:</span> {pricingInfo.title}
                    </div>
                    <div className="text-lg font-bold text-blue-900">
                      Total Price: {pricingInfo.pricing.totalFormatted}
                    </div>
                    <div className="text-xs space-y-1 mt-2 p-2 bg-white rounded">
                      <div>
                        Base Order Cost: ${(pricingInfo.pricing.basePriceInCents / 100).toFixed(2)}
                      </div>
                      <div>
                        Creator Margin: ${(pricingInfo.pricing.marginInCents / 100).toFixed(2)}
                      </div>
                      {pricingInfo.pricing.creatorAddress && (
                        <div>
                          Creator: {pricingInfo.pricing.creatorAddress.slice(0, 10)}
                          ...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Place Order */}
          {pricingInfo && (
            <Card>
              <CardHeader>
                <CardTitle>Step 3: Place Order</CardTitle>
                <CardDescription>
                  Complete the purchase with x402 payment ({pricingInfo.pricing.totalFormatted})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Size</Label>
                    <select
                      className="w-full p-2 border rounded"
                      value={orderForm.size}
                      onChange={(e) => setOrderForm({ ...orderForm, size: e.target.value })}
                    >
                      <option>S</option>
                      <option>M</option>
                      <option>L</option>
                      <option>XL</option>
                      <option>2XL</option>
                      <option>3XL</option>
                      <option>4XL</option>
                      <option>5XL</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <select
                      className="w-full p-2 border rounded"
                      value={orderForm.color}
                      onChange={(e) => setOrderForm({ ...orderForm, color: e.target.value })}
                    >
                      <option>White</option>
                      <option>Black</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={orderForm.first_name}
                      onChange={(e) => setOrderForm({ ...orderForm, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={orderForm.last_name}
                      onChange={(e) => setOrderForm({ ...orderForm, last_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={orderForm.email}
                    onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={orderForm.address1}
                    onChange={(e) => setOrderForm({ ...orderForm, address1: e.target.value })}
                    placeholder="Street address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={orderForm.city}
                      onChange={(e) => setOrderForm({ ...orderForm, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={orderForm.region}
                      onChange={(e) => setOrderForm({ ...orderForm, region: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input
                      value={orderForm.zip}
                      onChange={(e) => setOrderForm({ ...orderForm, zip: e.target.value })}
                    />
                  </div>
                </div>

                <Button onClick={handlePlaceOrder} disabled={ordering} className="w-full" size="lg">
                  {ordering
                    ? "Processing Order..."
                    : `Place Order (${pricingInfo.pricing.totalFormatted})`}
                </Button>

                {orderError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    {orderError}
                  </div>
                )}

                {orderResult && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded space-y-2">
                    <h4 className="font-semibold text-green-900">🎉 Order Placed Successfully!</h4>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="font-medium">Order ID:</span> {orderResult.orderId}
                      </div>
                      {orderResult.pricing?.splitPaymentTx && (
                        <div>
                          <span className="font-medium">Split Payment Tx:</span>{" "}
                          <a
                            href={`https://basescan.org/tx/${orderResult.pricing.splitPaymentTx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline"
                          >
                            {orderResult.pricing.splitPaymentTx.slice(0, 10)}...
                          </a>
                        </div>
                      )}
                      <div className="mt-2 p-2 bg-white rounded text-xs">
                        <div>
                          Base paid to platform: $
                          {(orderResult.pricing?.basePrice / 100).toFixed(2)}
                        </div>
                        <div>
                          Margin paid to creator: ${(orderResult.pricing?.margin / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
