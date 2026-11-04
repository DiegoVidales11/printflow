'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, useRol } from '@/lib/api';

type Material = { id: number; tipo: string; color: string; precioGramo: string };
type Bobina = { id: number; codigo: string; gramosDisponibles: number; gramosReservados: number; gramosConsumidos: number; gramosLibres: number; material: Material };
type Pagina = { data: Bobina[]; page: number; pages: number; total: number };

export default function Inventario() {
  const esAdmin = useRol() === 'ADMIN';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [bobinas, setBobinas] = useState<Pagina | null>(null);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [tarifa, setTarifa] = useState<{ costoHoraMaquina: string; margen: string } | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), limit: '15' });
      if (q) p.set('q', q);
      const [b, m, t] = await Promise.all([api<Pagina>(`/bobinas?${p}`), api<Material[]>('/materiales'), api('/tarifas')]);
      setBobinas(b);
      setMateriales(m);
      setTarifa(t);
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
  }, [q, page]);

  useEffect(() => { cargar(); }, [cargar]);

  async function enviar(e: FormEvent<HTMLFormElement>, ruta: string, metodo: string, convertir: (f: FormData) => unknown) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api(ruta, { method: metodo, body: convertir(new FormData(form)) });
      setMsg({ tipo: 'exito', texto: 'Guardado' });
      form.reset();
      cargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: (err as Error).message });
    }
  }

  return (
    <>
      <h1>Inventario de material</h1>
      {msg && <div className={msg.tipo}>{msg.texto}</div>}
      <div className="panel fila">
        <label>Buscar<input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Código o color" /></label>
        {tarifa && <span className="suave">Tarifa: ${tarifa.costoHoraMaquina} por hora-máquina · margen {Number(tarifa.margen) * 100}%</span>}
      </div>
      {bobinas && (
        <>
          <table>
            <thead><tr><th>Código</th><th>Material</th><th>Disponible (g)</th><th>Reservado (g)</th><th>Libre (g)</th><th>Consumido (g)</th></tr></thead>
            <tbody>
              {bobinas.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.codigo}</td>
                  <td>{b.material.tipo} {b.material.color}</td>
                  <td>{b.gramosDisponibles}</td>
                  <td>{b.gramosReservados}</td>
                  <td style={{ color: b.gramosLibres < 150 ? 'var(--peligro)' : undefined }}>{b.gramosLibres}</td>
                  <td>{b.gramosConsumidos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="paginacion">
            <button className="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="suave">Página {bobinas.page} de {bobinas.pages} · {bobinas.total} bobinas</span>
            <button className="sec" disabled={page >= bobinas.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        </>
      )}

      {esAdmin && (
        <>
          <h2>Administración</h2>
          <form className="panel fila" onSubmit={(e) => enviar(e, '/bobinas', 'POST', (f) => ({ codigo: f.get('codigo'), materialId: Number(f.get('materialId')), gramosDisponibles: Number(f.get('gramos')) }))}>
            <strong style={{ width: '100%' }}>Nueva bobina</strong>
            <label>Código<input name="codigo" placeholder="BOB-PLA-NEG-05" /></label>
            <label>Material<select name="materialId">{materiales.map((m) => <option key={m.id} value={m.id}>{m.tipo} {m.color}</option>)}</select></label>
            <label>Gramos<input name="gramos" type="number" defaultValue={1000} /></label>
            <button type="submit">Agregar</button>
          </form>
          <form className="panel fila" onSubmit={(e) => enviar(e, '/materiales', 'POST', (f) => ({ tipo: f.get('tipo'), color: f.get('color'), precioGramo: Number(f.get('precio')) }))}>
            <strong style={{ width: '100%' }}>Nuevo material</strong>
            <label>Tipo<select name="tipo">{['PLA', 'PETG', 'ABS', 'TPU', 'RESINA'].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Color<input name="color" /></label>
            <label>Precio por gramo<input name="precio" type="number" step="0.01" /></label>
            <button type="submit">Agregar</button>
          </form>
          <form className="panel fila" onSubmit={(e) => enviar(e, '/tarifas', 'PUT', (f) => ({ costoHoraMaquina: Number(f.get('costo')), margen: Number(f.get('margen')) / 100 }))}>
            <strong style={{ width: '100%' }}>Tarifas del cotizador</strong>
            <label>Costo hora-máquina ($)<input name="costo" type="number" step="0.01" defaultValue={tarifa?.costoHoraMaquina} /></label>
            <label>Margen (%)<input name="margen" type="number" defaultValue={tarifa ? Number(tarifa.margen) * 100 : 30} /></label>
            <button type="submit">Guardar</button>
          </form>
        </>
      )}
    </>
  );
}
