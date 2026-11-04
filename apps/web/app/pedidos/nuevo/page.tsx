'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { solicitudSchema, validar } from '@/lib/schemas';

export default function NuevaSolicitud() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validar(solicitudSchema, e.currentTarget);
    if (!v.ok) return setError(v.error);
    try {
      const p = await api<{ id: number }>('/pedidos', { method: 'POST', body: v.datos });
      router.push(`/pedidos/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Nueva solicitud de impresión</h1>
      {error && <div className="error">{error}</div>}
      <form className="panel" onSubmit={enviar} style={{ display: 'grid', gap: 12 }}>
        <label>Archivo STL
          <input name="archivoStl" type="file" accept=".stl" />
          <span className="suave">En esta versión se registra el nombre del archivo; el envío del archivo queda como ampliación.</span>
        </label>
        <div className="fila">
          <label>Material
            <select name="materialTipo" defaultValue="PLA">
              {['PLA', 'PETG', 'ABS', 'TPU', 'RESINA'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Color<input name="color" placeholder="Negro" /></label>
          <label>Cantidad<input name="cantidad" type="number" min={1} max={100} defaultValue={1} /></label>
        </div>
        <div className="fila">
          <label>Largo X (mm)<input name="dimX" type="number" min={1} /></label>
          <label>Ancho Y (mm)<input name="dimY" type="number" min={1} /></label>
          <label>Alto Z (mm)<input name="dimZ" type="number" min={1} /></label>
        </div>
        <label>Notas<textarea name="notas" rows={3} /></label>
        <div><button type="submit">Enviar solicitud</button></div>
      </form>
    </>
  );
}
