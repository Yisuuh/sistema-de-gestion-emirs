import { useState, useEffect, useCallback } from 'react';
import {
  BuildingStorefrontIcon,
  BanknotesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const API = 'http://localhost:8000/api/inventario';
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}` });
const fmt = (n) =>
  Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// ─── Pill de estado de stock ────────────────────────────────────────────────
function StockPill({ estado }) {
  const map = {
    disponible: 'bg-green-100 text-green-800',
    bajo: 'bg-yellow-100 text-yellow-800',
    agotado: 'bg-red-100 text-red-800',
  };
  const label = { disponible: 'En stock', bajo: 'Stock bajo', agotado: 'Agotado' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[estado] ?? 'bg-gray-100 text-gray-600'}`}>
      {label[estado] ?? estado}
    </span>
  );
}

// ─── Barra de progreso lineal ────────────────────────────────────────────────
function BarraProgreso({ valor, total, color = 'bg-green-500' }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Modal pago ─────────────────────────────────────────────────────────────
function ModalPago({ proveedor, onClose, onGuardado }) {
  const [form, setForm] = useState({
    proveedor: proveedor.proveedor_id,
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    referencia: '',
    notas: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.monto || Number(form.monto) <= 0) {
      setErr('El monto debe ser mayor a cero.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/pagos-proveedores/`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail || JSON.stringify(data));
        return;
      }
      onGuardado();
    } catch {
      setErr('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold mb-1">Registrar Pago</h2>
        <p className="text-sm text-gray-500 mb-4">
          Proveedor: <span className="font-medium text-gray-800">{proveedor.proveedor_nombre}</span>
          &nbsp;·&nbsp;Saldo: <span className="font-semibold text-red-600">{fmt(proveedor.saldo_pendiente)}</span>
        </p>
        {err && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input
                type="number" min="0.01" step="0.01" required
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
              <input
                type="date" required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referencia <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.referencia}
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              placeholder="No. transferencia, cheque..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <BanknotesIcon className="h-4 w-4" />
              )}
              Guardar Pago
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detalle de un proveedor (facturas + pagos) ───────────────────────────────
function DetalleProveedor({ data, onPago }) {
  const [facturaAbierta, setFacturaAbierta] = useState(null);

  return (
    <div className="mt-4 space-y-4">
      {/* Facturas */}
      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <DocumentTextIcon className="h-4 w-4" />
        Facturas ({data.facturas.length})
      </h4>

      <div className="space-y-2">
        {data.facturas.map((factura) => {
          const abierta = facturaAbierta === factura.numero_factura;
          const pctVendido = factura.monto_total > 0
            ? (factura.monto_vendido / factura.monto_total) * 100
            : 0;
          return (
            <div key={factura.numero_factura} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Encabezado factura */}
              <button
                onClick={() => setFacturaAbierta(abierta ? null : factura.numero_factura)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
              >
                {abierta
                  ? <ChevronDownIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  : <ChevronRightIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                }
                <div className="flex-1 grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-mono font-semibold text-gray-800">{factura.numero_factura}</span>
                    <div className="text-xs text-gray-500">{factura.fecha_compra}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Total factura</span>
                    <div className="font-semibold text-gray-800">{fmt(factura.monto_total)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Vendido de factura</span>
                    <div className="font-semibold text-green-700">{fmt(factura.monto_vendido)}</div>
                    <BarraProgreso valor={factura.monto_vendido} total={factura.monto_total} />
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 text-xs">
                      {factura.items.length} línea(s)
                    </span>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {pctVendido.toFixed(0)}% vendido
                    </div>
                  </div>
                </div>
              </button>

              {/* Líneas de la factura */}
              {abierta && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-white border-b border-gray-100">
                        <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Código</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Producto</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Medida</th>
                        <th className="px-4 py-2 text-center text-xs text-gray-500 font-medium">Compradas</th>
                        <th className="px-4 py-2 text-center text-xs text-gray-500 font-medium">Vendidas*</th>
                        <th className="px-4 py-2 text-center text-xs text-gray-500 font-medium">Stock actual</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-500 font-medium">P. Compra</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-500 font-medium">Monto línea</th>
                        <th className="px-4 py-2 text-center text-xs text-gray-500 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {factura.items.map((item) => (
                        <tr key={item.entrada_id} className="hover:bg-blue-50">
                          <td className="px-4 py-2 font-mono text-xs text-gray-700">{item.producto_codigo}</td>
                          <td className="px-4 py-2 text-gray-700 max-w-[200px]">
                            <span className="line-clamp-1">{item.producto_descripcion}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                              {item.medida}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center font-semibold text-gray-800">
                            {item.cantidad_comprada}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`font-semibold ${item.vendido > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                              {item.vendido}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center font-bold">
                            <span className={
                              item.stock_actual <= 0 ? 'text-red-600' :
                              item.estado_stock === 'bajo' ? 'text-yellow-600' :
                              'text-green-600'
                            }>
                              {item.stock_actual}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">
                            ${item.precio_compra.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-800">
                            {fmt(item.monto_linea)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <StockPill estado={item.estado_stock} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="px-4 py-1.5 text-xs text-gray-400 bg-white border-t border-gray-100">
                    * Vendidas: estimado proporcional respecto al total comprado de ese producto.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagos registrados */}
      {data.pagos.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
            <BanknotesIcon className="h-4 w-4" />
            Pagos registrados
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-700">Fecha</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-green-700">Monto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-700">Referencia</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-green-700">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.pagos.map((p) => (
                  <tr key={p.id} className="hover:bg-green-50">
                    <td className="px-4 py-2 text-gray-700">{p.fecha}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">{fmt(p.monto)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{p.referencia || '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.notas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onPago}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Registrar Pago
        </button>
      </div>
    </div>
  );
}

// ─── Fila de proveedor expandible ─────────────────────────────────────────────
function FilaProveedor({ resumen, onPago }) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargarDetalle = async () => {
    if (detalle) { setAbierto(!abierto); return; }
    setCargando(true);
    try {
      const res = await fetch(`${API}/adeudos/${resumen.proveedor_id}/`, { headers: headers() });
      const data = await res.json();
      setDetalle(data);
      setAbierto(true);
    } catch {
      // silencio
    } finally {
      setCargando(false);
    }
  };

  const recargarDetalle = async () => {
    const res = await fetch(`${API}/adeudos/${resumen.proveedor_id}/`, { headers: headers() });
    const data = await res.json();
    setDetalle(data);
  };

  const pctPagado = resumen.monto_total_deuda > 0
    ? (resumen.monto_pagado / resumen.monto_total_deuda) * 100
    : 0;

  const saldoColor = resumen.saldo_pendiente <= 0
    ? 'text-green-600'
    : resumen.saldo_pendiente > resumen.monto_total_deuda * 0.5
    ? 'text-red-600'
    : 'text-yellow-600';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Fila resumen */}
      <button
        onClick={cargarDetalle}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 text-left"
      >
        {cargando ? (
          <ArrowPathIcon className="h-5 w-5 text-gray-400 animate-spin flex-shrink-0" />
        ) : abierto ? (
          <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
        )}

        {/* Proveedor */}
        <div className="w-52 min-w-[180px]">
          <div className="font-semibold text-gray-900 flex items-center gap-2">
            <BuildingStorefrontIcon className="h-4 w-4 text-gray-400" />
            {resumen.proveedor_nombre}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{resumen.total_facturas} factura(s)</div>
        </div>

        {/* Deuda */}
        <div className="flex-1 grid grid-cols-3 gap-6 text-sm">
          <div>
            <div className="text-xs text-gray-400">Deuda total</div>
            <div className="font-semibold text-gray-800">{fmt(resumen.monto_total_deuda)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Pagado</div>
            <div className="font-semibold text-green-700">{fmt(resumen.monto_pagado)}</div>
            <BarraProgreso valor={resumen.monto_pagado} total={resumen.monto_total_deuda} color="bg-green-500" />
            <div className="text-xs text-gray-400 mt-0.5">{pctPagado.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Saldo pendiente</div>
            <div className={`font-bold text-lg ${saldoColor}`}>{fmt(resumen.saldo_pendiente)}</div>
          </div>
        </div>

        {/* Indicador */}
        <div className="flex-shrink-0">
          {resumen.saldo_pendiente <= 0 ? (
            <CheckCircleIcon className="h-6 w-6 text-green-500" />
          ) : (
            <ExclamationTriangleIcon className={`h-6 w-6 ${saldoColor}`} />
          )}
        </div>
      </button>

      {/* Detalle expandido */}
      {abierto && detalle && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <DetalleProveedor
            data={detalle}
            onPago={() => onPago(detalle, async () => { await recargarDetalle(); })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Adeudos() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [modalPago, setModalPago] = useState(null); // { proveedorData, onDone }

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/adeudos/`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResumen(await res.json());
    } catch (e) {
      setError('Error al cargar los adeudos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirModalPago = (proveedorData, onDone) => {
    setModalPago({ proveedorData, onDone });
  };

  const cerrarModalPago = () => setModalPago(null);

  const pagoGuardado = async () => {
    cerrarModalPago();
    setExito('Pago registrado exitosamente.');
    setTimeout(() => setExito(null), 5000);
    await cargar(); // refrescar totales globales
    if (modalPago?.onDone) await modalPago.onDone();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adeudos a Proveedores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Acumulado por factura. Haz clic en un proveedor para ver el detalle.
          </p>
        </div>
        <button
          onClick={cargar}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          title="Recargar"
        >
          <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <XCircleIcon className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {exito && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          {exito}
        </div>
      )}

      {/* Tarjetas globales */}
      {resumen && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <DocumentTextIcon className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Deuda total con proveedores</p>
                <p className="text-2xl font-bold text-gray-900">{fmt(resumen.total_deuda_global)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <BanknotesIcon className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Total pagado</p>
                <p className="text-2xl font-bold text-green-700">{fmt(resumen.total_pagado_global)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ExclamationTriangleIcon className={`h-8 w-8 ${resumen.saldo_global > 0 ? 'text-red-500' : 'text-green-500'}`} />
              <div>
                <p className="text-sm text-gray-500">Saldo pendiente</p>
                <p className={`text-2xl font-bold ${resumen.saldo_global > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(resumen.saldo_global)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de proveedores */}
      {loading && !resumen && (
        <div className="text-center py-16 text-gray-500">
          <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-3" />
          Cargando adeudos...
        </div>
      )}

      {resumen && resumen.proveedores.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <BuildingStorefrontIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Sin adeudos registrados</p>
          <p className="text-sm mt-1">Importa facturas XML o registra entradas de inventario para ver los adeudos.</p>
        </div>
      )}

      <div className="space-y-3">
        {resumen?.proveedores.map((prov) => (
          <FilaProveedor
            key={prov.proveedor_id}
            resumen={prov}
            onPago={abrirModalPago}
          />
        ))}
      </div>

      {/* Modal de pago */}
      {modalPago && (
        <ModalPago
          proveedor={modalPago.proveedorData}
          onClose={cerrarModalPago}
          onGuardado={pagoGuardado}
        />
      )}
    </div>
  );
}
