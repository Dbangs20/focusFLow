import "./globals.css";
import Link from "next/link";
import { getServerSession } from "next-auth";
import Navbar from "./components/navbar";
import { Providers } from "./providers";
import { authOptions } from "@/lib/authOptions";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-screen">
        <Providers>
          <Navbar />
          {session ? (
            <nav
              className="border-b px-6 py-4 flex flex-wrap gap-4 text-sm font-medium"
              style={{ borderColor: "var(--card-border)", background: "var(--surface-2)" }}
            >
              <Link href="/dashboard" className="ff-nav-link">
                Dashboard
              </Link>
              <Link href="/tasks" className="ff-nav-link">
                Tasks
              </Link>
              <Link href="/focus-group" className="ff-nav-link">
                Focus Group
              </Link>
              <Link href="/focus-sessions" className="ff-nav-link">
                Focus Sessions
              </Link>
            </nav>
          ) : null}
          <main className="ff-page">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
