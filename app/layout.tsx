import "@/app/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

const appDomain = "https://donutlabs.vercel.app/";
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;

const miniAppEmbed = {
  version: "1",
  imageUrl: heroImageUrl,
  button: {
    title: "Launch Donut Labs",
    action: {
      type: "launch_miniapp" as const,
      name: "Donut Labs",
      url: appDomain,
      splashImageUrl,
      splashBackgroundColor: "#000000ff",
    },
  },
};

export const metadata: Metadata = {
  title: "Donut Labs",
  description: "Mine $DONUT and compete in weekly leaderboard rewards",
  openGraph: {
    title: "Donut Labs",
    description: "The premium De-Fi (Donut-Finance) experience on base .",
    url: appDomain,
    images: [
      {
        url: heroImageUrl,
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
