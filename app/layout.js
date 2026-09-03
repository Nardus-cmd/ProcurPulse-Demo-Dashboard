export const metadata = {
  title: "ProcurePulse — Demo",
  description: "ProcurePulse procurement intelligence dashboard (demo)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body style={{ margin: 0, background: "#0B1220" }}>{children}</body>
    </html>
  );
}
