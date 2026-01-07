import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    accountAssociation: {
      header: "eyJmaWQiOjIwOTk1MSwidHlwZSI6ImF1dGgiLCJrZXkiOiIweEZkNjRmNjMyYzdiNzk1NDgzNkExOWM1QzA2RTY1QjM5QTE4NzZCNjgifQ",
      payload: "eyJkb21haW4iOiJkb251dGxhYnMudmVyY2VsLmFwcCJ9",
      signature: "QOOntjforRYpPPXl+gXgCGLqJPcAkAKxkp99XxD9VwR9Dw2IojDRUECMuhc/DmP9drdPFKU92yRRu75jNyBptBw="
    },
    miniapp: {
      version: "1",
      name: "Sprinkles",
      iconUrl: "https://donutlabs.vercel.app/media/icon.png",
      homeUrl: "https://donutlabs.vercel.app/",
      canonicalDomain: "sprinkles.wtf"
    }
  });
}