'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { guardarSesion, leerSesion, Sesion } from '@/lib/api';

/** Menú según el rol. Ocultar enlaces es solo comodidad: el servidor valida cada permiso. */
export default function Nav() {
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    const actualizar = () => setSesion(leerSesion());
    actualizar();
    window.addEventListener('sesion', actualizar);
    return () => window.removeEventListener('sesion', actualizar);
  }, []);

  const rol = sesion?.usuario.rol;
  return (
    <header>
      <Link href="/" className="marca">PrintFlow</Link>
      {sesion && <Link href="/pedidos">{rol === 'CLIENTE' ? 'Mis pedidos' : 'Pedidos'}</Link>}
      {rol === 'CLIENTE' && <Link href="/pedidos/nuevo">Nueva solicitud</Link>}
      {(rol === 'OPERADOR' || rol === 'ADMIN') && <Link href="/inventario">Inventario</Link>}
      {(rol === 'OPERADOR' || rol === 'ADMIN') && <Link href="/impresoras">Impresoras</Link>}
      {rol === 'ADMIN' && <Link href="/usuarios">Usuarios</Link>}
      {rol === 'ADMIN' && <Link href="/reportes">Reportes</Link>}
      <span className="usuario">
        {sesion ? (
          <>
            {sesion.usuario.nombre} ({rol?.toLowerCase()}) ·{' '}
            <a href="/login" onClick={() => guardarSesion(null)}>Salir</a>
          </>
        ) : (
          <Link href="/login">Iniciar sesión</Link>
        )}
      </span>
    </header>
  );
}
