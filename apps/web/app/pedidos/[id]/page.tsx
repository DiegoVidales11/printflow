'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, dinero, fecha, nombreEstado, useRol } from '@/lib/api';
import { anticipoSchema, cotizarSchema, validar } from '@/lib/schemas';

type Detalle = {
  id: number; folio: string; estado: string; archivoStl: string; materialTipo: string; color: string;
  cantidad: number; dimX: number; dimY: number; dimZ: number; notas: string | null;
  gramosEstimados: number | null; horasEstimadas: string | null; total: string | null; anticipo: string;
  anticipoDevuelto: boolean; prioridad: number; fallosConsecutivos: number; cotizadoEn: string | null; creadoEn: string;
  cliente: { nombre: string; email: string };
  impresora: { id: number; nombre: string; tipo: string } | null;
  bobina: { codigo: string } | null;
  reservas: { gramos: number; activa: boolean }[];
};
type Evento = { tipo: string; de?: string; a?: string; usuario?: string; notas?: string; tipoFalla?: string; parametros?: Record<string, unknown>; fecha: string };
type Opcion = { id: number; nombre?: string; codigo?: string; tipo?: string; gramosLibres?: number; activa?: boolean };

const FALLAS = ['DESPRENDIMIENTO', 'ATASCO', 'WARPING', 'CAPA_CORRIDA', 'OTRA'];

