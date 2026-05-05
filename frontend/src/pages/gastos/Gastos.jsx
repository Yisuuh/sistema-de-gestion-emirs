import { useEffect, useState } from 'react';
import {
  PlusIcon, TrashIcon, PencilIcon, XMarkIcon,
  FunnelIcon, BanknotesIcon,
} from '@heroicons/react/24/outline';

const API = '/api/gastos';
const hdrs = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const $fetch = async (url, opts = {}) => {
  const res = await fetch(url, { headers: hdrs(), ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || JSON.stringify(err));
  }
  return res.status === 204 ? null : res.json();
};
const fmt = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const today = () => new Date().toISOString().slice(0, 10);

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const selectCls = inputCls + ' bg-white';

const GASTO_VACIO = {
  fecha: today(), concepto: '', categoria: '', monto: '',
  metodo_pago: 'efectivo', responsable: '', notas: '',
};

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Resumen
  const [resumen, setResumen] = useState(null);

  // Filtros
  const [filtros, setFiltros] = useState({
    fecha_inicio: today(), fecha_fin: today(), categoria: '', metodo_pago: '',
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(GASTO_VACIO);
  const [editando, setEditando] = useState(null);
  const [saving, setSaving] = useState(false);

  const showExito = (msg) => { setExito(msg); setTimeout(() => setExito(null), 3000); };

  useEffect(() => {
    cargarCatalogos();
    cargarResumen();
  }, []);

  useEffect(() => {
    cargarGastos();
  }, [filtros]);

  const cargarCatalogos = async () => {
    try {
      const [cats, emps] = await Promise.all([
        $fetch(`${API}/categorias/`),
        $fetch('/api/nomina/empleados/?activo=true&page_size=100'),
      ]);
      setCategorias(cats.results ?? cats);
      setEmpleados(emps.results ?? emps);
    } catch (e) {
      console.error(e);
    }
  };

  const cargarGastos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
      if (filtros.fecha_fin) params.set('fecha_fin', filtros.fecha_fin);
      if (filtros.categoria) params.set('categoria', filtros.categoria);
      if (filtros.metodo_pago) params.set('metodo_pago', filtros.metodo_pago);
      const data = await $fetch(`${API}/gastos/?${params}`);
      setGastos(data.results ?? data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const cargarResumen = async () => {
    try {
      const data = await $fetch(`${API}/gastos/resumen/`);
      setResumen(data);
    } catch (e) {
      console.error(e);
    }
  };

  const abrirModal = (gasto = null) => {
    if (gasto) {
      setForm({
        fecha: gasto.fecha,
        concepto: gasto.concepto,
        categoria: gasto.categoria ?? '',
        monto: gasto.monto,
        metodo_pago: gasto.metodo_pago,
        responsable: gasto.responsable ?? '',
        notas: gasto.notas,
      });
      setEditando(gasto.id);
    } else {
      setForm({ ...GASTO_VACIO, fecha: today() });
      setEditando(null);
    }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        monto: parseFloat(form.monto),
        categoria: form.categoria || null,
        responsable: form.responsable || null,
      };
      if (editando) {
        await $fetch(`${API}/gastos/${editando}/`, {
          method: 'PUT', body: JSON.stringify(body),
        });
        showExito('Gasto actualizado');
      } else {
        await $fetch(`${API}/gastos/`, {
          method: 'POST', body: JSON.stringify(body),
        });
        showExito('Gasto registrado');
      }
      setModal(false);
      await Promise.all([cargarGastos(), cargarResumen()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    try {
      await $fetch(`${API}/gastos/${id}/`, { method: 'DELETE' });
      showExito('Gasto eliminado');
      await Promise.all([cargarGastos(), cargarResumen()]);
    } catch (e) {
      setError(e.message);
    }
  };

  const totalFiltrado = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos y Egresos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de gastos operativos</p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
        >
          <PlusIcon className="w-4 h-4" /> Registrar gasto
        </button>
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}
      {exito && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{exito}</div>
      )}

      {/* Tarjetas resumen */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Gastos Hoy</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(resumen.hoy.total)}</p>
            <p className="text-xs text-gray-400">{resumen.hoy.cantidad} registros</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Gastos del Mes</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{fmt(resumen.mes.total)}</p>
            <p className="text-xs text-gray-400">{resumen.mes.cantidad} registros</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500 uppercase font-medium">Top Categoría</p>
            {resumen.por_categoria[0] ? (
              <>
                <p className="text-lg font-bold text-gray-800 mt-1">{resumen.por_categoria[0].categoria__nombre ?? 'Sin categoría'}</p>
                <p className="text-xs text-gray-400">{fmt(resumen.por_categoria[0].total)}</p>
              </>
            ) : <p className="text-sm text-gray-400 mt-1">—</p>}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Filtros</span>
          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <FunnelIcon className="w-4 h-4" />
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {mostrarFiltros && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" className={inputCls} value={filtros.fecha_inicio}
                onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" className={inputCls} value={filtros.fecha_fin}
                onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Categoría</label>
              <select className={selectCls} value={filtros.categoria}
                onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}>
                <option value="">Todas</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Método de pago</label>
              <select className={selectCls} value={filtros.metodo_pago}
                onChange={(e) => setFiltros({ ...filtros, metodo_pago: e.target.value })}>
                <option value="">Todos</option>
                {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-medium text-gray-700">
            {gastos.length} registros
          </span>
          <span className="text-sm font-bold text-red-700">Total: {fmt(totalFiltrado)}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
        ) : gastos.length === 0 ? (
          <div className="p-12 text-center">
            <BanknotesIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No hay gastos registrados en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Concepto</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-center">Método</th>
                  <th className="px-4 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gastos.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{g.fecha}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{g.concepto}</td>
                    <td className="px-4 py-2 text-gray-500">{g.categoria_nombre ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700 tabular-nums">{fmt(g.monto)}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${g.metodo_pago === 'efectivo' ? 'bg-green-100 text-green-800'
                          : g.metodo_pago === 'transferencia' ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'}`}>
                        {g.metodo_pago}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{g.responsable_nombre ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => abrirModal(g)} className="text-blue-500 hover:text-blue-700">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => eliminar(g.id)} className="text-red-400 hover:text-red-600">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold text-sm border-t-2">
                  <td colSpan={3} className="px-4 py-3 text-right text-gray-600">TOTAL</td>
                  <td className="px-4 py-3 text-right text-red-700 tabular-nums">{fmt(totalFiltrado)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{editando ? 'Editar gasto' : 'Registrar gasto'}</h2>
              <button onClick={() => setModal(false)}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={guardar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha <span className="text-red-500">*</span></label>
                  <input type="date" required className={inputCls} value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Monto <span className="text-red-500">*</span></label>
                  <input type="number" required min="0.01" step="0.01" className={inputCls} value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Concepto <span className="text-red-500">*</span></label>
                <input required className={inputCls} value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Descripción del gasto" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                  <select className={selectCls} value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
                  <select className={selectCls} value={form.metodo_pago}
                    onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}>
                    {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Responsable</label>
                <select className={selectCls} value={form.responsable}
                  onChange={(e) => setForm({ ...form, responsable: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.nombre} {emp.apellido}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea rows={2} className={inputCls} value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones opcionales" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando…' : editando ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
