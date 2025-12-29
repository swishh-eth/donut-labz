import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const adspotDir = path.join(process.cwd(), "public", "adspot");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(adspotDir)) {
      fs.mkdirSync(adspotDir, { recursive: true });
      return NextResponse.json({ files: [] });
    }
    
    // Read all files in the directory
    const files = fs.readdirSync(adspotDir);
    
    // Filter for supported file types
    const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm'];
    const adFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext);
    });
    
    return NextResponse.json({ files: adFiles });
  } catch (error) {
    console.error("Failed to list ad files:", error);
    return NextResponse.json({ files: [] });
  }
}