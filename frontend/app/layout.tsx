import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autarca — Agentic RWA Collateral Manager",
  description: "Autonomous RWA valuation & liquidation agent dashboard on Casper Network",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
