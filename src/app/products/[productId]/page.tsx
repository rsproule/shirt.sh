import { extractProductMetadata, getPrintifyProduct } from "@/lib/services/printify-product";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

type Props = {
  params: Promise<{ productId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params;

  try {
    const product = await getPrintifyProduct(productId);
    const metadata = extractProductMetadata(product);

    const imageUrl = product.images[0]?.src || "/shirt.png";
    const totalPrice = product.variants[0]?.price || 2500;

    return {
      title: product.title,
      description: metadata?.description || product.description,
      openGraph: {
        title: product.title,
        description: metadata?.description || product.description,
        images: [
          {
            url: imageUrl,
            width: 1024,
            height: 1024,
            alt: product.title,
          },
        ],
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: product.title,
        description: metadata?.description || product.description,
        images: [imageUrl],
      },
    };
  } catch (error) {
    return {
      title: "Product Not Found",
      description: "This product could not be found",
    };
  }
}

export default async function ProductPage({ params }: Props) {
  const { productId } = await params;

  try {
    const product = await getPrintifyProduct(productId);
    const metadata = extractProductMetadata(product);

    const imageUrl = product.images[0]?.src || "/shirt.png";
    const totalPrice = product.variants[0]?.price || 2500;

    return (
      <div className="container mx-auto py-8 px-4">
        <Link
          href="/test-products"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6"
        >
          ← Back to Test Products
        </Link>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Product Image */}
            <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <Image src={imageUrl} alt={product.title} fill className="object-cover" unoptimized />
            </div>

            {/* Product Details */}
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">{product.title}</h1>
                <p className="text-gray-600">{metadata?.description || product.description}</p>
              </div>

              <div className="border-t border-b py-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Product ID:</span>
                  <span className="font-mono text-sm">{productId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Price:</span>
                  <span className="font-semibold text-lg">${(totalPrice / 100).toFixed(2)}</span>
                </div>
                {metadata && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Price:</span>
                      <span>${(metadata.basePrice / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Creator Margin:</span>
                      <span className="text-green-600 font-medium">
                        ${(metadata.margin / 100).toFixed(2)}
                      </span>
                    </div>
                    {metadata.creatorAddress && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Creator:</span>
                        <span className="font-mono">
                          {metadata.creatorAddress.slice(0, 6)}...
                          {metadata.creatorAddress.slice(-4)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Available Sizes:</h3>
                <div className="flex flex-wrap gap-2">
                  {product.variants
                    .filter((v) => v.is_enabled)
                    .map((variant) => (
                      <div key={variant.id} className="px-3 py-2 border rounded bg-gray-50 text-sm">
                        {variant.sku}
                      </div>
                    ))}
                </div>
              </div>

              <div className="pt-4">
                <Link
                  href={`/test-products?productId=${productId}`}
                  className="w-full inline-block text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Order This Product
                </Link>
              </div>

              {/* Social Sharing Preview */}
              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-3 text-sm">Social Sharing Preview:</h3>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <div className="relative aspect-[1.91/1] bg-gray-200">
                    <Image
                      src={imageUrl}
                      alt={product.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm">{product.title}</div>
                    <div className="text-xs text-gray-600 line-clamp-2">
                      {metadata?.description || product.description}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This is how your product will appear when shared on social media
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
          <p className="text-gray-600 mb-6">
            The product you're looking for doesn't exist or has been removed.
          </p>
          <Link
            href="/test-products"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Back to Test Products
          </Link>
        </div>
      </div>
    );
  }
}
