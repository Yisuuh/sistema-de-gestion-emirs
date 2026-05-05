import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  FunnelIcon,
  TableCellsIcon,
  ListBulletIcon,
  ChartBarIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (n, d = 2) => Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

const ESTADO_LABELS = {
  disponible:     { label: 'Disponible',    cls: 'bg-green-100 text-green-800' },
  en_lista:       { label: 'En lista',       cls: 'bg-red-100 text-[#a80008]' },
  sin_existencia: { label: 'Sin existencia', cls: 'bg-orange-100 text-orange-800' },
  consumido:      { label: 'Consumido',      cls: 'bg-gray-100 text-gray-600' },
};
const STOCK_LABELS = {
  disponible: { label: 'Disponible',  cls: 'bg-green-100 text-green-800' },
  stock_bajo: { label: 'Stock bajo',  cls: 'bg-yellow-100 text-yellow-800' },
  agotado:    { label: 'Agotado',     cls: 'bg-red-100 text-red-800' },
};

function Badge({ val, map }) {
  const x = map[val] ?? { label: val, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${x.cls}`}>{x.label}</span>;
}
function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" /></div>;
}

// ─── Vista Consolidado ────────────────────────────────────────────────────────
function TabConsolidado({ onVerKardex }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroMarca, setFiltroMarca]   = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inventario/productos/consolidado/', { headers: tok() });
      const d = await r.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const exportarCSV = async () => {
    try {
      const res = await fetch('/api/inventario/productos/exportar_csv/', { headers: tok() });
      if (!res.ok) throw new Error('Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventario.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    }
  };

  const marcas = data ? [...new Set(data.productos.map(p => p.marca))] : [];

  const filas = (data?.productos ?? []).filter(p => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || p.codigo.toLowerCase().includes(q) || p.medida.toLowerCase().includes(q)
      || p.marca.toLowerCase().includes(q) || p.modelo.toLowerCase().includes(q);
    const matchE = filtroEstado === 'todos' || p.estado_stock === filtroEstado;
    const matchM = !filtroMarca || p.marca === filtroMarca;
    return matchQ && matchE && matchM;
  });

  const totales = data?.totales;

  return (
    <div>
      {/* KPI cards */}
      {totales && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Productos',      val: totales.total_productos,                    cls: 'text-[#df000a]' },
            { label: 'Piezas en stock',val: totales.total_piezas,                       cls: 'text-green-700' },
            { label: 'Valor inventario',val: `$${fmt(totales.valor_inventario_total)}`, cls: 'text-indigo-700' },
            { label: 'Agotados',       val: totales.agotados,                           cls: 'text-red-700' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-lg border p-3">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`text-xl font-bold ${c.cls}`}>{c.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            placeholder="Buscar código, medida, marca, modelo…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a]"
          />
        </div>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]">
          <option value="todos">Todos los estados</option>
          <option value="disponible">Disponible</option>
          <option value="stock_bajo">Stock bajo</option>
          <option value="agotado">Agotado</option>
        </select>
        <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]">
          <option value="">Todas las marcas</option>
          {marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={cargar} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50" title="Recargar">
          <ArrowPathIcon className="h-5 w-5 text-gray-500" />
        </button>
        <button onClick={exportarCSV}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
          <ArrowDownTrayIcon className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Código','Medida','Marca / Modelo','IC/IV','Entradas','Salidas','Stock','P. Venta','P. Compra','Factura','Estado',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.length === 0 && (
                <tr><td colSpan={12} className="text-center py-10 text-gray-400">Sin resultados</td></tr>
              )}
              {filas.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-800 whitespace-nowrap">{p.codigo}</td>
                  <td className="px-4 py-3 font-mono font-medium text-[#df000a] whitespace-nowrap">{p.medida}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.marca}</div>
                    <div className="text-gray-500 text-xs">{p.modelo}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600 whitespace-nowrap">{p.indice_carga}{p.indice_velocidad}</td>
                  <td className="px-4 py-3 text-center text-green-700 font-semibold">{p.entradas_total}</td>
                  <td className="px-4 py-3 text-center text-red-600 font-semibold">{p.salidas_total}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-base ${p.estado_stock === 'agotado' ? 'text-red-600' : p.estado_stock === 'stock_bajo' ? 'text-yellow-600' : 'text-green-600'}`}>
                      {p.stock_actual}
                    </span>
                    <span className="text-gray-400 text-xs ml-1">/ {p.stock_minimo}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">${fmt(p.precio_venta)}</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-gray-500">
                    {p.ultimo_precio_compra ? `$${fmt(p.ultimo_precio_compra)}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{p.ultima_factura ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Badge val={p.estado_stock} map={STOCK_LABELS} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => onVerKardex(p)} className="text-xs text-[#df000a] hover:underline">Kardex</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-500 border-t">
            Mostrando {filas.length} de {data?.productos.length ?? 0} productos
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vista Entradas ───────────────────────────────────────────────────────────
function TabEntradas({ proveedores, productos }) {
  const [entradas, setEntradas] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [msg, setMsg]           = useState(null);
  const [filtros, setFiltros]   = useState({ fecha_inicio: '', fecha_fin: '', proveedor: '', estado: '' });
  const [form, setForm] = useState({
    producto: '', proveedor: '', cantidad: 1, precio_compra: '',
    fecha_compra: new Date().toISOString().split('T')[0],
    numero_factura: '', estado: 'disponible', notas: '',
  });

  const cargar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
    if (filtros.fecha_fin)    params.set('fecha_fin',    filtros.fecha_fin);
    if (filtros.proveedor)    params.set('proveedor',    filtros.proveedor);
    if (filtros.estado)       params.set('estado',       filtros.estado);
    try {
      const r = await fetch(`/api/inventario/entradas/?${params}`, { headers: tok() });
      const d = await r.json();
      setEntradas(Array.isArray(d) ? d : (d.results ?? []));
    } finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    const r = await fetch('/api/inventario/entradas/', {
      method: 'POST',
      headers: { ...tok(), 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      setMsg({ tipo: 'ok', txt: 'Entrada registrada correctamente.' });
      setModal(false);
      setForm({ producto: '', proveedor: '', cantidad: 1, precio_compra: '',
        fecha_compra: new Date().toISOString().split('T')[0],
        numero_factura: '', estado: 'disponible', notas: '' });
      cargar();
    } else {
      const d = await r.json();
      setMsg({ tipo: 'err', txt: d.detail ?? JSON.stringify(d) });
    }
    setTimeout(() => setMsg(null), 4000);
  };

  const cambiarEstado = async (id, estado) => {
    await fetch(`/api/inventario/entradas/${id}/`, {
      method: 'PATCH',
      headers: { ...tok(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    cargar();
  };

  const totalPiezas = entradas.reduce((s, e) => s + (e.cantidad ?? 0), 0);
  const totalCosto  = entradas.reduce((s, e) => s + (e.cantidad ?? 0) * parseFloat(e.precio_compra ?? 0), 0);

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a]';

  return (
    <div>
      {msg && (
        <div className={`mb-3 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.tipo === 'ok' ? <CheckCircleIcon className="h-5 w-5" /> : <XCircleIcon className="h-5 w-5" />}
          {msg.txt}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="date" value={filtros.fecha_inicio} onChange={e => setFiltros(f => ({...f, fecha_inicio: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Desde" />
        <input type="date" value={filtros.fecha_fin} onChange={e => setFiltros(f => ({...f, fecha_fin: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Hasta" />
        <select value={filtros.proveedor} onChange={e => setFiltros(f => ({...f, proveedor: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => setFiltros(f => ({...f, estado: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
        </select>
        <button onClick={() => setModal(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
          + Nueva entrada
        </button>
      </div>

      {/* Totales */}
      <div className="flex gap-4 mb-3 text-sm">
        <span className="text-gray-500">Registros: <strong>{entradas.length}</strong></span>
        <span className="text-gray-500">Piezas: <strong className="text-green-700">{totalPiezas}</strong></span>
        <span className="text-gray-500">Costo total: <strong className="text-indigo-700">${fmt(totalCosto)}</strong></span>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha','Factura','Proveedor','Código','Medida','Marca / Modelo','IC/IV','Cant.','P. Compra','Total','Estado','Notas'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entradas.length === 0 && (
                <tr><td colSpan={12} className="text-center py-10 text-gray-400">Sin entradas para los filtros seleccionados</td></tr>
              )}
              {entradas.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600">{e.fecha_compra}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{e.numero_factura}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{e.proveedor_nombre}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{e.producto_codigo}</td>
                  <td className="px-3 py-3 font-mono font-medium text-[#df000a] whitespace-nowrap">{e.producto_medida}</td>
                  <td className="px-3 py-3">{e.producto_descripcion}</td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">—</td>
                  <td className="px-3 py-3 text-center font-bold text-green-700">{e.cantidad}</td>
                  <td className="px-3 py-3 text-right font-mono whitespace-nowrap">${fmt(e.precio_compra)}</td>
                  <td className="px-3 py-3 text-right font-mono whitespace-nowrap">${fmt(e.total_compra)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <select
                      value={e.estado}
                      onChange={ev => cambiarEstado(e.id, ev.target.value)}
                      className={`text-xs rounded-full px-2 py-1 border-0 font-semibold cursor-pointer ${ESTADO_LABELS[e.estado]?.cls ?? ''}`}
                    >
                      {Object.entries(ESTADO_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400 max-w-[120px] truncate">{e.notas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nueva entrada */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Registrar entrada de inventario</h2>
            <form onSubmit={guardar} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
                  <select value={form.producto} onChange={e => setForm(f => ({...f, producto: e.target.value}))} className={inputCls} required>
                    <option value="">Seleccionar…</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion_completa}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
                  <select value={form.proveedor} onChange={e => setForm(f => ({...f, proveedor: e.target.value}))} className={inputCls} required>
                    <option value="">Seleccionar…</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
                  <input type="number" min="1" value={form.cantidad} onChange={e => setForm(f => ({...f, cantidad: +e.target.value}))} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio compra *</label>
                  <input type="number" step="0.01" min="0" value={form.precio_compra} onChange={e => setForm(f => ({...f, precio_compra: e.target.value}))} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha compra *</label>
                  <input type="date" value={form.fecha_compra} onChange={e => setForm(f => ({...f, fecha_compra: e.target.value}))} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">No. Factura *</label>
                  <input type="text" value={form.numero_factura} onChange={e => setForm(f => ({...f, numero_factura: e.target.value}))} className={inputCls} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))} className={inputCls}>
                    {Object.entries(ESTADO_LABELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({...f, notas: e.target.value}))} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg text-sm hover:bg-[#c4000a]">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vista Salidas ────────────────────────────────────────────────────────────
function TabSalidas() {
  const [salidas, setSalidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ fecha_inicio: '', fecha_fin: '', busqueda: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
    if (filtros.fecha_fin)    params.set('fecha_fin',    filtros.fecha_fin);
    try {
      const r = await fetch(`/api/inventario/salidas/?${params}`, { headers: tok() });
      const d = await r.json();
      setSalidas(Array.isArray(d) ? d : (d.results ?? []));
    } finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtered = filtros.busqueda
    ? salidas.filter(s => {
        const q = filtros.busqueda.toLowerCase();
        return s.producto_codigo?.toLowerCase().includes(q) ||
               s.producto_medida?.toLowerCase().includes(q) ||
               s.marca_nombre?.toLowerCase().includes(q) ||
               s.venta_folio?.toLowerCase().includes(q);
      })
    : salidas;

  const totalPiezas   = filtered.reduce((s, x) => s + (x.cantidad ?? 0), 0);
  const totalVentas   = filtered.reduce((s, x) => s + parseFloat(x.total_venta ?? 0), 0);
  const totalUtilidad = filtered.reduce((s, x) => s + parseFloat(x.utilidad ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="date" value={filtros.fecha_inicio} onChange={e => setFiltros(f => ({...f, fecha_inicio: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={filtros.fecha_fin} onChange={e => setFiltros(f => ({...f, fecha_fin: e.target.value}))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <div className="relative flex-1 min-w-[180px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input placeholder="Código, medida, marca, folio…" value={filtros.busqueda}
            onChange={e => setFiltros(f => ({...f, busqueda: e.target.value}))}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={cargar} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <ArrowPathIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="flex gap-4 mb-3 text-sm">
        <span className="text-gray-500">Registros: <strong>{filtered.length}</strong></span>
        <span className="text-gray-500">Piezas: <strong className="text-red-600">{totalPiezas}</strong></span>
        <span className="text-gray-500">Ventas: <strong className="text-green-700">${fmt(totalVentas)}</strong></span>
        <span className="text-gray-500">Utilidad: <strong className="text-indigo-700">${fmt(totalUtilidad)}</strong></span>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha','Folio venta','Código','Medida','Marca','Modelo','Cant.','P. Venta','P. Costo','Total','Utilidad'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center py-10 text-gray-400">Sin salidas para los filtros seleccionados</td></tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600">{s.fecha_venta}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap text-[#df000a]">{s.venta_folio ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{s.producto_codigo}</td>
                  <td className="px-3 py-3 font-mono font-medium text-[#df000a] whitespace-nowrap">{s.producto_medida}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{s.marca_nombre}</td>
                  <td className="px-3 py-3 text-gray-600">{s.producto_descripcion}</td>
                  <td className="px-3 py-3 text-center font-bold text-red-600">{s.cantidad}</td>
                  <td className="px-3 py-3 text-right font-mono whitespace-nowrap">${fmt(s.precio_venta)}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-500 whitespace-nowrap">${fmt(s.precio_costo)}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap">${fmt(s.total_venta)}</td>
                  <td className={`px-3 py-3 text-right font-mono font-semibold whitespace-nowrap ${parseFloat(s.utilidad) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${fmt(s.utilidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Vista Kardex ─────────────────────────────────────────────────────────────
function TabKardex({ productoInicial }) {
  const [productos, setProductos] = useState([]);
  const [selId, setSelId]         = useState(productoInicial?.id ?? '');
  const [kardex, setKardex]       = useState(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    fetch('/api/inventario/productos/', { headers: tok() })
      .then(r => r.json())
      .then(d => setProductos(Array.isArray(d) ? d : (d.results ?? [])));
  }, []);

  useEffect(() => {
    if (productoInicial) { setSelId(productoInicial.id); }
  }, [productoInicial]);

  useEffect(() => {
    if (!selId) { setKardex(null); return; }
    setLoading(true);
    fetch(`/api/inventario/productos/${selId}/kardex/`, { headers: tok() })
      .then(r => r.json())
      .then(d => setKardex(d))
      .finally(() => setLoading(false));
  }, [selId]);

  return (
    <div>
      <div className="mb-4 max-w-xl">
        <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar producto</label>
        <select value={selId} onChange={e => setSelId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]">
          <option value="">— Elegir producto —</option>
          {productos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion_completa}</option>)}
        </select>
      </div>

      {loading && <Spinner />}

      {kardex && !loading && (
        <div>
          {/* Info producto */}
          <div className="bg-red-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 flex flex-wrap gap-6 text-sm">
            <div><span className="text-gray-500">Código:</span> <strong className="font-mono">{kardex.producto.codigo}</strong></div>
            <div><span className="text-gray-500">Descripción:</span> <strong>{kardex.producto.descripcion}</strong></div>
            <div><span className="text-gray-500">Stock actual:</span> <strong className={kardex.producto.stock_actual <= 0 ? 'text-red-600' : 'text-green-700'}>{kardex.producto.stock_actual} pzas</strong></div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Fecha','Tipo','Referencia','Cant.','P. Unitario','Total','Saldo','Notas'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kardex.movimientos.map((m, i) => (
                  <tr key={i} className={m.tipo === 'entrada' ? 'bg-green-50/40' : 'bg-red-50/30'}>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">{m.fecha}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.tipo === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                        {m.tipo === 'entrada' ? '▲ Entrada' : '▼ Salida'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                      {m.referencia}
                      {m.tipo === 'entrada' && m.proveedor && <span className="ml-1 text-gray-400">({m.proveedor})</span>}
                    </td>
                    <td className={`px-3 py-3 text-center font-bold ${m.tipo === 'entrada' ? 'text-green-700' : 'text-red-600'}`}>{m.cantidad}</td>
                    <td className="px-3 py-3 text-right font-mono whitespace-nowrap">${fmt(m.precio_unitario)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap">${fmt(m.total)}</td>
                    <td className={`px-3 py-3 text-center font-bold text-lg ${m.saldo <= 0 ? 'text-red-600' : 'text-gray-800'}`}>{m.saldo}</td>
                    <td className="px-3 py-3 text-xs text-gray-400 max-w-[120px] truncate">{m.notas}</td>
                  </tr>
                ))}
                {kardex.movimientos.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vista XML ────────────────────────────────────────────────────────────────
function TabXml({ onImportado }) {
  const [xmlFile, setXmlFile]     = useState(null);
  const [xmlPreview, setXmlPreview] = useState(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError]   = useState(null);
  const [xmlExito, setXmlExito]   = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleXmlFile = async (file) => {
    if (!file?.name.endsWith('.xml')) { setXmlError('Solo se aceptan archivos .xml'); return; }
    setXmlFile(file); setXmlPreview(null); setXmlError(null); setXmlExito(null);
    setXmlLoading(true);
    try {
      const fd = new FormData(); fd.append('xml', file); fd.append('accion', 'preview');
      const r = await fetch('/api/inventario/importar-xml/', { method: 'POST', headers: tok(), body: fd });
      const d = await r.json();
      if (!r.ok) { setXmlError(d.error ?? 'Error al parsear'); return; }
      setXmlPreview(d.datos);
    } catch { setXmlError('Error de conexión'); } finally { setXmlLoading(false); }
  };

  const confirmar = async () => {
    setXmlLoading(true);
    try {
      const fd = new FormData(); fd.append('xml', xmlFile); fd.append('accion', 'guardar');
      const r = await fetch('/api/inventario/importar-xml/', { method: 'POST', headers: tok(), body: fd });
      const d = await r.json();
      if (!r.ok) { setXmlError(d.error ?? 'Error al guardar'); return; }
      const res = d.resultado;
      setXmlExito(`Factura ${res.numero_factura} importada — ${res.total_items} línea(s) de ${res.proveedor}`);
      setXmlPreview(null); setXmlFile(null);
      onImportado?.();
      setTimeout(() => setXmlExito(null), 6000);
    } catch { setXmlError('Error de conexión'); } finally { setXmlLoading(false); }
  };

  const cancelar = () => { setXmlFile(null); setXmlPreview(null); setXmlError(null); setXmlExito(null); };

  return (
    <div className="max-w-4xl">
      {xmlError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2"><XCircleIcon className="h-5 w-5" />{xmlError}</div>}
      {xmlExito && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2"><CheckCircleIcon className="h-5 w-5" />{xmlExito}</div>}

      {!xmlPreview && (
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-white hover:border-purple-400 hover:bg-purple-50'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={e => { e.preventDefault(); setIsDragOver(false); handleXmlFile(e.dataTransfer.files[0]); }}
        >
          <ArrowUpTrayIcon className="h-12 w-12 text-purple-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-gray-700">{xmlLoading ? 'Procesando…' : 'Arrastra el XML aquí o haz clic para seleccionar'}</p>
          <p className="text-sm text-gray-500 mt-1">Facturas CFDI 4.0 del SAT (.xml)</p>
          <input ref={fileInputRef} type="file" accept=".xml" className="hidden"
            onChange={e => { handleXmlFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}

      {xmlPreview && (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
            <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2"><DocumentTextIcon className="h-6 w-6" />Vista previa de la factura</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div className="flex gap-2"><span className="text-gray-500">Proveedor:</span><strong className="flex items-center gap-1"><BuildingStorefrontIcon className="h-4 w-4 text-purple-500" />{xmlPreview.proveedor?.nombre}</strong></div>
              <div className="flex gap-2"><span className="text-gray-500">RFC:</span><span className="font-mono">{xmlPreview.proveedor?.rfc}</span></div>
              <div className="flex gap-2"><span className="text-gray-500">Factura:</span><span className="font-mono">{xmlPreview.numero_factura}</span></div>
              <div className="flex gap-2"><span className="text-gray-500">Fecha:</span><span>{xmlPreview.fecha_compra}</span></div>
              <div className="flex gap-2"><span className="text-gray-500">Subtotal:</span><span>${fmt(xmlPreview.subtotal)}</span></div>
              <div className="flex gap-2"><span className="text-gray-500">Total:</span><strong>${fmt(xmlPreview.total)}</strong></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>
                {['Código','Descripción','Medida','Marca','Modelo','IC/IV','Cant.','P. Compra'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {xmlPreview.items?.map((item, i) => (
                  <tr key={i} className="hover:bg-purple-50">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{item.codigo}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs text-xs">{item.descripcion}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.medida ? <span className="px-2 py-0.5 bg-red-100 text-[#a80008] rounded font-mono text-xs">{item.medida}</span> : <span className="text-red-500 text-xs">No detectada</span>}
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{item.marca_nombre || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{item.modelo || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-center">{item.indice_carga}{item.indice_velocidad}</td>
                    <td className="px-4 py-3 text-center font-bold">{item.cantidad}</td>
                    <td className="px-4 py-3 text-right font-mono">${item.precio_compra?.toLocaleString('es-MX', { minimumFractionDigits: 4 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-800">
            Si el código ya existe se registrará la entrada sin duplicarlo. Si es nuevo, se crea con precio de venta sugerido (+30% margen).
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
            <button onClick={cancelar} disabled={xmlLoading} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button onClick={confirmar} disabled={xmlLoading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
              {xmlLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importando…</> : <><ArrowDownTrayIcon className="h-4 w-4" />Confirmar e Importar</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Inventario() {
  const [tab, setTab]               = useState('consolidado');
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos]   = useState([]);
  const [kardexProducto, setKardexProducto] = useState(null);
  const [alertas, setAlertas]       = useState({ agotados: 0, stock_bajo: 0 });

  useEffect(() => {
    fetch('/api/inventario/proveedores/?activo=true', { headers: tok() })
      .then(r => r.json()).then(d => setProveedores(Array.isArray(d) ? d : (d.results ?? [])));
    fetch('/api/inventario/productos/', { headers: tok() })
      .then(r => r.json()).then(d => {
        const arr = Array.isArray(d) ? d : (d.results ?? []);
        setProductos(arr);
        setAlertas({
          agotados:  arr.filter(p => p.stock_agotado).length,
          stock_bajo: arr.filter(p => p.tiene_stock_bajo && !p.stock_agotado).length,
        });
      });
  }, []);

  const irKardex = (p) => { setKardexProducto(p); setTab('kardex'); };

  const TABS = [
    { id: 'consolidado', label: 'Consolidado',     icon: TableCellsIcon },
    { id: 'entradas',    label: 'Historial Entradas', icon: ArrowDownTrayIcon },
    { id: 'salidas',     label: 'Historial Salidas',  icon: ArrowUpTrayIcon },
    { id: 'kardex',      label: 'Kárdex',           icon: ChartBarIcon },
    { id: 'xml',         label: 'Importar XML',     icon: DocumentArrowUpIcon },
  ];

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-gray-500 text-sm">Gestión de productos, entradas, salidas y trazabilidad</p>
        </div>
      </div>

      {/* Alertas de stock */}
      <div className="flex flex-wrap gap-2 mb-4">
        {alertas.agotados > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border-l-4 border-red-500 px-4 py-2 rounded-r-lg">
            <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-800 font-medium">{alertas.agotados} producto(s) agotado(s)</span>
          </div>
        )}
        {alertas.stock_bajo > 0 && (
          <div className="flex items-center gap-2 bg-yellow-50 border-l-4 border-yellow-500 px-4 py-2 rounded-r-lg">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <span className="text-sm text-yellow-800 font-medium">{alertas.stock_bajo} producto(s) con stock bajo</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id ? 'border-[#df000a] text-[#df000a]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'consolidado' && <TabConsolidado onVerKardex={irKardex} />}
      {tab === 'entradas'    && <TabEntradas proveedores={proveedores} productos={productos} />}
      {tab === 'salidas'     && <TabSalidas />}
      {tab === 'kardex'      && <TabKardex productoInicial={kardexProducto} />}
      {tab === 'xml'         && <TabXml onImportado={() => {}} />}
    </div>
  );
}
