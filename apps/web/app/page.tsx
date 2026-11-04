'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { leerSesion } from '@/lib/api';

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    router.replace(leerSesion() ? '/pedidos' : '/login');
  }, [router]);
  return <p className="suave">Cargando…</p>;
}
