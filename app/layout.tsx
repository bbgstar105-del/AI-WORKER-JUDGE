import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Work Judge",
  description: "Artifact-first AI work audit powered by local evidence and DeepSeek analysis.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

