import { useEffect, useState } from 'react';
import {
  ShoppingCartIcon, BanknotesIcon, ExclamationTriangleIcon,
  UserGroupIcon, CurrencyDollarIcon, ArrowTrendingUpIcon,
  ReceiptPercentIcon, WalletIcon,
} from '@heroicons/react/24/outline';

const hdrs = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const fmt = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtN = (n) => Number(n ?? 0).toLocaleString('es-MX');

function KPI({ icon: Icon, label, value, sub, color = 'blue', loading }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-700',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-7 w-24 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        )}
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/reportes/resumen/', { headers: hdrs() })
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const v = data?.ventas;
  const c = data?.caja;
  const g = data?.gastos;
  const n = data?.nomina;
  const inv = data?.inventario;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={ShoppingCartIcon} label="Ventas Hoy" loading={loading}
          value={fmt(v?.hoy_total)} sub={`${fmtN(v?.hoy_cantidad)} ventas`} color="blue" />
        <KPI icon={ArrowTrendingUpIcon} label="Ventas del Mes" loading={loading}
          value={fmt(v?.mes_total)} sub={`${fmtN(v?.mes_cantidad)} ventas`} color="green" />
        <KPI icon={CurrencyDollarIcon} label="Ticket Promedio" loading={loading}
          value={fmt(v?.ticket_promedio)} sub="promedio por venta hoy" color="purple" />
        <KPI icon={ExclamationTriangleIcon} label="Alertas de Stock" loading={loading}
          value={fmtN(inv?.alertas_stock)} sub={`de ${fmtN(inv?.total_productos)} productos`} color="orange" />
      </div>

      {/* Caja y Gastos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={WalletIcon} label="Saldo Esperado" loading={loading}
          value={c ? fmt(c.saldo_esperado) : '— Sin caja'} sub={c ? `Caja ${c.folio}` : 'No hay caja abierta'} color="green" />
        <KPI icon={BanknotesIcon} label="Diferencia Caja" loading={loading}
          value={c?.diferencia != null ? fmt(c.diferencia) : '—'}
          sub={c?.diferencia != null && Math.abs(c.diferencia) > 0.01 ? '⚠ Revisar arqueo' : 'Sin diferencias'}
          color={c?.diferencia != null && Math.abs(c.diferencia) > 0.01 ? 'red' : 'green'} />
        <KPI icon={ReceiptPercentIcon} label="Gastos Hoy" loading={loading}
          value={fmt(g?.hoy_total)} sub={`${fmtN(g?.hoy_cantidad)} registros`} color="red" />
        <KPI icon={ReceiptPercentIcon} label="Gastos del Mes" loading={loading}
          value={fmt(g?.mes_total)} sub={`${fmtN(g?.mes_cantidad)} registros`} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Métodos de pago hoy */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Ventas por método de pago (hoy)</h3>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : v?.por_metodo_hoy?.length > 0 ? (
            <div className="space-y-2">
              {v.por_metodo_hoy.map((m) => (
                <div key={m.metodo_pago} className="flex items-center justify-between text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize
                    ${m.metodo_pago === 'efectivo' ? 'bg-green-100 text-green-800'
                      : m.metodo_pago === 'transferencia' ? 'bg-blue-100 text-blue-800'
                      : m.metodo_pago === 'tarjeta' ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-700'}`}>
                    {m.metodo_pago}
                  </span>
                  <div className="text-right">
                    <p className="font-semibold">{fmt(m.total)}</p>
                    <p className="text-xs text-gray-400">{m.cantidad} venta{m.cantidad !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-4 text-center">Sin ventas hoy</p>}
        </div>

        {/* Top vendedores del mes */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top vendedores (mes)</h3>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : v?.por_vendedor?.length > 0 ? (
            <div className="space-y-2">
              {v.por_vendedor.slice(0, 5).map((vend, idx) => (
                <div key={vend.empleado_id ?? idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono w-4">{idx + 1}</span>
                    <span className="text-gray-700">{vend.nombre}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fmt(vend.total)}</p>
                    <p className="text-xs text-gray-400">{vend.cantidad} venta{vend.cantidad !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-4 text-center">Sin datos</p>}
        </div>

        {/* Nómina activa */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Nómina en curso</h3>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : n ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Período</span>
                <span className="font-medium">{n.fecha_inicio} → {n.fecha_fin}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total nómina</span>
                <span className="font-bold text-gray-900">{fmt(n.total_general)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Efectivo</span>
                <span className="font-semibold text-green-700">{fmt(n.total_efectivo)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Transferencia</span>
                <span className="font-semibold text-blue-700">{fmt(n.total_transferencia)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Comisiones</span>
                <span className="font-semibold text-purple-700">{fmt(n.total_comisiones)}</span>
              </div>
              <div className="mt-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                  ${n.estado === 'borrador' ? 'bg-yellow-100 text-yellow-800' : n.estado === 'cerrada' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {n.estado}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No hay período de nómina activo</p>
          )}
        </div>
      </div>

      {/* Gastos por categoría */}
      {!loading && g?.por_categoria?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Gastos por categoría (mes)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {g.por_categoria.map((cat, idx) => (
              <div key={idx} className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium truncate">{cat.categoria__nombre ?? 'Sin categoría'}</p>
                <p className="text-lg font-bold text-red-600 mt-1">{fmt(cat.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top productos */}
      {!loading && v?.top_productos?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Productos más vendidos (mes)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b">
                  <th className="pb-2 text-left">Producto</th>
                  <th className="pb-2 text-right">Cantidad</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {v.top_productos.map((p, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-2 text-gray-700">{p.descripcion ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{fmtN(p.cantidad)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmt(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

