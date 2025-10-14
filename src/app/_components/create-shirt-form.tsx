"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type TCreateShirt, type TShirtJob, CreateShirtBody } from "@/lib/contracts/shirt";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useWalletClient } from "wagmi";
import { Signer, wrapFetchWithPayment } from "x402-fetch";

type Mode = "prompt" | "image";

type FormData = {
  prompt: string;
  size: string;
  color: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  address1: string;
  address2: string;
  city: string;
  zip: string;
};

export function CreateShirtForm() {
  const { data: walletClient } = useWalletClient();
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [mode, setMode] = useState<Mode>("prompt");
  const [imageFile, setImageFile] = useState<string>("");
  const [imageUrl, setImageUrl] = useState("");

  const [formData, setFormData] = useState(() => {
    // Try to load saved address from localStorage
    if (typeof window !== "undefined") {
      const savedAddress = localStorage.getItem("shirtslop-address");
      if (savedAddress) {
        try {
          const parsed = JSON.parse(savedAddress);
          return {
            prompt: "",
            size: "XL",
            color: "White",
            ...parsed,
          };
        } catch (e) {
          console.error("Failed to parse saved address:", e);
        }
      }
    }

    // Default empty address
    return {
      prompt: "",
      size: "XL",
      color: "White",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      country: "US",
      region: "",
      address1: "",
      address2: "",
      city: "",
      zip: "",
    };
  });

  // Auto-open address edit form if no address is saved
  useEffect(() => {
    if (!formData.first_name || !formData.address1 || !formData.email) {
      setIsEditingAddress(true);
    }
  }, []);

  // Type-safe mutation for prompt-based shirts
  const createShirtMutation = useMutation({
    mutationFn: async (data: TCreateShirt) => {
      if (!walletClient) {
        throw new Error("Wallet not connected");
      }

      const validated = CreateShirtBody.parse(data);
      const paymentFetch = wrapFetchWithPayment(
        fetch,
        walletClient as unknown as Signer,
        BigInt(25_000_000),
      );

      const response = await paymentFetch("/api/shirts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validated),
      });

      const result = await response.json();

      if (response.ok && response.status === 200) {
        return result as TShirtJob;
      } else {
        throw result;
      }
    },
  });

  // Type-safe mutation for image-based shirts
  const createShirtFromImageMutation = useMutation({
    mutationFn: async (data: {
      imageUrl: string;
      size: string;
      color: string;
      address_to: any;
    }) => {
      if (!walletClient) {
        throw new Error("Wallet not connected");
      }

      const paymentFetch = wrapFetchWithPayment(
        fetch,
        walletClient as unknown as Signer,
        BigInt(25_000_000),
      );

      const response = await paymentFetch("/api/shirts/from-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok && response.status === 200) {
        return result as TShirtJob;
      } else {
        throw result;
      }
    },
  });

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setImageFile(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const addressPayload = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      phone: formData.phone || undefined,
      country: formData.country,
      region: formData.region,
      address1: formData.address1,
      address2: formData.address2,
      city: formData.city,
      zip: formData.zip,
    };

    if (mode === "prompt") {
      // Prompt-based creation
      const payload: TCreateShirt = {
        prompt: formData.prompt,
        size: formData.size as "S" | "M" | "L" | "XL" | "2XL" | "3XL" | "4XL" | "5XL",
        color: formData.color as "Black" | "White",
        address_to: addressPayload,
      };
      createShirtMutation.mutate(payload);
    } else {
      // Image-based creation
      const finalImageUrl = imageFile || imageUrl;
      if (!finalImageUrl) {
        alert("Please provide an image");
        return;
      }

      const payload = {
        imageUrl: finalImageUrl,
        size: formData.size,
        color: formData.color,
        address_to: addressPayload,
      };
      createShirtFromImageMutation.mutate(payload);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev: FormData) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">
            Create custom AI-generated shirts • $25.00 per order
          </p>
        </div>

        {/* Main Form Card */}
        <Card className="shadow-lg">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode("prompt")}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    mode === "prompt"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AI Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setMode("image")}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    mode === "image"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Your Image
                </button>
              </div>

              {/* Prompt Section */}
              {mode === "prompt" ? (
                <div className="space-y-2">
                  <label
                    htmlFor="prompt"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Design Prompt
                  </label>
                  <Textarea
                    id="prompt"
                    name="prompt"
                    value={formData.prompt}
                    onChange={handleChange}
                    placeholder="e.g., minimalist line art of a peregrine falcon in flight, black and white"
                    required
                    minLength={10}
                    maxLength={4000}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">10-4000 characters</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="text-sm font-medium">Upload Image</label>

                  {/* Drag & Drop Zone */}
                  <div
                    onDrop={handleImageDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onPaste={handlePaste}
                    className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFile}
                      className="hidden"
                      id="image-upload"
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <div className="space-y-2">
                        <div className="text-muted-foreground">
                          Drag & drop, paste, or click to upload
                        </div>
                        <div className="text-xs text-muted-foreground">Supports PNG, JPG, GIF</div>
                      </div>
                    </label>
                  </div>

                  {/* Or Image URL */}
                  <div className="space-y-2">
                    <label htmlFor="imageUrl" className="text-sm font-medium">
                      Or paste image URL
                    </label>
                    <Input
                      id="imageUrl"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/image.png"
                    />
                  </div>

                  {/* Preview */}
                  {(imageFile || imageUrl) && (
                    <div className="border rounded-lg p-4 bg-muted">
                      <p className="text-sm font-medium mb-2">Preview:</p>
                      <img
                        src={imageFile || imageUrl}
                        alt="Preview"
                        className="w-full max-w-sm rounded border"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Size and Color Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="size" className="text-sm font-medium leading-none">
                    Size
                  </label>
                  <select
                    id="size"
                    name="size"
                    value={formData.size}
                    onChange={(e) =>
                      setFormData((prev: FormData) => ({ ...prev, size: e.target.value }))
                    }
                    className="w-full p-2 border rounded-md bg-background"
                  >
                    <option value="S">Small</option>
                    <option value="M">Medium</option>
                    <option value="L">Large</option>
                    <option value="XL">X-Large</option>
                    <option value="2XL">2X-Large</option>
                    <option value="3XL">3X-Large</option>
                    <option value="4XL">4X-Large</option>
                    <option value="5XL">5X-Large</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="color" className="text-sm font-medium leading-none">
                    Color
                  </label>
                  <select
                    id="color"
                    name="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev: FormData) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    className="w-full p-2 border rounded-md bg-background"
                  >
                    <option value="Black">Black</option>
                    <option value="White">White</option>
                  </select>
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Shipping Details</span>
                </div>
              </div>

              {/* Address Section - Collapsed or Expanded */}
              {!isEditingAddress ? (
                // Collapsed View
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {formData.first_name} {formData.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formData.address1}
                        {formData.address2 && `, ${formData.address2}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formData.city}, {formData.region} {formData.zip}
                      </p>
                      <p className="text-sm text-muted-foreground">{formData.country}</p>
                      <p className="text-sm text-muted-foreground">{formData.email}</p>
                      {formData.phone && (
                        <p className="text-sm text-muted-foreground">{formData.phone}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingAddress(true)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ) : (
                // Expanded Edit View
                <div className="space-y-4">
                  {/* Name Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="first_name" className="text-sm font-medium leading-none">
                        First Name
                      </label>
                      <Input
                        id="first_name"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        placeholder="John"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="last_name" className="text-sm font-medium leading-none">
                        Last Name
                      </label>
                      <Input
                        id="last_name"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>

                  {/* Contact Fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium leading-none">
                        Email
                      </label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="john@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium leading-none">
                        Phone <span className="text-muted-foreground">(Optional)</span>
                      </label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                  </div>

                  {/* Address Fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="address1" className="text-sm font-medium leading-none">
                        Street Address
                      </label>
                      <Input
                        id="address1"
                        name="address1"
                        value={formData.address1}
                        onChange={handleChange}
                        placeholder="123 Main Street"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="address2" className="text-sm font-medium leading-none">
                        Apartment, suite, etc.{" "}
                        <span className="text-muted-foreground">(Optional)</span>
                      </label>
                      <Input
                        id="address2"
                        name="address2"
                        value={formData.address2}
                        onChange={handleChange}
                        placeholder="Apt 4B"
                      />
                    </div>
                  </div>

                  {/* City, Region, Zip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="city" className="text-sm font-medium leading-none">
                        City
                      </label>
                      <Input
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        placeholder="New York"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="region" className="text-sm font-medium leading-none">
                        State/Region
                      </label>
                      <Input
                        id="region"
                        name="region"
                        value={formData.region}
                        onChange={handleChange}
                        placeholder="NY"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="zip" className="text-sm font-medium leading-none">
                        ZIP Code
                      </label>
                      <Input
                        id="zip"
                        name="zip"
                        value={formData.zip}
                        onChange={handleChange}
                        placeholder="10001"
                        required
                      />
                    </div>
                  </div>

                  {/* Country */}
                  <div className="space-y-2">
                    <label htmlFor="country" className="text-sm font-medium leading-none">
                      Country Code
                    </label>
                    <Input
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      placeholder="US"
                      required
                      maxLength={2}
                      className="uppercase"
                    />
                    <p className="text-xs text-muted-foreground">
                      2-letter ISO code (e.g., US, CA, GB, DE)
                    </p>
                  </div>

                  {/* Save Button */}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      // Save address to localStorage
                      const addressData = {
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        email: formData.email,
                        phone: formData.phone,
                        country: formData.country,
                        region: formData.region,
                        address1: formData.address1,
                        address2: formData.address2,
                        city: formData.city,
                        zip: formData.zip,
                      };
                      localStorage.setItem("shirtslop-address", JSON.stringify(addressData));
                      setIsEditingAddress(false);
                    }}
                    className="w-full"
                  >
                    Save Address
                  </Button>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={
                  mode === "prompt"
                    ? createShirtMutation.isPending
                    : createShirtFromImageMutation.isPending
                }
                className="w-full"
                size="lg"
              >
                {(
                  mode === "prompt"
                    ? createShirtMutation.isPending
                    : createShirtFromImageMutation.isPending
                ) ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Processing Payment...
                  </>
                ) : (
                  "Create Shirt • $25.00"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Success Result */}
        {((mode === "prompt" && createShirtMutation.isSuccess && createShirtMutation.data) ||
          (mode === "image" &&
            createShirtFromImageMutation.isSuccess &&
            createShirtFromImageMutation.data)) && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-950">
            <CardHeader>
              <CardTitle className="text-green-900 dark:text-green-100">
                ✓ Shirt Created Successfully!
              </CardTitle>
              <CardDescription>Your custom shirt has been created and ordered</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const data =
                  mode === "prompt" ? createShirtMutation.data : createShirtFromImageMutation.data;
                if (!data) return null;

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Job ID:</span>
                      <code className="font-mono text-xs">{data.id}</code>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="font-medium capitalize">{data.status}</span>
                    </div>
                    {data.imageUrl && (
                      <div className="space-y-2">
                        <span className="text-muted-foreground text-sm">Design:</span>
                        <img
                          src={data.imageUrl}
                          alt="Shirt design"
                          className="w-full rounded-lg border"
                        />
                      </div>
                    )}
                    {data.productId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Product ID:</span>
                        <code className="font-mono text-xs">{data.productId}</code>
                      </div>
                    )}
                    {data.orderId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Order ID:</span>
                        <code className="font-mono text-xs">{data.orderId}</code>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Error Result */}
        {(createShirtMutation.isError || createShirtFromImageMutation.isError) && (
          <Card className="border-red-500 bg-red-50 dark:bg-red-950">
            <CardHeader>
              <CardTitle className="text-red-900 dark:text-red-100">✕ Error</CardTitle>
              <CardDescription>
                {(
                  (mode === "prompt"
                    ? createShirtMutation.error
                    : createShirtFromImageMutation.error) as any
                )?.error?.message || "An error occurred"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto p-4 bg-red-100 dark:bg-red-900/50 rounded">
                {JSON.stringify(
                  mode === "prompt"
                    ? createShirtMutation.error
                    : createShirtFromImageMutation.error,
                  null,
                  2,
                )}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
