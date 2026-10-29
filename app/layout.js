import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'Project KPI Manager V3.3.0',
  description: 'React/Next.js + FastAPI + PostgreSQL professional dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Script src="https://portlogistics.ose.vn/ose-track.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
