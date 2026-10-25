import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Hunter System",
  description: "A real-life progression system for quests, proof, ranks and rewards.",
  manifest: "/manifest.json",
  themeColor: "#0a111c"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
