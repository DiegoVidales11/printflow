'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, dinero } from '@/lib/api';

type Reporte = {
  mes: string;
  produccion: { pedidosEntregados: number; ingresos: number; trabajosExitosos: number; trabajosFallidos: number; tasaFallos: number };
  material: { gramosConsumidos: number; gramosMerma: number; porcentajeMerma: number; porMaterial: { material: string; gramos: number; merma: number }[] };
  impresoras: { impresora: string; exitos: number; fallas: number; horasMaquina: number; gramos: number; merma: number; tasaFallos: number }[];
  fallasPorTipo: { tipoFalla: string; total: number }[] | null;
};

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Reportes() {
  const [mes, setMes] = useState(mesActual());
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setR(await api<Reporte>(`/reportes/mensual?mes=${mes}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mes]);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <h1>Reporte mensual de producción y merma</h1>
      <div className="panel fila"><label>Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></label></div>
      {error && <div className="error">{error}</div>}
      {r && (
        <>
          <div className="grid2">
            <div className="panel"><div className="suave">Pedidos entregados</div><div className="kpi">{r.produccion.pedidosEntregados}</div><div className="suave">{dinero(r.produccion.ingresos)} facturado</div></div>
            <div className="panel"><div className="suave">Trabajos impresos</div><div className="kpi">{r.produccion.trabajosExitosos}</div><div className="suave">{r.produccion.trabajosFallidos} fallidos</div></div>
            <div className="panel"><div className="suave">Tasa de fallos</div><div className="kpi">{r.produccion.tasaFallos}%</div></div>
            <div className="panel"><div className="suave">Merma de material</div><div className="kpi">{r.material.porcentajeMerma}%</div><div className="suave">{r.material.gramosMerma} g de {r.material.gramosConsumidos} g</div></div>
          </div>

          <h2>Horas-máquina por impresora</h2>
          <table>
            <thead><tr><th>Impresora</th><th>Horas-máquina</th><th>Éxitos</th><th>Fallas</th><th>Tasa de fallos</th><th>Gramos</th><th>Merma (g)</th></tr></thead>
            <tbody>
              {r.impresoras.map((i) => (
                <tr key={i.impresora}><td>{i.impresora}</td><td>{i.horasMaquina.toFixed(1)}</td><td>{i.exitos}</td><td>{i.fallas}</td><td>{i.tasaFallos}%</td><td>{i.gramos}</td><td>{i.merma}</td></tr>
              ))}
              {r.impresoras.length === 0 && <tr><td colSpan={7} className="suave">Sin trabajos en este mes</td></tr>}
            </tbody>
          </table>

          <div className="grid2" style={{ marginTop: 16 }}>
            <div>
              <h2>Consumo por material</h2>
              <table>
                <thead><tr><th>Material</th><th>Gramos</th><th>Merma (g)</th></tr></thead>
                <tbody>{r.material.porMaterial.map((m) => <tr key={m.material}><td>{m.material}</td><td>{m.gramos}</td><td>{m.merma}</td></tr>)}</tbody>
              </table>
            </div>
            <div>
              <h2>Fallas por tipo (bitácora)</h2>
              {r.fallasPorTipo === null ? (
                <p className="error">La bitácora (MongoDB) no está disponible ahora.</p>
              ) : (
                <table>
                  <thead><tr><th>Tipo de falla</th><th>Casos</th></tr></thead>
                  <tbody>{r.fallasPorTipo.map((f) => <tr key={f.tipoFalla}><td>{f.tipoFalla}</td><td>{f.total}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
