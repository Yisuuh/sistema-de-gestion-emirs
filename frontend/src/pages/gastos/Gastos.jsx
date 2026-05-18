import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { useConfirm } from '../../lib/confirm';
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

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]';
const selectCls = inputCls + ' bg-white';

const GASTO_VACIO = {
  fecha: today(), concepto: '', categoria: '', monto: '',
  metodo_pago: 'efectivo', responsable: '', notas: '', caja: '',
};

const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

export default function Gastos() {
  const confirm = useConfirm();
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Filtros
  const [filtros, setFiltros] = useState({
    fecha_inicio: today(), fecha_fin: today(), categoria: '', metodo_pago: '', responsable: '',
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(GASTO_VACIO);
  const [editando, setEditando] = useState(null);

  // Categorías CRUD
  const [modalCategorias, setModalCategorias] = useState(false);
  const [catForm, setCatForm] = useState({ nombre: '', descripcion: '', tipo: 'operativo' });
  const [catEditando, setCatEditando] = useState(null);
  const [savingCat, setSavingCat] = useState(false);

  // Cajas abiertas (para asociar gasto)
  const [cajasAbiertas, setCajasAbiertas] = useState([]);

  // Evidencia
  const [evidenciaFile, setEvidenciaFile] = useState(null);

  const showExito = (msg) => { setExito(msg); setTimeout(() => setExito(null), 3000); };

  const queryClient = useQueryClient();

  // ── Queries ────────────────────────────────────────────────────────────────────────────
  const { data: _gastosData, isPending: loading } = useQuery({
    queryKey: ['gastos-lista', filtros],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
      if (filtros.fecha_fin)    params.set('fecha_fin',    filtros.fecha_fin);
      if (filtros.categoria)    params.set('categoria',    filtros.categoria);
      if (filtros.metodo_pago)  params.set('metodo_pago',  filtros.metodo_pago);
      if (filtros.responsable)  params.set('responsable',  filtros.responsable);
      return apiClient.get(`${API}/gastos/?${params}`);
    },
  });
  const gastos = _gastosData?.results ?? _gastosData ?? [];

  const { data: resumen } = useQuery({
    queryKey: ['gastos-resumen'],
    queryFn: () => apiClient.get(`${API}/gastos/resumen/`),
  });

  const { data: _catalogos } = useQuery({
    queryKey: ['gastos-catalogos'],
    queryFn: () => Promise.all([
      apiClient.get(`${API}/categorias/`),
      apiClient.get('/api/nomina/empleados/?activo=true&page_size=100'),
    ]).then(([cats, emps]) => ({
      categorias: cats.results ?? cats,
      empleados:  emps.results ?? emps,
    })),
    staleTime: 1000 * 60 * 10,
  });
  const categorias = _catalogos?.categorias ?? [];
  const empleados  = _catalogos?.empleados  ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────────────────
  const guardarMutation = useMutation({
    mutationFn: ({ editandoId, fd }) => editandoId
      ? apiClient.patch(`${API}/gastos/${editandoId}/`, fd)
      : apiClient.post(`${API}/gastos/`, fd),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gastos-lista'] });
      queryClient.invalidateQueries({ queryKey: ['gastos-resumen'] });
      showExito(variables.editandoId ? 'Gasto actualizado' : 'Gasto registrado');
      setModal(false);
      setEvidenciaFile(null);
    },
    onError: (e) => setError(e.message),
  });
  const saving = guardarMutation.isPending;

  const eliminarMutation = useMutation({
    mutationFn: (id) => apiClient.del(`${API}/gastos/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-lista'] });
      queryClient.invalidateQueries({ queryKey: ['gastos-resumen'] });
      showExito('Gasto eliminado');
    },
    onError: (e) => setError(e.message),
  });

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
        caja: gasto.caja ?? '',
      });
      setEditando(gasto.id);
    } else {
      setForm({ ...GASTO_VACIO, fecha: today() });
      setEditando(null);
    }
    setEvidenciaFile(null);
    cargarCajasAbiertas();
    setModal(true);
  };

  const cargarCajasAbiertas = async () => {
    try {
      const data = await $fetch('/api/caja/cajas/?estado=abierta');
      setCajasAbiertas(data.results ?? data);
    } catch { /* silencio */ }
  };

  const guardar = (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('fecha', form.fecha);
    fd.append('concepto', form.concepto);
    fd.append('monto', parseFloat(form.monto));
    fd.append('metodo_pago', form.metodo_pago);
    if (form.categoria) fd.append('categoria', form.categoria);
    if (form.responsable) fd.append('responsable', form.responsable);
    if (form.caja) fd.append('caja', form.caja);
    if (form.notas) fd.append('notas', form.notas);
    if (evidenciaFile) fd.append('evidencia', evidenciaFile);
    guardarMutation.mutate({ editandoId: editando, fd });
  };

  const eliminar = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar gasto?',
      message: 'Esta acción es permanente y no se puede deshacer.',
      variant: 'danger',
    });
    if (!ok) return;
    eliminarMutation.mutate(id);
  };

  // ── CRUD Categorías ────────────────────────────────────────────
  const abrirModalCategorias = () => {
    setCatForm({ nombre: '', descripcion: '', tipo: 'operativo' });
    setCatEditando(null);
    setModalCategorias(true);
  };

  const abrirEditarCategoria = (c) => {
    setCatForm({ nombre: c.nombre, descripcion: c.descripcion ?? '', tipo: c.tipo ?? 'operativo' });
    setCatEditando(c.id);
    setModalCategorias(true);
  };

  const guardarCategoria = async (e) => {
    e.preventDefault();
    setSavingCat(true);
    try {
      const url = catEditando ? `${API}/categorias/${catEditando}/` : `${API}/categorias/`;
      const method = catEditando ? 'PUT' : 'POST';
      await $fetch(url, { method, body: JSON.stringify(catForm) });
      queryClient.invalidateQueries({ queryKey: ['gastos-catalogos'] });
      setCatEditando(null);
      setCatForm({ nombre: '', descripcion: '', tipo: 'operativo' });
      showExito(catEditando ? 'Categoría actualizada' : 'Categoría creada');
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingCat(false);
    }
  };

  const eliminarCategoria = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar categoría?',
      message: 'Solo se puede eliminar si no tiene gastos asociados.',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await $fetch(`${API}/categorias/${id}/`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['gastos-catalogos'] });
      showExito('Categoría eliminada');
    } catch (e) {
      setError('No se puede eliminar (tiene gastos asociados)');
    }
  };

  const totalFiltrado = useMemo(
    () => gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0),
    [gastos]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos y Egresos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de gastos operativos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => abrirModal()}
            className="flex items-center gap-2 bg-[#df000a] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#c4000a]"
          >
            <PlusIcon className="w-4 h-4" /> Registrar gasto
          </button>
          <button
            onClick={abrirModalCategorias}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            Categorías
          </button>
        </div>
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
            className="flex items-center gap-1 text-xs text-[#df000a] hover:text-[#a80008]"
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Responsable</label>
              <select className={selectCls} value={filtros.responsable}
                onChange={(e) => setFiltros({ ...filtros, responsable: e.target.value })}>
                <option value="">Todos</option>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre} {emp.apellido}</option>
                ))}
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
                          : g.metodo_pago === 'transferencia' ? 'bg-red-100 text-[#a80008]'
                          : 'bg-purple-100 text-purple-800'}`}>
                        {g.metodo_pago}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{g.responsable_nombre ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => abrirModal(g)} className="text-[#df000a] hover:text-[#df000a]">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Caja (opcional)</label>
                <select className={selectCls} value={form.caja}
                  onChange={(e) => setForm({ ...form, caja: e.target.value })}>
                  <option value="">— Sin caja —</option>
                  {cajasAbiertas.map((c) => (
                    <option key={c.id} value={c.id}>{c.folio} (abierta)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea rows={2} className={inputCls} value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones opcionales" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Evidencia (foto/comprobante)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEvidenciaFile(e.target.files[0] || null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-red-50 file:text-[#df000a] hover:file:bg-red-100"
                />
                {evidenciaFile && (
                  <p className="text-xs text-gray-400 mt-1">{evidenciaFile.name}</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] disabled:opacity-50">
                  {saving ? 'Guardando…' : editando ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Categorías ──────────────────────────────────────────────── */}
      {modalCategorias && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Categorías de Gastos</h2>
              <button onClick={() => setModalCategorias(false)}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Formulario nueva/editar categoría */}
              <form onSubmit={guardarCategoria} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {catEditando ? 'Editar categoría' : 'Nueva categoría'}
                  </label>
                  <input
                    required
                    className={inputCls}
                    value={catForm.nombre}
                    onChange={(e) => setCatForm({ ...catForm, nombre: e.target.value })}
                    placeholder="Nombre de la categoría"
                  />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select className={selectCls} value={catForm.tipo}
                    onChange={(e) => setCatForm({ ...catForm, tipo: e.target.value })}>
                    <option value="operativo">Operativo</option>
                    <option value="nomina">Nómina</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="mantenimiento">Mantenimiento</option>
                    <option value="servicios">Servicios</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <button type="submit" disabled={savingCat}
                  className="px-4 py-2 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] disabled:opacity-50 whitespace-nowrap">
                  {savingCat ? '…' : catEditando ? 'Actualizar' : 'Agregar'}
                </button>
                {catEditando && (
                  <button type="button"
                    onClick={() => { setCatEditando(null); setCatForm({ nombre: '', descripcion: '', tipo: 'operativo' }); }}
                    className="px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    ✕
                  </button>
                )}
              </form>
              {/* Lista de categorías */}
              <div className="border rounded-xl overflow-hidden">
                {categorias.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">Sin categorías aún</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Nombre</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Tipo</th>
                        <th className="px-4 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {categorias.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800">{c.nombre}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs capitalize">{c.tipo}</td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => abrirEditarCategoria(c)}
                                className="p-1 text-[#df000a] hover:bg-red-50 rounded">
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => eliminarCategoria(c.id)}
                                className="p-1 text-red-400 hover:bg-red-50 rounded">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setModalCategorias(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
