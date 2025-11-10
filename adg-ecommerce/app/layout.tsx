import "@/styles/globals.css";
import Header from "@/components/Header";
import TrackerProvider from "@/components/TrackerProvider";
import { CartProvider } from "@/components/CartContext";
import { AuthProvider } from "@/components/AuthContext";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata = {
  title: "ADG E-commerce",
  description: "A minimal e-commerce experience where everything is sold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <CartProvider>
            <TrackerProvider>
              <ToastProvider>
                <Header />
                <main className="container">{children}</main>
                <footer>© {new Date().getFullYear()} ADG E-commerce</footer>
              </ToastProvider>
            </TrackerProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

