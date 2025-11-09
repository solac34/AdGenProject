import '../styles/globals.css';
import { ReactNode } from 'react';
import TopNav from '../components/TopNav';

export const metadata = {
  title: 'AdGen WebApp',
  description: 'Agent development kit dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-brand-gray4 text-white antialiased selection:bg-brand-blue/30 selection:text-white">
        <TopNav />
        <div className="pt-0">
          {children}
        </div>
      </body>
    </html>
  );
}


