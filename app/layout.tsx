import "@/app/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

const appDomain = "https://sprinkles.wtf";

const miniAppEmbed = {
  version: "1",
  imageUrl: `${appDomain}/media/hero.png`,
  button: {
    title: "SPRINKLE SPRINKLE",
    action: {
      type: "launch_miniapp" as const,
      name: "Sprinkles",
      url: appDomain,
      splashImageUrl: `${appDomain}/media/loading.png`,
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  title: "Sprinkles",
  description: "Play Games to earn Donut, Sprinkles, and USDC rewards on base!",
  openGraph: {
    title: "Sprinkles",
    description: "Play Games to earn Donut, Sprinkles, and USDC rewards on base!",
    url: appDomain,
    images: [
      {
        url: `${appDomain}/media/hero.png`,
      },
    ],
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}