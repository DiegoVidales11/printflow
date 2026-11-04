'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, dinero, ESTADOS, fecha, nombreEstado, useRol } from '@/lib/api';

type Pedido = {
  id: number; folio: string; estado: string; materialTipo: string; color: string; cantidad: number;
  total: string | null; prioridad: number; creadoEn: string;
  cliente: { nombre: string }; impresora: { nombre: string } | null;
};
type Pagina = { data: Pedido[]; total: number; page: number; pages: number };

export default function Pedidos() {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Pagina | null>(null);
  const [error, setError] = useState('');
  const esCliente = useRol() === 'CLIENTE';

  const cargar = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), limit: '15' });
    if (q) p.set('q', q);
    if (estado) p.set('estado', estado);
    try {
      setRes(await api<Pagina>(`/pedidos?${p}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q, estado, page]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <>
      <h1>{esCliente ? 'Mis pedidos' : 'Bandeja de pedidos'}</h1>
      <div className="panel fila">
        <label>Buscar<input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Folio, cliente, color, archivo…" /></label>
        <label>Estado
          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{nombreEstado(e)}</option>)}
          </select>
        </label>
        {esCliente && <Link href="/pedidos/nuevo"><button type="button">Nueva solicitud</button></Link>}
        {estado === 'EN_COLA' && <span className="suave">Ordenado por prioridad (reimpresiones primero) y antigüedad</span>}
      </div>
      {error && <div className="error">{error}</div>}
      {res && (
        <>
          <table>
            <thead>
              <tr><th>Folio</th>{!esCliente && <th>Cliente</th>}<th>Material</th><th>Cant.</th><th>Estado</th><th>Impresora</th><th>Total</th><th>Creado</th></tr>
            </thead>
            <tbody>
              {res.data.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/pedidos/${p.id}`}>{p.folio}</Link>{p.prioridad > 0 && ' ⚑'}</td>
                  {!esCliente && <td>{p.cliente.nombre}</td>}
                  <td>{p.materialTipo} {p.color}</td>
                  <td>{p.cantidad}</td>
                  <td><span className={`estado ${p.estado}`}>{nombreEstado(p.estado)}</span></td>
                  <td>{p.impresora?.nombre ?? '—'}</td>
                  <td>{dinero(p.total)}</td>
                  <td>{fecha(p.creadoEn)}</td>
                </tr>
              ))}
              {res.data.length === 0 && <tr><td colSpan={8} className="suave">Sin resultados</td></tr>}
            </tbody>
          </table>
          <div className="paginacion">
            <button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="suave">Página {res.page} de {res.pages} · {res.total} pedidos</span>
            <button className="sec" disabled={page >= res.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </>
  );
}
