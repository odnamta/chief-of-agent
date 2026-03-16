import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chief of Agent — Control Tower',
  description: 'Agent permission control dashboard for Claude Code',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0a] text-[#ededed] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
