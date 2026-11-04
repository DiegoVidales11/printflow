'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, useRol } from '@/lib/api';

type Impresora = {
  id: number; nombre: string; tipo: string; extrusorDirecto: boolean; volX: number; volY: number; volZ: number; activa: boolean;
  pedidos: { id: number; folio: string }[];
};

export default function Impresoras() {
  const esAdmin = useRol() === 'ADMIN';
  const [lista, setLista] = useState<Impresora[]>([]);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista((await api<{ data: Impresora[] }>('/impresoras?limit=100')).data);
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(f: () => Promise<unknown>) {
    try {
      await f();
      setMsg({ tipo: 'exito', texto: 'Guardado' });
      cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
  }

  function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    accion(() => api('/impresoras', {
      method: 'POST',
      body: {
        nombre: f.get('nombre'), tipo: f.get('tipo'), extrusorDirecto: f.get('extrusor') === 'on',
        volX: Number(f.get('volX')), volY: Number(f.get('volY')), volZ: Number(f.get('volZ')),
      },
    }));
  }

  return (
    <>
      <h1>Impresoras del taller</h1>
      {msg && <div className={msg.tipo}>{msg.texto}</div>}
      <table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Extrusor directo</th><th>Volumen (mm)</th><th>Estado</th><th>Trabajo actual</th>{esAdmin && <th></th>}</tr></thead>
        <tbody>
          {lista.map((i) => (
            <tr key={i.id}>
              <td>{i.nombre}</td>
              <td>{i.tipo}</td>
              <td>{i.tipo === 'FDM' ? (i.extrusorDirecto ? 'Sí' : 'No') : '—'}</td>
              <td>{i.volX}×{i.volY}×{i.volZ}</td>
              <td>{i.activa ? 'Activa' : 'Inactiva'}</td>
              <td>{i.pedidos[0]?.folio ?? 'Libre'}</td>
              {esAdmin && (
                <td><button className="sec" onClick={() => accion(() => api(`/impresoras/${i.id}`, { method: 'PATCH', body: { activa: !i.activa } }))}>{i.activa ? 'Desactivar' : 'Activar'}</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {esAdmin && (
        <form className="panel fila" onSubmit={crear} style={{ marginTop: 16 }}>
          <strong style={{ width: '100%' }}>Nueva impresora</strong>
          <label>Nombre<input name="nombre" /></label>
          <label>Tipo<select name="tipo"><option>FDM</option><option>SLA</option></select></label>
          <label>Extrusor directo<input name="extrusor" type="checkbox" style={{ minWidth: 0 }} /></label>
          <label>X<input name="volX" type="number" /></label>
          <label>Y<input name="volY" type="number" /></label>
          <label>Z<input name="volZ" type="number" /></label>
          <button type="submit">Agregar</button>
        </form>
      )}
    </>
  );
}
