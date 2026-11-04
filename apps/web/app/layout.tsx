import type { Metadata } from 'next';
import Nav from './nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'PrintFlow',
  description: 'Gestión de un taller de impresión 3D bajo pedido',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
