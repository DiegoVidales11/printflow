'use client';

import { useEffect, useState } from 'react';

export type Rol = 'CLIENTE' | 'OPERADOR' | 'ADMIN';
export interface Sesion {
  token: string;
  usuario: { id: number; email: string; nombre: string; rol: Rol };
}

const CLAVE = 'printflow.sesion';

export function leerSesion(): Sesion | null {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: Sesion | null) {
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event('sesion'));
}

/** Rol del usuario actual. Se lee después de montar para no romper la hidratación. */
export function useRol(): Rol | undefined {
  const [rol, setRol] = useState<Rol>();
  useEffect(() => setRol(leerSesion()?.usuario.rol), []);
  return rol;
}

export class ErrorApi extends Error {
  constructor(public status: number, mensaje: string) {
    super(mensaje);
  }
}

/** Llama a la API por la ruta relativa /api (el Ingress la manda al Service de la API). */
export async function api<T = any>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const sesion = leerSesion();
  const res = await fetch(`/api${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
    },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  });
  if (res.status === 401 && sesion) {
    guardarSesion(null);
    window.location.href = '/login';
  }
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const msg = Array.isArray(datos?.message) ? datos.message.join('. ') : datos?.message ?? res.statusText;
    throw new ErrorApi(res.status, `${msg} (HTTP ${res.status})`);
  }
  return datos as T;
}

export const ESTADOS = [
  'SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA', 'IMPRIMIENDO', 'POSPROCESO', 'LISTO_ENTREGA',
  'ENTREGADO', 'EXPIRADO', 'CANCELADO', 'FALLIDO', 'REQUIERE_REVISION',
] as const;

export const nombreEstado = (e: string) => e.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const dinero = (v: unknown) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`);
export const fecha = (v?: string | null) => (v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');
