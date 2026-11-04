'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, guardarSesion, Sesion } from '@/lib/api';
import { loginSchema, validar } from '@/lib/schemas';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validar(loginSchema, e.currentTarget);
    if (!v.ok) return setError(v.error);
    try {
      guardarSesion(await api<Sesion>('/auth/login', { method: 'POST', body: v.datos }));
      router.push('/pedidos');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Iniciar sesión</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
        <label>Correo<input name="email" type="email" autoComplete="username" /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" /></label>
        <button type="submit">Entrar</button>
      </form>
      <p className="suave">¿No tienes cuenta? <Link href="/registro">Regístrate como cliente</Link></p>
      <p className="suave">Demo: admin@printflow.mx / Admin12345 · operador1@printflow.mx / Operador12345 · cliente1@correo.mx / Cliente12345</p>
    </div>
  );
}
