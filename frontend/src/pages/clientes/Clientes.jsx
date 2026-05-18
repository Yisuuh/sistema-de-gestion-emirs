import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../../lib/confirm';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  TruckIcon,
  XMarkIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const API = '/api/clientes';
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// ─── Formularios vacíos ────────────────────────────────────────────────────
const CLIENTE_VACIO = { nombre: '', telefono: '', email: '', rfc: '', direccion: '', notas: '' };
const VEHICULO_VACIO = { marca: '', modelo: '', año: new Date().getFullYear(), placas: '', medida_llantas: '' };

export default function Clientes() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Modal cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteForm, setClienteForm] = useState(CLIENTE_VACIO);
  const [clienteEditando, setClienteEditando] = useState(null);

  // Panel lateral
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [panelTab, setPanelTab] = useState('vehiculos');
  const [modalVehiculo, setModalVehiculo] = useState(false);
  const [vehiculoForm, setVehiculoForm] = useState(VEHICULO_VACIO);
  const [vehiculoEditando, setVehiculoEditando] = useState(null);

  const mostrarExito = (msg) => {
    setExito(msg);
    setTimeout(() => setExito(null), 3000);
  };

  // ─── Clientes ───────────────────────────────────────────────────────────
  const { data: clientes = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['clientes', busqueda],
    queryFn: async () => {
      const url = busqueda
        ? `${API}/clientes/?search=${encodeURIComponent(busqueda)}`
        : `${API}/clientes/`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      return Array.isArray(data) ? data : data.results || [];
    },
  });

  const handleBusqueda = (e) => setBusqueda(e.target.value);

  const guardarClienteMut = useMutation({
    mutationFn: async (formData) => {
      const url = clienteEditando
        ? `${API}/clientes/${clienteEditando}/`
        : `${API}/clientes/`;
      const method = clienteEditando ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(formData) });
      if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
      return res.json();
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      if (clienteSeleccionado?.id === clienteEditando) setClienteSeleccionado(saved);
      setModalCliente(false);
      mostrarExito(clienteEditando ? 'Cliente actualizado' : 'Cliente creado');
    },
    onError: (e) => setError('Error al guardar cliente: ' + e.message),
  });

  const eliminarClienteMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${API}/clientes/${id}/`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error();
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      if (clienteSeleccionado?.id === id) setClienteSeleccionado(null);
      mostrarExito('Cliente eliminado');
    },
    onError: () => setError('Error al eliminar cliente'),
  });

  const abrirModalNuevoCliente = () => {
    setClienteEditando(null);
    setClienteForm(CLIENTE_VACIO);
    setModalCliente(true);
  };

  const abrirModalEditarCliente = (cliente) => {
    setClienteEditando(cliente.id);
    setClienteForm({
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email || '',
      rfc: cliente.rfc || '',
      direccion: cliente.direccion || '',
      notas: cliente.notas || '',
    });
    setModalCliente(true);
  };

  const guardarCliente = (e) => {
    e.preventDefault();
    guardarClienteMut.mutate(clienteForm);
  };

  const eliminarCliente = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar cliente?',
      message: 'También se eliminarán todos sus vehículos registrados.',
      variant: 'danger',
    });
    if (!ok) return;
    eliminarClienteMut.mutate(id);
  };

  // ─── Selección de cliente ────────────────────────────────────────────────
  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente);
    setPanelTab('vehiculos');
  };

  // ─── Historial de compras ────────────────────────────────────────────────
  const { data: compras = [], isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-cliente', clienteSeleccionado?.id],
    queryFn: async () => {
      const res = await fetch(`${API}/clientes/${clienteSeleccionado.id}/ventas/`, { headers: headers() });
      if (!res.ok) throw new Error('Error al cargar compras');
      const data = await res.json();
      return Array.isArray(data) ? data : data.results || [];
    },
    enabled: !!clienteSeleccionado && panelTab === 'compras',
  });

  // ─── Vehículos ───────────────────────────────────────────────────────────
  const abrirModalNuevoVehiculo = () => {
    setVehiculoEditando(null);
    setVehiculoForm({ ...VEHICULO_VACIO, cliente: clienteSeleccionado.id });
    setModalVehiculo(true);
  };

  const abrirModalEditarVehiculo = (v) => {
    setVehiculoEditando(v.id);
    setVehiculoForm({
      cliente: v.cliente,
      marca: v.marca,
      modelo: v.modelo,
      año: v.año,
      placas: v.placas || '',
      medida_llantas: v.medida_llantas,
    });
    setModalVehiculo(true);
  };

  const guardarVehiculoMut = useMutation({
    mutationFn: async (formData) => {
      const url = vehiculoEditando
        ? `${API}/vehiculos/${vehiculoEditando}/`
        : `${API}/vehiculos/`;
      const method = vehiculoEditando ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: headers(),
        body: JSON.stringify({ ...formData, cliente: clienteSeleccionado.id }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (saved) => {
      const updatedVehiculos = vehiculoEditando
        ? clienteSeleccionado.vehiculos.map((v) => (v.id === vehiculoEditando ? saved : v))
        : [...(clienteSeleccionado.vehiculos || []), saved];
      const updatedCliente = { ...clienteSeleccionado, vehiculos: updatedVehiculos };
      setClienteSeleccionado(updatedCliente);
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setModalVehiculo(false);
      mostrarExito(vehiculoEditando ? 'Vehículo actualizado' : 'Vehículo agregado');
    },
    onError: () => setError('Error al guardar vehículo'),
  });

  const guardarVehiculo = (e) => {
    e.preventDefault();
    guardarVehiculoMut.mutate(vehiculoForm);
  };

  const eliminarVehiculoMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${API}/vehiculos/${id}/`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error();
      return id;
    },
    onSuccess: (id) => {
      const updatedVehiculos = clienteSeleccionado.vehiculos.filter((v) => v.id !== id);
      const updatedCliente = { ...clienteSeleccionado, vehiculos: updatedVehiculos };
      setClienteSeleccionado(updatedCliente);
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      mostrarExito('Vehículo eliminado');
    },
    onError: () => setError('Error al eliminar vehículo'),
  });

  const eliminarVehiculo = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar vehículo?',
      message: 'Esta acción no se puede deshacer.',
      variant: 'danger',
    });
    if (!ok) return;
    eliminarVehiculoMut.mutate(id);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={abrirModalNuevoCliente}
          className="flex items-center gap-2 bg-[#df000a] text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-[#c4000a] transition-colors whitespace-nowrap text-sm sm:text-base"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Nuevo Cliente</span>
          <span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      {/* Notificaciones */}
      {exito && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg">
          {exito}
        </div>
      )}
      {(error || queryError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex justify-between">
          {error || 'Error al cargar clientes'}
          <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* ── Lista de clientes ── */}
        <div className="flex-1 min-w-0">
          {/* Buscador */}
          <div className="relative mb-4">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, teléfono, email o RFC..."
              value={busqueda}
              onChange={handleBusqueda}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Cargando...</div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <UserIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No se encontraron clientes</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-left px-4 py-3">Teléfono</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-center px-4 py-3">Vehículos</th>
                    <th className="text-center px-4 py-3">Compras</th>
                    <th className="text-center px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientes.map((cliente) => (
                    <tr
                      key={cliente.id}
                      className={`hover:bg-red-50 cursor-pointer transition-colors ${
                        clienteSeleccionado?.id === cliente.id ? 'bg-red-50' : ''
                      }`}
                      onClick={() => seleccionarCliente(cliente)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{cliente.nombre}</td>
                      <td className="px-4 py-3 text-gray-600">{cliente.telefono}</td>
                      <td className="px-4 py-3 text-gray-500">{cliente.email || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-gray-700">
                          <TruckIcon className="w-3.5 h-3.5" />
                          {cliente.vehiculos?.length || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{cliente.total_compras}</td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => abrirModalEditarCliente(cliente)}
                            className="p-2 text-[#df000a] hover:bg-red-100 rounded"
                            title="Editar"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => eliminarCliente(cliente.id)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded"
                            title="Eliminar"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel de vehículos ── */}
        {clienteSeleccionado && (
          <div className="w-full md:w-80 md:shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Encabezado panel */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{clienteSeleccionado.nombre}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{clienteSeleccionado.telefono}</p>
                  {clienteSeleccionado.rfc && (
                    <p className="text-xs text-gray-500">RFC: {clienteSeleccionado.rfc}</p>
                  )}
                </div>
                <button onClick={() => setClienteSeleccionado(null)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Info adicional */}
              {(clienteSeleccionado.direccion || clienteSeleccionado.notas) && (
                <div className="px-4 py-2 text-xs text-gray-600 border-b border-gray-100 space-y-1">
                  {clienteSeleccionado.direccion && <p>{clienteSeleccionado.direccion}</p>}
                  {clienteSeleccionado.notas && <p className="italic">{clienteSeleccionado.notas}</p>}
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setPanelTab('vehiculos')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    panelTab === 'vehiculos' ? 'text-[#df000a] border-b-2 border-[#df000a]' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Vehículos ({clienteSeleccionado.vehiculos?.length || 0})
                </button>
                <button
                  onClick={() => setPanelTab('compras')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    panelTab === 'compras' ? 'text-[#df000a] border-b-2 border-[#df000a]' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Compras ({clienteSeleccionado.total_compras})
                </button>
              </div>

              {/* Tab: Vehículos */}
              {panelTab === 'vehiculos' && (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <TruckIcon className="w-4 h-4" />
                      Vehículos
                    </h3>
                    <button
                      onClick={abrirModalNuevoVehiculo}
                      className="flex items-center gap-1 text-xs text-[#df000a] hover:text-[#a80008]"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      Agregar
                    </button>
                  </div>

                  {!clienteSeleccionado.vehiculos?.length ? (
                    <p className="text-xs text-gray-400 text-center py-4">Sin vehículos registrados</p>
                  ) : (
                    <ul className="space-y-2">
                      {clienteSeleccionado.vehiculos.map((v) => (
                        <li key={v.id} className="bg-gray-50 rounded-lg p-3 text-xs">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-800">
                                {v.marca} {v.modelo} {v.año}
                              </p>
                              {v.placas && <p className="text-gray-500">Placas: {v.placas}</p>}
                              <p className="text-[#df000a] font-medium mt-0.5">{v.medida_llantas}</p>
                            </div>
                            <div className="flex gap-1 ml-2 shrink-0">
                              <button
                                onClick={() => abrirModalEditarVehiculo(v)}
                                className="p-1 text-[#df000a] hover:bg-red-100 rounded"
                              >
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => eliminarVehiculo(v.id)}
                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Tab: Historial de compras */}
              {panelTab === 'compras' && (
                <div className="p-4">
                  {loadingCompras ? (
                    <p className="text-xs text-gray-400 text-center py-4">Cargando...</p>
                  ) : compras.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Sin compras registradas</p>
                  ) : (
                    <ul className="space-y-2">
                      {compras.map((v) => (
                        <li key={v.id} className="bg-gray-50 rounded-lg p-3 text-xs">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-mono font-semibold text-gray-800">{v.folio}</p>
                              <p className="text-gray-500 mt-0.5">{v.fecha_formateada || v.fecha}</p>
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-gray-200 rounded text-gray-600 capitalize">
                                {v.metodo_pago}
                              </span>
                            </div>
                            <p className="font-bold text-[#df000a]">
                              ${Number(v.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          {v.detalles && v.detalles.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-200 space-y-0.5">
                              {v.detalles.map((d, i) => (
                                <p key={i} className="text-gray-500 truncate">
                                  {d.producto_nombre || d.descripcion} ×{d.cantidad}
                                </p>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ══ Modal Cliente ══════════════════════════════════════════════════ */}
      {modalCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {clienteEditando ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setModalCliente(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarCliente} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={clienteForm.nombre}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Nombre completo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="tel"
                    value={clienteForm.telefono}
                    onChange={(e) => setClienteForm({ ...clienteForm, telefono: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="10 dígitos"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RFC</label>
                  <input
                    type="text"
                    maxLength={13}
                    value={clienteForm.rfc}
                    onChange={(e) => setClienteForm({ ...clienteForm, rfc: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="XAXX010101000"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm({ ...clienteForm, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={clienteForm.direccion}
                    onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Calle, número, colonia..."
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    rows={2}
                    value={clienteForm.notas}
                    onChange={(e) => setClienteForm({ ...clienteForm, notas: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent resize-none"
                    placeholder="Observaciones adicionales..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCliente(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarClienteMut.isPending}
                  className="flex-1 bg-[#df000a] text-white py-2 rounded-lg hover:bg-[#c4000a] transition-colors disabled:opacity-50"
                >
                  {guardarClienteMut.isPending ? 'Guardando...' : clienteEditando ? 'Actualizar' : 'Crear Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Modal Vehículo ═════════════════════════════════════════════════ */}
      {modalVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {vehiculoEditando ? 'Editar Vehículo' : 'Agregar Vehículo'}
              </h2>
              <button onClick={() => setModalVehiculo(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarVehiculo} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marca <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.marca}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, marca: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Toyota, Nissan..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modelo <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.modelo}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, modelo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Hilux, Frontier..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Año <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    value={vehiculoForm.año}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, año: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Placas</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={vehiculoForm.placas}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, placas: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="ABC-1234"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Medida de Llantas <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.medida_llantas}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, medida_llantas: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="225/65R17"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalVehiculo(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarVehiculoMut.isPending}
                  className="flex-1 bg-[#df000a] text-white py-2 rounded-lg hover:bg-[#c4000a] transition-colors disabled:opacity-50"
                >
                  {guardarVehiculoMut.isPending ? 'Guardando...' : vehiculoEditando ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
