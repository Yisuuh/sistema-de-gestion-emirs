import { useState, useEffect } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  TruckIcon,
  XMarkIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import API_BASE from '../../config/api';

const API = `${API_BASE}/api/clientes`;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

// ─── Formularios vacíos ────────────────────────────────────────────────────
const CLIENTE_VACIO = { nombre: '', telefono: '', email: '', rfc: '', direccion: '', notas: '' };
const VEHICULO_VACIO = { marca: '', modelo: '', año: new Date().getFullYear(), placas: '', medida_llantas: '' };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Modal cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteForm, setClienteForm] = useState(CLIENTE_VACIO);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [savingCliente, setSavingCliente] = useState(false);

  // Panel de vehículos
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [modalVehiculo, setModalVehiculo] = useState(false);
  const [vehiculoForm, setVehiculoForm] = useState(VEHICULO_VACIO);
  const [vehiculoEditando, setVehiculoEditando] = useState(null);
  const [savingVehiculo, setSavingVehiculo] = useState(false);

  // ─── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    cargarClientes();
  }, []);

  const mostrarExito = (msg) => {
    setExito(msg);
    setTimeout(() => setExito(null), 3000);
  };

  // ─── Clientes ───────────────────────────────────────────────────────────
  const cargarClientes = async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = q
        ? `${API}/clientes/?search=${encodeURIComponent(q)}`
        : `${API}/clientes/`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      setClientes(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBusqueda = (e) => {
    setBusqueda(e.target.value);
    cargarClientes(e.target.value);
  };

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

  const guardarCliente = async (e) => {
    e.preventDefault();
    setSavingCliente(true);
    try {
      const url = clienteEditando
        ? `${API}/clientes/${clienteEditando}/`
        : `${API}/clientes/`;
      const method = clienteEditando ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(clienteForm) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err));
      }
      const saved = await res.json();
      if (clienteEditando) {
        setClientes((prev) => prev.map((c) => (c.id === clienteEditando ? saved : c)));
        if (clienteSeleccionado?.id === clienteEditando) setClienteSeleccionado(saved);
      } else {
        setClientes((prev) => [...prev, saved]);
      }
      setModalCliente(false);
      mostrarExito(clienteEditando ? 'Cliente actualizado' : 'Cliente creado');
    } catch (e) {
      setError('Error al guardar cliente: ' + e.message);
    } finally {
      setSavingCliente(false);
    }
  };

  const eliminarCliente = async (id) => {
    if (!window.confirm('¿Eliminar este cliente? También se eliminarán sus vehículos.')) return;
    try {
      const res = await fetch(`${API}/clientes/${id}/`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error();
      setClientes((prev) => prev.filter((c) => c.id !== id));
      if (clienteSeleccionado?.id === id) setClienteSeleccionado(null);
      mostrarExito('Cliente eliminado');
    } catch {
      setError('Error al eliminar cliente');
    }
  };

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

  const guardarVehiculo = async (e) => {
    e.preventDefault();
    setSavingVehiculo(true);
    try {
      const url = vehiculoEditando
        ? `${API}/vehiculos/${vehiculoEditando}/`
        : `${API}/vehiculos/`;
      const method = vehiculoEditando ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: headers(),
        body: JSON.stringify({ ...vehiculoForm, cliente: clienteSeleccionado.id }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      const updatedVehiculos = vehiculoEditando
        ? clienteSeleccionado.vehiculos.map((v) => (v.id === vehiculoEditando ? saved : v))
        : [...(clienteSeleccionado.vehiculos || []), saved];
      const updatedCliente = { ...clienteSeleccionado, vehiculos: updatedVehiculos };
      setClienteSeleccionado(updatedCliente);
      setClientes((prev) => prev.map((c) => (c.id === updatedCliente.id ? updatedCliente : c)));
      setModalVehiculo(false);
      mostrarExito(vehiculoEditando ? 'Vehículo actualizado' : 'Vehículo agregado');
    } catch {
      setError('Error al guardar vehículo');
    } finally {
      setSavingVehiculo(false);
    }
  };

  const eliminarVehiculo = async (id) => {
    if (!window.confirm('¿Eliminar este vehículo?')) return;
    try {
      const res = await fetch(`${API}/vehiculos/${id}/`, { method: 'DELETE', headers: headers() });
      if (!res.ok) throw new Error();
      const updatedVehiculos = clienteSeleccionado.vehiculos.filter((v) => v.id !== id);
      const updatedCliente = { ...clienteSeleccionado, vehiculos: updatedVehiculos };
      setClienteSeleccionado(updatedCliente);
      setClientes((prev) => prev.map((c) => (c.id === updatedCliente.id ? updatedCliente : c)));
      mostrarExito('Vehículo eliminado');
    } catch {
      setError('Error al eliminar vehículo');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={abrirModalNuevoCliente}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      {/* Notificaciones */}
      {exito && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg">
          {exito}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex justify-between">
          {error}
          <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-6">
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
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
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                        clienteSeleccionado?.id === cliente.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setClienteSeleccionado(cliente)}
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
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                            title="Editar"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => eliminarCliente(cliente.id)}
                            className="p-1.5 text-red-600 hover:bg-red-100 rounded"
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
          <div className="w-80 shrink-0">
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

              {/* Vehículos */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <TruckIcon className="w-4 h-4" />
                    Vehículos
                  </h3>
                  <button
                    onClick={abrirModalNuevoVehiculo}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
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
                            <p className="text-blue-600 font-medium mt-0.5">{v.medida_llantas}</p>
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            <button
                              onClick={() => abrirModalEditarVehiculo(v)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
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
            </div>
          </div>
        )}
      </div>

      {/* ══ Modal Cliente ══════════════════════════════════════════════════ */}
      {modalCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {clienteEditando ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setModalCliente(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarCliente} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={clienteForm.nombre}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="XAXX010101000"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm({ ...clienteForm, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={clienteForm.direccion}
                    onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Calle, número, colonia..."
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    rows={2}
                    value={clienteForm.notas}
                    onChange={(e) => setClienteForm({ ...clienteForm, notas: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
                  disabled={savingCliente}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {savingCliente ? 'Guardando...' : clienteEditando ? 'Actualizar' : 'Crear Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Modal Vehículo ═════════════════════════════════════════════════ */}
      {modalVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {vehiculoEditando ? 'Editar Vehículo' : 'Agregar Vehículo'}
              </h2>
              <button onClick={() => setModalVehiculo(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarVehiculo} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Marca <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.marca}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, marca: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Placas</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={vehiculoForm.placas}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, placas: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  disabled={savingVehiculo}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {savingVehiculo ? 'Guardando...' : vehiculoEditando ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