export default function DetallePedido() {
  const { id } = useParams<{ id: string }>();
  const rol = useRol();
  const esOperador = rol === 'OPERADOR' || rol === 'ADMIN';
  const [p, setP] = useState<Detalle | null>(null);
  const [historial, setHistorial] = useState<Evento[] | null>(null);
  const [avisoHistorial, setAvisoHistorial] = useState('');
  const [impresoras, setImpresoras] = useState<Opcion[]>([]);
  const [bobinas, setBobinas] = useState<Opcion[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<Detalle>(`/pedidos/${id}`);
      setP(d);
      if (esOperador && (d.estado === 'SOLICITADO' || d.estado === 'COTIZADO')) {
        const [imps, bobs] = await Promise.all([
          api<{ data: Opcion[] }>('/impresoras?limit=100'),
          api<{ data: Opcion[] }>(`/bobinas?limit=100&tipo=${d.materialTipo}`),
        ]);
        setImpresoras(imps.data.filter((i) => i.activa));
        setBobinas(bobs.data);
      }
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
    try {
      setHistorial(await api<Evento[]>(`/pedidos/${id}/historial`));
      setAvisoHistorial('');
    } catch (e) {
      setAvisoHistorial((e as Error).message);
    }
  }, [id, esOperador]);

  useEffect(() => { cargar(); }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, ok: string) {
    try {
      await accion();
      setMsg({ tipo: 'exito', texto: ok });
      await cargar();
      setTimeout(cargar, 2500); // el outbox tarda unos segundos en llegar a MongoDB
    } catch (e) {
      setMsg({ tipo: 'error', texto: (e as Error).message });
    }
  }

  const cambiar = (estado: string, extra: Record<string, unknown> = {}) =>
    ejecutar(() => api(`/pedidos/${id}/estado`, { method: 'PATCH', body: { estado, ...extra } }), `Pedido movido a ${nombreEstado(estado)}`);

  function enviarCotizacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validar(cotizarSchema, e.currentTarget);
    if (!v.ok) return setMsg({ tipo: 'error', texto: v.error });
    ejecutar(() => api(`/pedidos/${id}/cotizar`, { method: 'POST', body: v.datos }), 'Cotización guardada');
  }

  function enviarAnticipo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = validar(anticipoSchema, e.currentTarget);
    if (!v.ok) return setMsg({ tipo: 'error', texto: v.error });
    ejecutar(() => api(`/pedidos/${id}/anticipo`, { method: 'POST', body: v.datos }), 'Anticipo registrado');
  }

  function cambiarConDatos(estado: string) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const extra: Record<string, unknown> = {};
      if (f.get('gramosUsados')) extra.gramosUsados = Number(f.get('gramosUsados'));
      if (f.get('tipoFalla')) extra.tipoFalla = f.get('tipoFalla');
      if (f.get('motivo')) extra.motivo = f.get('motivo');
      cambiar(estado, extra);
    };
  }

  function enviarBitacora(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const tipo = String(f.get('tipo'));
    const parametros: Record<string, unknown> = {};
    for (const [k, v] of Array.from(f.entries())) {
      if (k.startsWith('p_') && v !== '') parametros[k.slice(2)] = isNaN(Number(v)) ? v : Number(v);
    }
    const body: Record<string, unknown> = { tipo, notas: f.get('notas') || undefined };
    if (tipo === 'PARAMETROS') body.parametros = parametros;
    if (tipo === 'FALLA') body.tipoFalla = f.get('tipoFallaBit');
    ejecutar(() => api(`/pedidos/${id}/bitacora`, { method: 'POST', body }), 'Registro enviado a la bitácora');
  }

  if (!p) return <>{msg && <div className="error">{msg.texto}</div>}<p className="suave">Cargando…</p></>;

  const reservado = p.reservas.filter((r) => r.activa).reduce((s, r) => s + r.gramos, 0);
  const sla = p.impresora?.tipo === 'SLA' || p.materialTipo === 'RESINA';

  return (
    <>
      <h1>{p.folio} <span className={`estado ${p.estado}`}>{nombreEstado(p.estado)}</span></h1>
      {msg && <div className={msg.tipo}>{msg.texto}</div>}

      <div className="panel grid2">
        <div><div className="suave">Cliente</div>{p.cliente.nombre}<div className="suave">{p.cliente.email}</div></div>
        <div><div className="suave">Pieza</div>{p.archivoStl} · {p.cantidad} pza<div className="suave">{p.dimX}×{p.dimY}×{p.dimZ} mm · {p.materialTipo} {p.color}</div></div>
        <div><div className="suave">Cotización</div>{dinero(p.total)}<div className="suave">{p.gramosEstimados ?? '—'} g y {p.horasEstimadas ?? '—'} h por pieza · {fecha(p.cotizadoEn)}</div></div>
        <div><div className="suave">Anticipo</div>{dinero(p.anticipo)}{p.anticipoDevuelto && <div className="suave">Devuelto al cancelar</div>}</div>
        <div><div className="suave">Impresora / bobina</div>{p.impresora?.nombre ?? '—'}<div className="suave">{p.bobina?.codigo ?? '—'} · reservado {reservado} g</div></div>
        <div><div className="suave">Prioridad / fallos</div>{p.prioridad > 0 ? 'Alta (reimpresión)' : 'Normal'}<div className="suave">{p.fallosConsecutivos} fallos consecutivos</div></div>
      </div>

      {/* ------------------------------ acciones del cliente */}
      {rol === 'CLIENTE' && (
        <div className="panel fila">
          {p.estado === 'COTIZADO' && <button onClick={() => cambiar('APROBADO')}>Aceptar cotización</button>}
          {p.estado === 'COTIZADO' && <button className="sec" onClick={() => cambiar('CANCELADO', { motivo: 'Cotización rechazada' })}>Rechazar</button>}
          {['SOLICITADO', 'APROBADO', 'EN_COLA'].includes(p.estado) && (
            <button className="peligro" onClick={() => cambiar('CANCELADO', { motivo: 'Cancelado por el cliente' })}>Cancelar pedido</button>
          )}
        </div>
      )}

      {/* ------------------------------ acciones del operador */}
      {esOperador && (
        <>
          {(p.estado === 'SOLICITADO' || p.estado === 'COTIZADO') && (
            <form className="panel fila" onSubmit={enviarCotizacion}>
              <strong style={{ width: '100%' }}>{p.estado === 'COTIZADO' ? 'Re-cotizar / reasignar' : 'Cotizar y asignar'}</strong>
              <label>Gramos por pieza<input name="gramosPorPieza" type="number" min={1} defaultValue={p.gramosEstimados ?? ''} /></label>
              <label>Horas por pieza<input name="horasPorPieza" type="number" step="0.1" min={0.1} defaultValue={p.horasEstimadas ?? ''} /></label>
              <label>Impresora
                <select name="impresoraId" defaultValue={p.impresora?.id ?? ''}>
                  <option value="">Elige…</option>
                  {impresoras.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.tipo})</option>)}
                </select>
              </label>
              <label>Bobina ({p.materialTipo})
                <select name="bobinaId" defaultValue="">
                  <option value="">Elige…</option>
                  {bobinas.map((b) => <option key={b.id} value={b.id}>{b.codigo} · {b.gramosLibres} g libres</option>)}
                </select>
              </label>
              <button type="submit">Guardar cotización</button>
            </form>
          )}

          {['COTIZADO', 'APROBADO', 'EN_COLA'].includes(p.estado) && (
            <form className="panel fila" onSubmit={enviarAnticipo}>
              <label>Registrar anticipo (mínimo 50 % = {dinero(Number(p.total ?? 0) * 0.5)})<input name="monto" type="number" step="0.01" min={0.01} /></label>
              <button type="submit">Registrar</button>
            </form>
          )}

          <div className="panel fila">
            {p.estado === 'APROBADO' && <button onClick={() => cambiar('EN_COLA')}>Poner en cola</button>}
            {p.estado === 'EN_COLA' && <button onClick={() => cambiar('IMPRIMIENDO')}>Iniciar impresión</button>}
            {p.estado === 'POSPROCESO' && <button onClick={() => cambiar('LISTO_ENTREGA')}>Listo para entrega</button>}
            {p.estado === 'LISTO_ENTREGA' && <button onClick={() => cambiar('ENTREGADO')}>Marcar entregado</button>}
            {p.estado === 'REQUIERE_REVISION' && <button onClick={() => cambiar('EN_COLA', { motivo: 'Revisado con el cliente' })}>Regresar a la cola</button>}
            {['SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA', 'REQUIERE_REVISION'].includes(p.estado) && (
              <button className="peligro" onClick={() => cambiar('CANCELADO', { motivo: 'Cancelado por el taller' })}>Cancelar</button>
            )}
          </div>

          {p.estado === 'IMPRIMIENDO' && (
            <div className="grid2">
              <form className="panel" onSubmit={cambiarConDatos('POSPROCESO')} style={{ display: 'grid', gap: 8 }}>
                <strong>Impresión terminada</strong>
                <label>Gramos usados (vacío = estimado)<input name="gramosUsados" type="number" min={0} /></label>
                <button type="submit">Pasar a posproceso</button>
              </form>
              <form className="panel" onSubmit={cambiarConDatos('FALLIDO')} style={{ display: 'grid', gap: 8 }}>
                <strong>Registrar falla (RN-4)</strong>
                <label>Tipo de falla<select name="tipoFalla">{FALLAS.map((f) => <option key={f}>{f}</option>)}</select></label>
                <label>Gramos desperdiciados<input name="gramosUsados" type="number" min={0} /></label>
                <label>Motivo<input name="motivo" /></label>
                <button type="submit" className="peligro">Marcar fallido</button>
              </form>
              <form className="panel" onSubmit={cambiarConDatos('CANCELADO')} style={{ display: 'grid', gap: 8 }}>
                <strong>Cancelar en impresión (RN-5)</strong>
                <label>Gramos ya consumidos<input name="gramosUsados" type="number" min={0} /></label>
                <span className="suave">Se retiene el anticipo y se libera el material no consumido.</span>
                <button type="submit" className="peligro">Cancelar</button>
              </form>
            </div>
          )}

          <form className="panel fila" onSubmit={enviarBitacora}>
            <strong style={{ width: '100%' }}>Agregar a la bitácora técnica</strong>
            <label>Tipo<select name="tipo" defaultValue="PARAMETROS"><option>PARAMETROS</option><option>NOTA</option><option>FALLA</option></select></label>
            {sla ? (
              <>
                <label>Exposición (s)<input name="p_exposicionSeg" type="number" step="0.1" /></label>
                <label>Capas base<input name="p_capasBase" type="number" /></label>
                <label>Lavado (min)<input name="p_lavadoMin" type="number" /></label>
                <label>Curado (min)<input name="p_curadoMin" type="number" /></label>
              </>
            ) : (
              <>
                <label>Temp. boquilla (°C)<input name="p_tempBoquilla" type="number" /></label>
                <label>Temp. cama (°C)<input name="p_tempCama" type="number" /></label>
                <label>Altura de capa (mm)<input name="p_alturaCapa" type="number" step="0.01" /></label>
                <label>Relleno (%)<input name="p_relleno" type="number" /></label>
              </>
            )}
            <label>Tipo de falla<select name="tipoFallaBit">{FALLAS.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label>Notas<input name="notas" /></label>
            <button type="submit">Agregar</button>
          </form>
        </>
      )}

      <h2>Historial técnico del pedido (MongoDB)</h2>
      {avisoHistorial && <div className="error">{avisoHistorial}</div>}
      {historial?.length === 0 && <p className="suave">Sin eventos todavía.</p>}
      {historial?.map((ev, i) => (
        <div key={i} className={`evento ${ev.tipo}`}>
          <strong>{ev.tipo === 'CAMBIO_ESTADO' ? `${ev.de ? nombreEstado(ev.de) + ' → ' : ''}${nombreEstado(ev.a ?? '')}` : ev.tipo}</strong>
          {ev.tipoFalla && ` · ${ev.tipoFalla}`} <span className="suave">· {fecha(ev.fecha)} · {ev.usuario ?? ''}</span>
          {ev.notas && <div>{ev.notas}</div>}
          {ev.parametros && <div className="suave">{Object.entries(ev.parametros).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
        </div>
      ))}
    </>
  );
}
