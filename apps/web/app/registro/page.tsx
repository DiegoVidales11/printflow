'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, guardarSesion, Sesion } from '@/lib/api';
import { registroSchema, validar } from '@/lib/schemas';

export default function Registro() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validar(registroSchema, e.currentTarget);
    if (!v.ok) return setError(v.error);
    try {
      guardarSesion(await api<Sesion>('/auth/register', { method: 'POST', body: v.datos }));
      router.push('/pedidos');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>Crear cuenta</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
        <label>Nombre<input name="nombre" /></label>
        <label>Correo<input name="email" type="email" /></label>
        <label>Contraseña (mínimo 8)<input name="password" type="password" /></label>
        <button type="submit">Registrarme</button>
      </form>
    </div>
  );
}
