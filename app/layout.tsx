import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overtree",
  description: "Local-first LaTeX editor with LAN collaboration",
};

// Runs before first paint so there is no flash of the wrong theme and the
// Electron title strip is reserved from the start.
const bootScript = `(function(){try{var d=document.documentElement;if(/Electron\\//.test(navigator.userAgent))d.classList.add("electron");var t=localStorage.getItem("overtree-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-sans">
        <div className="titlebar">Overtree</div>
        {children}
      </body>
    </html>
  );
}
