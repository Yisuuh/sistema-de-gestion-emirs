import { useState, useMemo, useEffect } from 'react';
import ModalTicket from '../../components/ModalTicket';
import TabCotizador from './TabCotizador';
import { coincideProductoInteligente, detectarMedidaFormateada } from '../../lib/medidaUtils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, TrashIcon, MagnifyingGlassIcon, ShoppingCartIcon,
  WrenchScrewdriverIcon, PencilIcon, CheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (n) => Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Spinner({ sm }) {
  return (
    <div className={`flex justify-center items-center ${sm ? 'py-4' : 'py-16'}`}>
      <div className={`border-4 border-[#df000a] border-t-transparent rounded-full animate-spin ${sm ? 'w-6 h-6' : 'w-10 h-10'}`} />
    </div>
  );
}

// ─── Tab Servicios ───────────────────────────────────────────────────────────
function TabServicios() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', precio: '', activo: true });
  const [errors, setErrors] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);

  const { data: servicios = [], isLoading: loading } = useQuery({
    queryKey: ['ventas-servicios', soloActivos],
    queryFn: async () => {
      const url = soloActivos
        ? '/api/ventas/servicios/?activos=true'
        : '/api/ventas/servicios/?activos=false';
      const r = await fetch(url, { headers: tok() });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : (d.results || []);
    },
  });

  const abrirNuevo = () => {
    setForm({ nombre: '', descripcion: '', precio: '', activo: true });
    setErrors({});
    setModal('nuevo');
  };

  const abrirEditar = (s) => {
    setForm({ nombre: s.nombre, descripcion: s.descripcion || '', precio: String(s.precio), activo: s.activo });
    setErrors({});
    setModal(s);
  };

  const validar = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido';
    if (!form.precio || isNaN(form.precio) || Number(form.precio) <= 0) e.precio = 'Precio inválido (debe ser mayor a 0)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const guardarMut = useMutation({
    mutationFn: async () => {
      const esEdicion = modal !== 'nuevo';
      const url = esEdicion ? `/api/ventas/servicios/${modal.id}/` : '/api/ventas/servicios/';
      const method = esEdicion ? 'PUT' : 'POST';
      const body = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        precio: parseFloat(form.precio),
        activo: form.activo,
      };
      const r = await fetch(url, {
        method,
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(Object.values(err).flat().join(' ')); }
      return r.json();
    },
    onSuccess: () => {
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['ventas-servicios'] });
    },
    onError: (e) => setErrors({ _general: e.message }),
  });

  const toggleActivoMut = useMutation({
    mutationFn: async (s) => {
      const r = await fetch(`/api/ventas/servicios/${s.id}/`, {
        method: 'PATCH',
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !s.activo }),
      });
      if (!r.ok) throw new Error('Error al actualizar el servicio');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ventas-servicios'] }),
    onError: (e) => setErrors({ _general: e.message }),
  });

  const guardar = () => {
    if (!validar()) return;
    guardarMut.mutate();
  };

  const toggleActivo = (s) => toggleActivoMut.mutate(s);

  const filtrados = useMemo(
    () => servicios.filter(s =>
      s.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (s.descripcion || '').toLowerCase().includes(busqueda.toLowerCase())
    ),
    [servicios, busqueda]
  );

  return (
    <div className="space-y-4">
      {errors._general && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          <span className="flex-1">{errors._general}</span>
          <button onClick={() => setErrors(e => ({ ...e, _general: undefined }))} className="text-red-400 hover:text-red-600">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar servicio..."
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent w-full sm:w-56"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox" checked={soloActivos}
              onChange={e => setSoloActivos(e.target.checked)}
              className="accent-[#df000a]"
            />
            Solo activos
          </label>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-2 bg-[#df000a] hover:bg-[#c4000a] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <PlusIcon className="w-4 h-4" /> Nuevo Servicio
        </button>
      </div>

      {/* Tabla */}
      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-gray-50">
              <tr>
                {['Nombre', 'Descripción', 'Precio', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Sin servicios{busqueda ? ' para esa búsqueda' : ''}
                  </td>
                </tr>
              ) : filtrados.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.nombre}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{s.descripcion || '—'}</td>
                  <td className="px-4 py-3 font-bold text-[#df000a]">${fmt(s.precio)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                      ${s.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.activo ? <CheckIcon className="w-3 h-3" /> : <XMarkIcon className="w-3 h-3" />}
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => abrirEditar(s)} title="Editar"
                        className="p-2 text-gray-400 hover:text-[#df000a] transition-colors rounded">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActivo(s)}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors
                          ${s.activo ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                        {s.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {modal === 'nuevo' ? 'Nuevo Servicio' : 'Editar Servicio'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {errors._general && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {errors._general}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre *</label>
                <input
                  value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]
                    ${errors.nombre ? 'border-red-400' : 'border-gray-300'}`}
                />
                {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Descripción</label>
                <textarea
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Precio *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01" value={form.precio}
                    onChange={e => setForm({ ...form, precio: e.target.value })}
                    className={`w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]
                      ${errors.precio ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </div>
                {errors.precio && <p className="text-red-500 text-xs mt-1">{errors.precio}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" checked={form.activo}
                  onChange={e => setForm({ ...form, activo: e.target.checked })}
                  className="accent-[#df000a]"
                />
                Servicio activo
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardarMut.isPending}
                className="px-5 py-2 bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {guardarMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {modal === 'nuevo' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab POS ─────────────────────────────────────────────────────────────────
function TabPOS({ itemPrecargado, onClearItemPrecargado }) {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [empleadoSel, setEmpleadoSel] = useState('');
  const [clienteSel, setClienteSel] = useState('');
  const [vehiculoSel, setVehiculoSel] = useState('');
  const [kilometrajeActual, setKilometrajeActual] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [tipoTarjeta, setTipoTarjeta] = useState('debito');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoElectronico, setMontoElectronico] = useState('');
  const [numOperacion, setNumOperacion] = useState('');
  const [numReferencia, setNumReferencia] = useState('');
  const [descuento, setDescuento] = useState('');
  const [notas, setNotas] = useState('');
  const [tabItems, setTabItems] = useState('productos');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [ventaOk, setVentaOk] = useState(null);
  const [ticketVenta, setTicketVenta] = useState(null);

  const [redondearCentavos, setRedondearCentavos] = useState(false);

  const toArr = async r => r.ok ? r.json().then(d => Array.isArray(d) ? d : (d.results || [])) : [];

  const { data: cajaActivaData, isLoading: loadingCaja } = useQuery({
    queryKey: ['caja-activa-pos'],
    queryFn: async () => {
      const r = await fetch('/api/caja/cajas/caja_actual/', { headers: tok() });
      if (!r.ok) return null;
      const d = await r.json();
      return (d && d.estado === 'abierta') ? d : null;
    },
    staleTime: 15 * 1000,
  });
  const hayCajaAbierta = !!cajaActivaData;

  const { data: productos = [], isLoading: loadingProductos } = useQuery({
    queryKey: ['pos-productos'],
    queryFn: () => fetch('/api/inventario/productos/?activo=true', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });
  const { data: servicios = [], isLoading: loadingServicios } = useQuery({
    queryKey: ['pos-servicios'],
    queryFn: () => fetch('/api/ventas/servicios/?activos=true', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['pos-clientes'],
    queryFn: () => fetch('/api/clientes/clientes/', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });
  const { data: empleados = [], isLoading: loadingEmpleados } = useQuery({
    queryKey: ['pos-empleados'],
    queryFn: () => fetch('/api/nomina/empleados/?activos=true', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });

  // Precargar opción enviada desde el Cotizador Multimarca
  useEffect(() => {
    if (itemPrecargado && itemPrecargado.producto) {
      const prod = itemPrecargado.producto;
      const cant = Math.max(1, Math.min(itemPrecargado.cantidad || 1, prod.stock_actual ?? 999));
      const precio = parseFloat(itemPrecargado.precio_unitario || prod.precio_descuento || prod.precio_venta) || 0;
      const key = `p-${prod.id}`;
      setCarrito(prev => {
        const existe = prev.find(i => i._key === key);
        if (existe) {
          return prev.map(i => i._key === key
            ? { ...i, cantidad: cant, precio_unitario: precio, subtotal: cant * precio }
            : i
          );
        }
        return [...prev, {
          _key: key,
          id: Date.now(),
          producto: prod,
          servicio: null,
          descripcion: prod.descripcion_completa || prod.codigo,
          cantidad: cant,
          precio_unitario: precio,
          subtotal: cant * precio,
          stock_max: prod.stock_actual ?? 999,
        }];
      });
      if (itemPrecargado.clienteId) setClienteSel(String(itemPrecargado.clienteId));
      if (itemPrecargado.vehiculoId) setVehiculoSel(String(itemPrecargado.vehiculoId));
      onClearItemPrecargado?.();
    }
  }, [itemPrecargado, onClearItemPrecargado]);

  const clienteActualObj = useMemo(
    () => clientes.find(c => String(c.id) === String(clienteSel)) || null,
    [clientes, clienteSel]
  );

  const medidaDetectadaPOS = useMemo(
    () => (tabItems === 'productos' ? detectarMedidaFormateada(busqueda) : null),
    [busqueda, tabItems]
  );

  const loadingData = loadingProductos || loadingServicios || loadingClientes || loadingEmpleados;

  const itemsFiltrados = tabItems === 'productos'
    ? productos.filter(p => coincideProductoInteligente(p, busqueda))
    : servicios.filter(s =>
        (s.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (s.descripcion || '').toLowerCase().includes(busqueda.toLowerCase())
      );

  const agregarAlCarrito = (item) => {
    const esProducto = tabItems === 'productos';
    const key = esProducto ? `p-${item.id}` : `s-${item.id}`;
    const existente = carrito.find(i => i._key === key);
    if (existente) {
      if (esProducto && existente.cantidad >= (item.stock_actual ?? 999)) return;
      setCarrito(c => c.map(i => i._key === key
        ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * i.precio_unitario }
        : i
      ));
    } else {
      const precio = parseFloat(item.precio_descuento || item.precio_venta || item.precio) || 0;
      setCarrito(c => [...c, {
        _key: key, id: Date.now(),
        producto: esProducto ? item : null,
        servicio: esProducto ? null : item,
        descripcion: esProducto ? (item.descripcion_completa || item.codigo) : item.nombre,
        cantidad: 1, precio_unitario: precio, subtotal: precio,
        stock_max: esProducto ? (item.stock_actual ?? 999) : 999,
      }]);
    }
  };

  const quitarItem = (id) => setCarrito(c => c.filter(i => i.id !== id));

  const actualizarCantidad = (id, val) => {
    const n = parseInt(val) || 1;
    setCarrito(c => c.map(i => {
      if (i.id !== id) return i;
      const cantidad = Math.max(1, Math.min(n, i.stock_max));
      return { ...i, cantidad, subtotal: cantidad * i.precio_unitario };
    }));
  };

  const actualizarPrecio = (id, val) => {
    const precio = parseFloat(val) || 0;
    setCarrito(c => c.map(i => i.id !== id ? i : { ...i, precio_unitario: precio, subtotal: i.cantidad * precio }));
  };

  const subtotal = carrito.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
  const descuentoN = parseFloat(descuento) || 0;
  const rawTotal = Math.max(0, subtotal - descuentoN);
  const total = redondearCentavos ? Math.round(rawTotal) : rawTotal;
  const totalPagado = (parseFloat(montoEfectivo) || 0) + (parseFloat(montoElectronico) || 0);
  const cambio = totalPagado - total;

  const limpiar = () => {
    setCarrito([]); setEmpleadoSel(''); setClienteSel(''); setVehiculoSel(''); setKilometrajeActual('');
    setMetodoPago('efectivo'); setTipoTarjeta('debito');
    setMontoEfectivo(''); setMontoElectronico(''); setNumOperacion(''); setNumReferencia('');
    setDescuento(''); setNotas(''); setBusqueda(''); setErrors({});
  };

  const validarPOS = () => {
    const e = {};
    if (!hayCajaAbierta) e.caja = 'No hay una caja abierta. Debe abrir turno de caja primero.';
    if (carrito.length === 0) e.carrito = 'Agrega al menos un producto o servicio';
    if (!empleadoSel) e.empleado = 'Selecciona el empleado que realiza la venta';
    if (total <= 0) e.total = 'El total debe ser mayor a $0';
    if (descuentoN > subtotal) e.descuento = 'El descuento no puede superar el subtotal';

    if (metodoPago === 'efectivo') {
      if (!montoEfectivo || parseFloat(montoEfectivo) <= 0)
        e.montoEfectivo = 'Ingresa el monto en efectivo';
      else if (parseFloat(montoEfectivo) < total)
        e.montoEfectivo = `El monto ($${fmt(montoEfectivo)}) es menor al total ($${fmt(total)})`;
    }
    if (metodoPago === 'tarjeta' || metodoPago === 'transferencia') {
      if (!montoElectronico || parseFloat(montoElectronico) <= 0)
        e.montoElectronico = 'Ingresa el monto del pago electrónico';
    }
    if (metodoPago === 'mixto') {
      if (!montoEfectivo || parseFloat(montoEfectivo) <= 0) e.montoEfectivo = 'Ingresa el monto en efectivo';
      if (!montoElectronico || parseFloat(montoElectronico) <= 0) e.montoElectronico = 'Ingresa el monto electrónico';
      if (parseFloat(montoEfectivo || 0) + parseFloat(montoElectronico || 0) < total)
        e.montoElectronico = `La suma ($${fmt(totalPagado)}) no cubre el total ($${fmt(total)})`;
    }
    if ((metodoPago === 'tarjeta' || metodoPago === 'mixto') && !numOperacion.trim())
      e.numOperacion = 'Ingresa el número de operación de la tarjeta';
    if ((metodoPago === 'transferencia' || metodoPago === 'mixto') && !numReferencia.trim())
      e.numReferencia = 'Ingresa el número de referencia de la transferencia';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const procesarVenta = async () => {
    if (!validarPOS()) return;
    setSaving(true);
    try {
      const body = {
        empleado: parseInt(empleadoSel),
        cliente: clienteSel ? parseInt(clienteSel) : null,
        vehiculo: vehiculoSel ? parseInt(vehiculoSel) : null,
        kilometraje_actual: kilometrajeActual ? parseInt(kilometrajeActual) : null,
        metodo_pago: metodoPago,
        tipo_tarjeta: ['tarjeta', 'mixto'].includes(metodoPago) ? tipoTarjeta : null,
        monto_efectivo: ['efectivo', 'mixto'].includes(metodoPago) ? parseFloat(montoEfectivo) : 0,
        monto_electronico: ['tarjeta', 'transferencia', 'mixto'].includes(metodoPago) ? parseFloat(montoElectronico) : 0,
        num_operacion: ['tarjeta', 'mixto'].includes(metodoPago) ? numOperacion.trim() : '',
        num_referencia: ['transferencia', 'mixto'].includes(metodoPago) ? numReferencia.trim() : '',
        subtotal, descuento: descuentoN, total, notas,
        detalles: carrito.map(i => ({
          producto: i.producto?.id || null,
          servicio: i.servicio?.id || null,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })),
      };
      const r = await fetch('/api/ventas/ventas/', {
        method: 'POST',
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const venta = await r.json();
        setVentaOk(venta);
        setTicketVenta(venta);
        queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
        queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
        queryClient.invalidateQueries({ queryKey: ['cajas'] });
        queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
        queryClient.invalidateQueries({ queryKey: ['balance-global'] });
        queryClient.invalidateQueries({ queryKey: ['reporte-balance-global'] });
        queryClient.invalidateQueries({ queryKey: ['clientes'] });
        queryClient.invalidateQueries({ queryKey: ['pos-clientes'] });
        queryClient.invalidateQueries({ queryKey: ['vehiculos-alertas-servicio'] });
        if (venta.productos_actualizados?.length) {
          queryClient.setQueryData(['pos-productos'], prev =>
            (prev || []).map(p => {
              const u = venta.productos_actualizados.find(x => x.id === p.id);
              return u ? { ...p, stock_actual: u.stock_actual } : p;
            })
          );
        }
        limpiar();
      } else {
        const err = await r.json();
        const msg = typeof err === 'object'
          ? Object.entries(err).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
          : String(err);
        setErrors({ _api: msg });
      }
    } catch {
      setErrors({ _api: 'Error de conexión. Verifica que el servidor esté funcionando.' });
    } finally {
      setSaving(false);
    }
  };

  const FieldError = ({ name }) =>
    errors[name] ? <p className="text-red-500 text-xs mt-1">{errors[name]}</p> : null;

  if (loadingData) return <Spinner />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

      {!hayCajaAbierta && !loadingCaja && (
        <div className="lg:col-span-3 bg-amber-500/15 border-2 border-amber-500 text-amber-950 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white flex-shrink-0">
              <i className="ri-error-warning-line text-2xl font-bold"></i>
            </div>
            <div>
              <p className="font-black text-sm text-amber-950">
                Turno de Caja Cerrado o Inactivo
              </p>
              <p className="text-xs text-amber-900 font-medium mt-0.5">
                No hay una caja abierta actualmente. Para registrar ventas en mostrador, debe abrir un turno de caja primero.
              </p>
            </div>
          </div>
          <a
            href="/caja"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-all whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            <i className="ri-lock-unlock-line text-sm"></i>
            <span>Ir a Apertura de Caja</span>
          </a>
        </div>
      )}

      {errors.caja && (
        <div className="lg:col-span-3 bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <i className="ri-error-warning-line text-red-500 font-bold"></i>
            <span>{errors.caja}</span>
          </span>
          <button onClick={() => setErrors(e => ({ ...e, caja: undefined }))}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      {ventaOk && (
        <div className="lg:col-span-3 bg-green-50 border border-green-300 text-green-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <i className="ri-checkbox-circle-line text-green-600 font-bold"></i>
            <span>Venta <strong>{ventaOk.folio}</strong> registrada — Total: <strong>${fmt(ventaOk.total)}</strong></span>
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setTicketVenta(ventaOk)}
              className="text-xs font-medium px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors flex items-center gap-1.5"
            >
              <i className="ri-printer-line"></i> Reimprimir
            </button>
            <button onClick={() => setVentaOk(null)}><XMarkIcon className="w-5 h-5 text-green-600" /></button>
          </div>
        </div>
      )}

      <ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />

      {errors._api && (
        <div className="lg:col-span-3 bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
          <span>{errors._api}</span>
          <button onClick={() => setErrors(e => ({ ...e, _api: undefined }))}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Catálogo ── */}
      <div className="md:col-span-1 lg:col-span-2 space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex gap-2">
            {[{ id: 'productos', label: 'Productos' }, { id: 'servicios', label: 'Servicios' }].map(t => (
              <button key={t.id} onClick={() => { setTabItems(t.id); setBusqueda(''); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors
                  ${tabItems === t.id ? 'bg-[#df000a] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder={tabItems === 'productos' ? 'Código, medida (ej. 2055516), marca, modelo…' : 'Buscar servicio…'}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
            />
          </div>
          {medidaDetectadaPOS && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-xs font-bold text-[#df000a]">
              <i className="ri-focus-3-line"></i>
              <span>Medida detectada: {medidaDetectadaPOS}</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {itemsFiltrados.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">Sin resultados</p>
            ) : itemsFiltrados.map(item => (
              <button key={item.id} onClick={() => agregarAlCarrito(item)}
                disabled={tabItems === 'productos' && (item.stock_actual ?? 0) <= 0}
                className="w-full px-4 py-3 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed flex justify-between items-center text-left transition-colors">
                {tabItems === 'productos' ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.codigo}</p>
                      <p className="text-xs text-gray-500">{item.descripcion_completa}</p>
                      <p className={`text-xs mt-0.5 ${
                        (item.stock_actual ?? 0) <= 0 ? 'text-red-500 font-medium'
                        : (item.stock_actual ?? 0) <= (item.stock_minimo ?? 0) ? 'text-orange-500'
                        : 'text-gray-400'
                      }`}>
                        Stock: {item.stock_actual ?? 0}
                        {(item.stock_actual ?? 0) <= 0 ? ' — Sin existencia' : ''}
                        {(item.stock_actual ?? 0) > 0 && (item.stock_actual ?? 0) <= (item.stock_minimo ?? 0) ? ' — Stock bajo' : ''}
                      </p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="font-bold text-[#df000a]">${fmt(item.precio_descuento || item.precio_venta)}</p>
                      {item.precio_descuento && <p className="text-xs text-gray-400 line-through">${fmt(item.precio_venta)}</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                      {item.descripcion && <p className="text-xs text-gray-500">{item.descripcion}</p>}
                    </div>
                    <p className="font-bold text-[#df000a] ml-3 flex-shrink-0">${fmt(item.precio)}</p>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Carrito + pago ── */}
      <div className="space-y-3">

        {/* Carrito */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <ShoppingCartIcon className="w-5 h-5 text-[#df000a]" />
            <h2 className="font-semibold text-gray-900 text-sm">Carrito ({carrito.length})</h2>
          </div>
          {errors.carrito && <p className="text-red-500 text-xs px-4 py-1 bg-red-50">{errors.carrito}</p>}
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {carrito.length === 0
              ? <p className="text-center text-gray-400 text-sm py-8">Vacío — toca un producto</p>
              : carrito.map(item => (
                <div key={item.id} className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-xs font-medium text-gray-800 flex-1 pr-2 leading-tight">{item.descripcion}</p>
                    <button onClick={() => quitarItem(item.id)} className="text-gray-300 hover:text-red-500">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-0.5">Cant.</label>
                      <input type="number" min="1" max={item.stock_max} value={item.cantidad}
                        onChange={e => actualizarCantidad(item.id, e.target.value)}
                        className="w-full border border-gray-200 rounded px-1.5 py-1 text-gray-900 focus:ring-1 focus:ring-[#df000a]" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Precio</label>
                      <input type="number" min="0" step="0.01" value={item.precio_unitario}
                        onChange={e => actualizarPrecio(item.id, e.target.value)}
                        className="w-full border border-gray-200 rounded px-1.5 py-1 text-gray-900 focus:ring-1 focus:ring-[#df000a]" />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-0.5">Subtotal</label>
                      <p className="font-bold text-[#df000a] px-1.5 py-1">${fmt(item.subtotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Empleado */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Empleado *</label>
          <select value={empleadoSel} onChange={e => setEmpleadoSel(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#df000a] focus:border-transparent
              ${errors.empleado ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
            <option value="">Seleccionar empleado</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.nombre_completo || `${e.nombre} ${e.apellido}`}</option>
            ))}
          </select>
          <FieldError name="empleado" />
        </div>

        {/* Cliente + Expediente Clínico de Vehículo */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cliente (opcional)</label>
            <select
              value={clienteSel}
              onChange={e => {
                const val = e.target.value;
                setClienteSel(val);
                const cli = clientes.find(c => String(c.id) === String(val));
                if (cli?.vehiculos?.length === 1) {
                  setVehiculoSel(String(cli.vehiculos[0].id));
                } else {
                  setVehiculoSel('');
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#df000a]"
            >
              <option value="">Venta sin cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.telefono}</option>)}
            </select>
          </div>

          {clienteActualObj?.vehiculos?.length > 0 && (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-[#df000a] uppercase mb-1 flex items-center gap-1">
                  <i className="ri-roadster-line"></i>
                  <span>Vehículo (Expediente Clínico)</span>
                </label>
                <select
                  value={vehiculoSel}
                  onChange={e => setVehiculoSel(e.target.value)}
                  className="w-full border border-red-200 bg-red-50/30 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-[#df000a]"
                >
                  <option value="">— Sin vincular a vehículo específico —</option>
                  {clienteActualObj.vehiculos.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.placas ? `[${v.placas}] ` : ''}{v.marca} {v.modelo} {v.año} ({v.medida_llanta_delantera || v.medida_llantas})
                    </option>
                  ))}
                </select>
              </div>
              {vehiculoSel && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <i className="ri-dashboard-3-line text-gray-400"></i>
                    <span>Kilometraje actual (opcional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={kilometrajeActual}
                    onChange={e => setKilometrajeActual(e.target.value)}
                    placeholder="Ej. 68500 km (actualiza alerta 6 meses)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-[#df000a]"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Método de pago */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Método de Pago</label>
          <select value={metodoPago}
            onChange={e => {
              setMetodoPago(e.target.value);
              setNumOperacion(''); setNumReferencia('');
              setErrors(er => ({ ...er, numOperacion: undefined, numReferencia: undefined, montoEfectivo: undefined, montoElectronico: undefined }));
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#df000a]">
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="mixto">Mixto (Efectivo + Electrónico)</option>
          </select>

          {['tarjeta', 'mixto'].includes(metodoPago) && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tipo de Tarjeta</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoTarjeta('debito')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    tipoTarjeta === 'debito'
                      ? 'bg-[#df000a] text-white border-[#df000a] shadow-sm'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-bank-card-line"></i>
                  <span>Débito</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoTarjeta('credito')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    tipoTarjeta === 'credito'
                      ? 'bg-[#df000a] text-white border-[#df000a] shadow-sm'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-bank-card-2-line"></i>
                  <span>Crédito</span>
                </button>
              </div>
            </div>
          )}

          {['efectivo', 'mixto'].includes(metodoPago) && (
            <div>
              <label className="text-xs text-gray-500">Monto Efectivo</label>
              <input type="number" step="0.01" value={montoEfectivo} onChange={e => setMontoEfectivo(e.target.value)}
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent
                  ${errors.montoEfectivo ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
              <FieldError name="montoEfectivo" />
              {!errors.montoEfectivo && metodoPago === 'efectivo' && parseFloat(montoEfectivo) >= total && total > 0 && (
                <p className="text-green-600 text-xs mt-1 font-medium">Cambio: ${fmt(Math.max(0, cambio))}</p>
              )}
            </div>
          )}

          {['tarjeta', 'transferencia', 'mixto'].includes(metodoPago) && (
            <div>
              <label className="text-xs text-gray-500">Monto Electrónico</label>
              <input type="number" step="0.01" value={montoElectronico} onChange={e => setMontoElectronico(e.target.value)}
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent
                  ${errors.montoElectronico ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
              <FieldError name="montoElectronico" />
            </div>
          )}

          {['tarjeta', 'mixto'].includes(metodoPago) && (
            <div>
              <label className="text-xs text-gray-500 font-medium">No. Operación Tarjeta *</label>
              <input type="text" value={numOperacion} onChange={e => setNumOperacion(e.target.value)}
                placeholder="Ej. 123456789"
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent
                  ${errors.numOperacion ? 'border-red-400 bg-red-50' : 'border-orange-200 bg-orange-50'}`} />
              <FieldError name="numOperacion" />
            </div>
          )}

          {['transferencia', 'mixto'].includes(metodoPago) && (
            <div>
              <label className="text-xs text-gray-500 font-medium">No. Referencia Transferencia *</label>
              <input type="text" value={numReferencia} onChange={e => setNumReferencia(e.target.value)}
                placeholder="Ej. REF-987654"
                className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent
                  ${errors.numReferencia ? 'border-red-400 bg-red-50' : 'border-purple-200 bg-purple-50'}`} />
              <FieldError name="numReferencia" />
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium text-gray-900">${fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-sm gap-2">
            <span className="text-gray-500">Descuento</span>
            <div className="text-right">
              <input type="number" min="0" step="0.01" value={descuento} onChange={e => setDescuento(e.target.value)}
                className={`w-24 border rounded px-2 py-1 text-right text-sm
                  ${errors.descuento ? 'border-red-400' : 'border-gray-300'}`} />
              <FieldError name="descuento" />
            </div>
          </div>
          {errors.total && <p className="text-red-500 text-xs">{errors.total}</p>}
          <div className="flex items-center justify-between py-1 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={redondearCentavos}
                onChange={e => setRedondearCentavos(e.target.checked)}
                className="w-4 h-4 rounded text-[#df000a] focus:ring-[#df000a] cursor-pointer"
              />
              <span className="font-medium">Redondear centavos al peso</span>
            </label>
          </div>
          <div className="border-t pt-2 flex justify-between items-center">
            <span className="font-bold text-gray-900 text-sm">TOTAL</span>
            <span className="text-xl font-black text-[#df000a]">${fmt(total)}</span>
          </div>
          <div>
            <label className="text-xs text-gray-500">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm resize-none" />
          </div>
          <button
            onClick={procesarVenta}
            disabled={saving || !hayCajaAbierta || carrito.length === 0}
            title={!hayCajaAbierta ? 'Requiere abrir caja primero' : ''}
            className={`w-full font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-md ${
              !hayCajaAbierta
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300'
                : 'bg-[#df000a] hover:bg-[#c4000a] text-white disabled:opacity-50 cursor-pointer shadow-red-900/20'
            }`}
          >
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving
              ? 'Procesando…'
              : !hayCajaAbierta
              ? 'Requiere Turno de Caja Abierto'
              : 'Confirmar Venta'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Componente raíz ─────────────────────────────────────────────────────────
export default function Ventas() {
  const [tab, setTab] = useState('pos');
  const [itemPrecargadoPOS, setItemPrecargadoPOS] = useState(null);

  const handleCargarAlPOS = (payload) => {
    setItemPrecargadoPOS(payload);
    setTab('pos');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-red-100 rounded-xl">
          <ShoppingCartIcon className="w-6 h-6 text-[#df000a]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ventas y Cotizaciones</h1>
          <p className="text-xs text-gray-500">Punto de venta, cotizador multimarca y catálogo de servicios</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 overflow-x-auto">
        {[
          { id: 'pos', label: 'Punto de Venta', icon: ShoppingCartIcon },
          { id: 'cotizador', label: 'Cotizador Multimarca', remixIcon: 'ri-price-tag-3-line' },
          { id: 'servicios', label: 'Servicios', icon: WrenchScrewdriverIcon },
        ].map(({ id, label, icon: Icon, remixIcon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 cursor-pointer
              ${tab === id ? 'bg-white shadow text-[#df000a] font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
            {remixIcon ? <i className={`${remixIcon} text-base`}></i> : <Icon className="w-4 h-4" />}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'pos' && (
        <TabPOS
          itemPrecargado={itemPrecargadoPOS}
          onClearItemPrecargado={() => setItemPrecargadoPOS(null)}
        />
      )}
      {tab === 'cotizador' && <TabCotizador onCargarAlPOS={handleCargarAlPOS} />}
      {tab === 'servicios' && <TabServicios />}
    </div>
  );
}
