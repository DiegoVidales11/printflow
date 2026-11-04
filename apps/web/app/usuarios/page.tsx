'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, fecha } from '@/lib/api';

type Usuario = { id: number; email: string; nombre: string; rol: string; activo: boolean; creadoEn: string };
type Pagina = { data: Usuario[]; page: number; pages: number; total: number };

export default function Usuarios() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Pagina | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: '15' });
      if (q) p.set('q', q);
      setRes(await api<Pagina>(`/usuarios?${p}`));
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
  }, [q, page]);
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
    accion(() => api('/usuarios', { method: 'POST', body: { nombre: f.get('nombre'), email: f.get('email'), password: f.get('password'), rol: f.get('rol') } }));
  }

  return (
    <>
      <h1>Usuarios y roles</h1>
      {msg && <div className={msg.tipo}>{msg.texto}</div>}
      <div className="panel fila"><label>Buscar<input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label></div>
      {res && (
        <>
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
            <tbody>
              {res.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.rol} onChange={(e) => accion(() => api(`/usuarios/${u.id}`, { method: 'PATCH', body: { rol: e.target.value } }))}>
                      <option>CLIENTE</option><option>OPERADOR</option><option>ADMIN</option>
                    </select>
                  </td>
                  <td>{u.activo ? 'Activo' : 'Inactivo'}</td>
                  <td>{fecha(u.creadoEn)}</td>
                  <td><button className="sec" onClick={() => accion(() => api(`/usuarios/${u.id}`, { method: 'PATCH', body: { activo: !u.activo } }))}>{u.activo ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="paginacion">
            <button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="suave">Página {res.page} de {res.pages} · {res.total} usuarios</span>
            <button className="sec" disabled={page >= res.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        </>
      )}
      <form className="panel fila" onSubmit={crear} style={{ marginTop: 16 }}>
        <strong style={{ width: '100%' }}>Nuevo usuario</strong>
        <label>Nombre<input name="nombre" /></label>
        <label>Correo<input name="email" type="email" /></label>
        <label>Contraseña<input name="password" type="password" /></label>
        <label>Rol<select name="rol"><option>OPERADOR</option><option>ADMIN</option><option>CLIENTE</option></select></label>
        <button type="submit">Crear</button>
      </form>
    </>
  );
}
