import { useState, useEffect, useCallback, useMemo } from 'react';
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
import ModalEditarPagoProveedor from './ModalEditarPagoProveedor';

const API = '/api/inventario';
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}` });
const fmt = (n) =>
  Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// ─── Helpers de Facturas y Estados ──────────────────────────────────────────
export function matchesFactura(pagoNum, facNum, facKey) {
  if (!pagoNum || (!facNum && !facKey)) return false;
  const p = String(pagoNum).trim().toLowerCase();
  const f = String(facNum || '').trim().toLowerCase();
  const k = String(facKey || '').trim().toLowerCase();
  if (p === f || (k && p === k)) return true;
  const clean = (s) => s.replace(/^(fac-|rem-|ent-|remisión:\s*|entrada\s*#?)/i, '').trim();
  const pClean = clean(p);
  const fClean = clean(f);
  const kClean = clean(k);
  if (pClean && (pClean === fClean || (kClean && pClean === kClean))) return true;
  return false;
}

export function getFacturaEstado(factura, saldoPendiente, totalAbonado, alertasVencimiento = [], proveedorId = null) {
  if (saldoPendiente <= 0.009) {
    return {
      label: 'Liquidada / Pagada',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold',
      dotClass: 'bg-emerald-400',
      tipo: 'pagada',
    };
  }

  const alerta = (alertasVencimiento || []).find(a =>
    (proveedorId ? a.proveedor_id === proveedorId : true) &&
    (matchesFactura(a.numero_factura, factura.numero_factura, factura.key) ||
     matchesFactura(a.folio_remision, factura.numero_factura, factura.key))
  );

  const esVencida = alerta?.estado_alerta === 'vencida' ||
    (alerta?.dias_restantes !== undefined && alerta.dias_restantes < 0) ||
    (factura.fecha_vencimiento && new Date(factura.fecha_vencimiento) < new Date());

  if (esVencida) {
    return {
      label: 'Vencida',
      badgeClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse font-black',
      dotClass: 'bg-rose-500 animate-pulse',
      tipo: 'vencida',
    };
  }

  if (totalAbonado > 0) {
    return {
      label: 'Abono Parcial',
      badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold',
      dotClass: 'bg-blue-400',
      tipo: 'parcial',
    };
  }

  return {
    label: 'En Plazo / Vigente',
    badgeClass: 'bg-slate-800 text-slate-300 border border-slate-700/80 font-semibold',
    dotClass: 'bg-slate-400',
    tipo: 'vigente',
  };
}

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

// ─── Badge de método de pago ────────────────────────────────────────────────
function MetodoPagoBadge({ metodo }) {
  const m = String(metodo || '').toLowerCase();
  if (m === 'tarjeta_debito') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <i className="ri-bank-card-line text-xs"></i>
        Tarjeta Débito
      </span>
    );
  }
  if (m === 'tarjeta_credito') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        <i className="ri-bank-card-2-line text-xs"></i>
        Tarjeta Crédito
      </span>
    );
  }
  if (m === 'transferencia') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <i className="ri-arrow-left-right-line text-xs"></i>
        Transferencia
      </span>
    );
  }
  if (m === 'efectivo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <i className="ri-money-dollar-circle-line text-xs"></i>
        Efectivo
      </span>
    );
  }
  if (m === 'cheque') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <i className="ri-bill-line text-xs"></i>
        Cheque
      </span>
    );
  }
  if (m === 'tarjeta') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <i className="ri-bank-card-line text-xs"></i>
        Tarjeta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 capitalize">
      {metodo || '—'}
    </span>
  );
}

// ─── Modal pago ─────────────────────────────────────────────────────────────
function ModalPago({ proveedor, facturaPreseleccionada = '', alertasVencimiento = [], onClose, onGuardado }) {
  const [facturas, setFacturas] = useState(() => proveedor?.facturas || []);
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const [form, setForm] = useState({
    proveedor: proveedor.proveedor_id,
    numero_factura: facturaPreseleccionada || '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    metodo_pago: 'transferencia',
    referencia: '',
    notas: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Cargar facturas del proveedor si no vienen incluidas
  useEffect(() => {
    let active = true;
    if (proveedor?.facturas && proveedor.facturas.length > 0) {
      setFacturas(proveedor.facturas);
    } else if (proveedor?.proveedor_id) {
      setCargandoFacturas(true);
      fetch(`${API}/adeudos/${proveedor.proveedor_id}/`, { headers: headers() })
        .then(res => res.json())
        .then(data => {
          if (active && data?.facturas) {
            setFacturas(data.facturas);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setCargandoFacturas(false);
        });
    }
    return () => { active = false; };
  }, [proveedor]);

  // Lista calculada de facturas con saldo y estado
  const facturasCalculadas = useMemo(() => {
    const list = [];
    const knownKeys = new Set();

    (facturas || []).forEach(fac => {
      const numFac = fac.numero_factura;
      knownKeys.add(numFac);

      const pagosFac = (proveedor?.pagos || []).filter(p => matchesFactura(p.numero_factura, fac.numero_factura, fac.key));
      const abonado = pagosFac.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
      let saldo = Math.max(0, (parseFloat(fac.monto_total) || 0) - abonado);

      const alerta = (alertasVencimiento || []).find(a =>
        a.proveedor_id === proveedor.proveedor_id &&
        (matchesFactura(a.numero_factura, fac.numero_factura, fac.key) ||
         matchesFactura(a.folio_remision, fac.numero_factura, fac.key))
      );

      if (alerta && alerta.saldo_pendiente !== undefined) {
        saldo = parseFloat(alerta.saldo_pendiente);
      }

      const infoEstado = getFacturaEstado(fac, saldo, abonado, alertasVencimiento, proveedor.proveedor_id);

      list.push({
        key: fac.key || numFac,
        numero_factura: numFac,
        saldo_pendiente: saldo,
        monto_total: fac.monto_total,
        estado: infoEstado.label,
      });
    });

    // Agregar de alertasVencimiento si faltaba alguna
    (alertasVencimiento || []).forEach(a => {
      if (a.proveedor_id === proveedor.proveedor_id && a.numero_factura && !knownKeys.has(a.numero_factura)) {
        knownKeys.add(a.numero_factura);
        const s = parseFloat(a.saldo_pendiente ?? a.monto_total ?? 0);
        const est = a.estado_alerta === 'vencida' || (a.dias_restantes !== undefined && a.dias_restantes < 0) ? 'Vencida' : 'En Plazo / Vigente';
        list.push({
          key: a.numero_factura,
          numero_factura: a.numero_factura,
          saldo_pendiente: s,
          monto_total: parseFloat(a.monto_total ?? 0),
          estado: est,
        });
      }
    });

    return list;
  }, [facturas, proveedor, alertasVencimiento]);

  // Autoseleccionar factura y saldo si viene facturaPreseleccionada o sugerir saldo general
  useEffect(() => {
    if (facturaPreseleccionada) {
      const facObj = facturasCalculadas.find(f =>
        matchesFactura(facturaPreseleccionada, f.numero_factura, f.key)
      );
      const m = facObj ? String(facObj.saldo_pendiente) : (proveedor.saldo_pendiente ? String(proveedor.saldo_pendiente) : '');
      setForm(prev => ({
        ...prev,
        numero_factura: facObj?.numero_factura || facturaPreseleccionada,
        monto: m || prev.monto,
      }));
    } else {
      setForm(prev => {
        if (!prev.monto && proveedor.saldo_pendiente) {
          return { ...prev, monto: String(proveedor.saldo_pendiente) };
        }
        return prev;
      });
    }
  }, [facturaPreseleccionada, facturasCalculadas, proveedor.saldo_pendiente]);

  const handleFacturaChange = (e) => {
    const val = e.target.value;
    setForm(prev => {
      if (!val) {
        return {
          ...prev,
          numero_factura: '',
          monto: proveedor.saldo_pendiente ? String(proveedor.saldo_pendiente) : '',
        };
      }
      const facObj = facturasCalculadas.find(f => f.numero_factura === val || f.key === val);
      return {
        ...prev,
        numero_factura: val,
        monto: facObj ? String(facObj.saldo_pendiente) : prev.monto,
      };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.monto || Number(form.monto) <= 0) {
      setErr('El monto debe ser mayor a cero.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = {
        proveedor: form.proveedor,
        monto: parseFloat(form.monto),
        fecha: form.fecha,
        metodo_pago: form.metodo_pago,
        numero_factura: form.numero_factura ? form.numero_factura.trim() : '',
        referencia: form.referencia ? form.referencia.trim() : '',
        notas: form.notas ? form.notas.trim() : '',
      };
      const res = await fetch(`${API}/pagos-proveedores/`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#141720] rounded-2xl shadow-2xl w-full max-w-md my-4 p-6 border border-white/[0.08]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 text-[#df000a] flex items-center justify-center border border-red-500/20">
              <i className="ri-bank-card-line text-xl"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Registrar Pago</h2>
              <p className="text-xs text-slate-400">Proveedor: <span className="text-slate-200 font-semibold">{proveedor.proveedor_nombre}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-3 mb-4 rounded-xl bg-[#1b2032] border border-white/[0.06] flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Saldo pendiente actual:</span>
          <span className="font-bold font-mono text-rose-400 text-sm">{fmt(proveedor.saldo_pendiente)}</span>
        </div>

        {err && (
          <div className="mb-3 text-xs text-rose-300 bg-rose-950/60 border border-rose-900/60 rounded-lg px-3 py-2 flex items-center gap-2">
            <i className="ri-error-warning-line text-sm flex-shrink-0 text-rose-400"></i>
            <span>{err}</span>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          {/* Selector de Factura / Remisión */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Aplicar a Factura / Remisión</span>
              {cargandoFacturas && <span className="text-[10px] text-slate-400 font-normal">Cargando facturas...</span>}
            </label>
            <select
              value={form.numero_factura}
              onChange={handleFacturaChange}
              className="w-full px-3 py-2 border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm font-medium bg-[#1b2032]"
            >
              <option value="">Abono General (Sin Factura Específica)</option>
              {facturasCalculadas.map((fac) => (
                <option key={fac.key || fac.numero_factura} value={fac.numero_factura}>
                  {fac.numero_factura} — Saldo: {fmt(fac.saldo_pendiente)} [{fac.estado.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Monto *</label>
              <input
                type="number" min="0.01" step="0.01" required
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm font-semibold font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Fecha *</label>
              <input
                type="date" required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-bank-card-line text-[#df000a]"></i>
              Método de Pago *
            </label>
            <select
              value={form.metodo_pago}
              onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
              className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm font-medium"
            >
              <option value="transferencia">Transferencia Electrónica</option>
              <option value="tarjeta_debito">Tarjeta de Débito</option>
              <option value="tarjeta_credito">Tarjeta de Crédito</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Referencia <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.referencia}
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              placeholder="No. transferencia, rastreo, cheque..."
              className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Notas <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas aclaratorias sobre el pago..."
              className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.1] rounded-lg focus:ring-2 focus:ring-[#df000a] text-white text-sm resize-none placeholder-slate-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2 border border-white/[0.1] rounded-lg text-slate-300 hover:bg-white/[0.04] text-sm font-bold cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-bold cursor-pointer shadow-sm transition-all active:scale-98"
            >
              {loading ? (
                <i className="ri-loader-4-line animate-spin text-base"></i>
              ) : (
                <i className="ri-check-line text-base"></i>
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
function DetalleProveedor({ data, alertasVencimiento = [], onPago, onRecargar }) {
  const [facturaAbierta, setFacturaAbierta] = useState(null);
  const [pagoAEditar, setPagoAEditar] = useState(null);

  return (
    <div className="mt-4 space-y-4">
      {/* Facturas */}
      <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
        <DocumentTextIcon className="h-4 w-4 text-slate-400" />
        Facturas ({data.facturas.length})
      </h4>

      <div className="space-y-3">
        {data.facturas.map((factura) => {
          const abierta = facturaAbierta === factura.numero_factura;
          const pctVendido = factura.monto_total > 0
            ? (factura.monto_vendido / factura.monto_total) * 100
            : 0;

          const pagosFactura = (data.pagos || []).filter(p => matchesFactura(p.numero_factura, factura.numero_factura, factura.key));
          const totalAbonado = pagosFactura.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
          const saldoPendiente = Math.max(0, (parseFloat(factura.monto_total) || 0) - totalAbonado);
          const infoEstado = getFacturaEstado(factura, saldoPendiente, totalAbonado, alertasVencimiento, data.proveedor_id);

          return (
            <div key={factura.numero_factura} className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#161a29] shadow-sm">
              {/* Encabezado factura */}
              <div
                onClick={() => setFacturaAbierta(abierta ? null : factura.numero_factura)}
                className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3.5 bg-[#1b2032] hover:bg-[#20263c] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  {abierta
                    ? <ChevronDownIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    : <ChevronRightIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  }
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-white text-sm">{factura.numero_factura}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${infoEstado.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${infoEstado.dotClass}`}></span>
                        {infoEstado.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Fecha compra: <strong className="font-mono text-slate-300">{factura.fecha_compra}</strong> • {factura.items.length} línea(s) • {pctVendido.toFixed(0)}% vendido
                    </div>
                  </div>
                </div>

                {/* 4 Métricas Clave en el Encabezado: Total Factura, Pagado, Saldo Pendiente, Estado */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 justify-between md:justify-end text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Factura</span>
                    <span className="font-bold text-slate-200 text-sm font-mono">{fmt(factura.monto_total)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Pagado</span>
                    <span className="font-bold text-emerald-400 text-sm font-mono">{fmt(totalAbonado)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Saldo Pendiente</span>
                    <span className={`font-black text-sm font-mono ${saldoPendiente > 0 ? (infoEstado.tipo === 'vencida' ? 'text-rose-400' : 'text-amber-400') : 'text-emerald-400'}`}>
                      {fmt(saldoPendiente)}
                    </span>
                  </div>

                  {/* Botón Abonar a Factura */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPago(factura);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-auto md:ml-2"
                    title="Abonar a esta factura"
                  >
                    <i className="ri-hand-coin-line text-sm"></i>
                    <span>Abonar a Factura</span>
                  </button>
                </div>
              </div>

              {/* Líneas de la factura y Pagos realizados */}
              {abierta && (
                <div className="border-t border-white/[0.08]">
                  {/* Tabla de Productos */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-[#121522] border-b border-white/[0.06]">
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Código</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Producto</th>
                          <th className="px-3 py-2 text-left text-slate-400 font-semibold">Medida</th>
                          <th className="px-3 py-2 text-center text-slate-400 font-semibold">Compradas</th>
                          <th className="px-3 py-2 text-center text-slate-400 font-semibold">Vendidas*</th>
                          <th className="px-3 py-2 text-center text-slate-400 font-semibold">Stock actual</th>
                          <th className="px-3 py-2 text-right text-slate-400 font-semibold">P. Compra</th>
                          <th className="px-3 py-2 text-right text-slate-400 font-semibold">Monto línea</th>
                          <th className="px-3 py-2 text-center text-slate-400 font-semibold">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04] bg-[#161a29]">
                        {factura.items.map((item) => (
                          <tr key={item.entrada_id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-3 py-2 font-mono text-slate-300">{item.producto_codigo}</td>
                            <td className="px-3 py-2 text-slate-300 max-w-[200px]">
                              <span className="line-clamp-1">{item.producto_descripcion}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded text-[11px] font-mono">
                                {item.medida}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center font-semibold text-slate-200">
                              {item.cantidad_comprada}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`font-semibold ${item.vendido > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {item.vendido}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center font-bold">
                              <span className={
                                item.stock_actual <= 0 ? 'text-rose-400' :
                                item.estado_stock === 'bajo' ? 'text-amber-400' :
                                'text-emerald-400'
                              }>
                                {item.stock_actual}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-300">
                              ${item.precio_compra.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-200 font-mono">
                              {fmt(item.monto_linea)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <StockPill estado={item.estado_stock} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Sección / Tabla de Pagos Realizados a esta Factura */}
                  <div className="p-3 bg-[#121522] border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="ri-hand-coin-line text-emerald-400"></i>
                        <span>Pagos Realizados a esta Factura ({pagosFactura.length})</span>
                      </h5>
                      <span className="text-xs text-slate-400 font-mono">
                        Total abonado: <strong className="text-emerald-400 font-bold">{fmt(totalAbonado)}</strong>
                      </span>
                    </div>

                    {pagosFactura.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#161a29] shadow-sm">
                        <table className="min-w-full text-xs">
                          <thead className="bg-[#1b2032] border-b border-white/[0.08] text-slate-300">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-bold">Fecha</th>
                              <th className="px-3 py-1.5 text-right font-bold">Monto</th>
                              <th className="px-3 py-1.5 text-left font-bold">Método</th>
                              <th className="px-3 py-1.5 text-left font-bold">Referencia</th>
                              <th className="px-3 py-1.5 text-left font-bold">Comprobante</th>
                              <th className="px-3 py-1.5 text-left font-bold">Notas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04] font-mono bg-[#161a29]">
                            {pagosFactura.map((p) => (
                              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{p.fecha}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-emerald-400">{fmt(p.monto)}</td>
                                <td className="px-3 py-1.5 font-sans">
                                  <MetodoPagoBadge metodo={p.metodo_pago} />
                                </td>
                                <td className="px-3 py-1.5 text-slate-400">{p.referencia || p.numero_referencia || '—'}</td>
                                <td className="px-3 py-1.5 font-sans">
                                  {p.comprobante ? (
                                    <a
                                      href={p.comprobante}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 font-semibold underline inline-flex items-center gap-1"
                                    >
                                      <i className="ri-file-text-line"></i>
                                      Ver archivo
                                    </a>
                                  ) : (
                                    <span className="text-slate-500">Sin archivo</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 text-slate-400 font-sans max-w-xs truncate">{p.notas || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400 bg-[#161a29] rounded-lg border border-white/[0.06] flex items-center justify-center gap-1.5">
                        <i className="ri-information-line text-slate-500 text-sm"></i>
                        <span>Sin abonos registrados aún para esta factura</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagos registrados */}
      {data.pagos.length > 0 && (() => {
        const subtotales = data.pagos.reduce(
          (acc, p) => {
            const m = String(p.metodo_pago || '').toLowerCase();
            const val = parseFloat(p.monto || 0);
            if (m === 'efectivo') acc.efectivo += val;
            else if (m === 'transferencia') acc.transferencia += val;
            else if (m === 'tarjeta_debito') acc.tarjeta_debito += val;
            else if (m === 'tarjeta_credito') acc.tarjeta_credito += val;
            else if (m === 'cheque') acc.cheque += val;
            else if (m === 'tarjeta') acc.tarjeta_debito += val;
            else acc.otros += val;
            acc.total += val;
            return acc;
          },
          { efectivo: 0, transferencia: 0, tarjeta_debito: 0, tarjeta_credito: 0, cheque: 0, otros: 0, total: 0 }
        );

        return (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <i className="ri-hand-coin-line text-emerald-400"></i>
                Pagos Registrados ({data.pagos.length})
              </h4>
              <span className="text-xs text-slate-400">
                Total abonado: <span className="font-bold font-mono text-emerald-400">{fmt(subtotales.total)}</span>
              </span>
            </div>

            {/* Barra / Resumen de subtotales por método */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-[#161a29] rounded-xl border border-white/[0.08]">
              <div className="p-2 rounded-lg bg-[#1b2032] border border-white/[0.05] shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                  <i className="ri-money-dollar-circle-line text-emerald-400"></i>
                  Efectivo
                </div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {fmt(subtotales.efectivo)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#1b2032] border border-white/[0.05] shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                  <i className="ri-arrow-left-right-line text-emerald-400"></i>
                  Transferencia
                </div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {fmt(subtotales.transferencia)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#1b2032] border border-white/[0.05] shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                  <i className="ri-bank-card-line text-blue-400"></i>
                  Tarj. Débito
                </div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {fmt(subtotales.tarjeta_debito)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#1b2032] border border-white/[0.05] shadow-xs">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                  <i className="ri-bank-card-2-line text-purple-400"></i>
                  Tarj. Crédito
                </div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {fmt(subtotales.tarjeta_credito)}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-[#1b2032] border border-white/[0.05] shadow-xs col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
                  <i className="ri-bill-line text-amber-400"></i>
                  Cheque
                </div>
                <div className="text-sm font-black font-mono text-white mt-0.5">
                  {fmt(subtotales.cheque)}
                </div>
              </div>
            </div>

            {/* Tabla de pagos */}
            <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#161a29]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1b2032] border-b border-white/[0.08]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-300">Fecha</th>
                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-300">Monto</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-300">Factura</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-300">Método de Pago</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-300">Referencia</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-300">Notas</th>
                    <th className="px-3 py-2 text-center text-xs font-bold text-slate-300">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] bg-[#161a29]">
                  {data.pagos.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap text-xs font-mono">{p.fecha}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400 font-mono text-sm">{fmt(p.monto)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300 font-semibold">{p.numero_factura || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <MetodoPagoBadge metodo={p.metodo_pago} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">{p.referencia || p.numero_referencia || '—'}</td>
                      <td className="px-3 py-2 text-slate-400 text-xs max-w-xs truncate">{p.notas || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setPagoAEditar({ ...p, proveedor_nombre: data.proveedor_nombre })}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Editar datos de pago"
                        >
                          <i className="ri-edit-line text-sm font-bold"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <div className="flex justify-end pt-1">
        <button
          onClick={() => onPago()}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 text-xs font-bold cursor-pointer shadow-sm transition-all active:scale-98"
        >
          <i className="ri-add-line text-base"></i>
          Registrar Pago
        </button>
      </div>

      {pagoAEditar && (
        <ModalEditarPagoProveedor
          isOpen={!!pagoAEditar}
          pago={pagoAEditar}
          onClose={() => setPagoAEditar(null)}
          onGuardado={async () => {
            setPagoAEditar(null);
            await onRecargar?.();
          }}
        />
      )}
    </div>
  );
}

// ─── Fila de proveedor expandible ─────────────────────────────────────────────
function FilaProveedor({ resumen, alertasVencimiento = [], onPago }) {
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

  // Cálculo de cuenta vencida y corriente de este proveedor
  const vencidoProveedor = useMemo(() => {
    if (!alertasVencimiento) return 0;
    return alertasVencimiento
      .filter(f => f.proveedor_id === resumen.proveedor_id && (f.dias_restantes !== undefined ? f.dias_restantes < 0 : f.estado_alerta === 'vencida'))
      .reduce((sum, f) => sum + (parseFloat(f.saldo_pendiente ?? f.monto_total) || 0), 0);
  }, [alertasVencimiento, resumen.proveedor_id]);

  const corrienteProveedor = useMemo(() => {
    const saldo = parseFloat(resumen.saldo_pendiente || 0);
    return Math.max(0, saldo - vencidoProveedor);
  }, [resumen.saldo_pendiente, vencidoProveedor]);

  return (
    <div className="bg-[#141720] border border-white/[0.08] rounded-xl overflow-hidden shadow-sm">
      {/* Fila resumen */}
      <button
        onClick={cargarDetalle}
        className="w-full flex flex-wrap items-center gap-3 px-4 sm:px-6 py-4 hover:bg-white/[0.02] text-left cursor-pointer transition-colors"
      >
        {cargando ? (
          <ArrowPathIcon className="h-5 w-5 text-slate-400 animate-spin flex-shrink-0" />
        ) : abierto ? (
          <ChevronDownIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
        )}

        {/* Proveedor */}
        <div className="flex-1 min-w-0 sm:w-48 sm:flex-none sm:min-w-[160px]">
          <div className="font-bold text-white flex items-center gap-2">
            <BuildingStorefrontIcon className="h-4 w-4 text-slate-400" />
            <span className="truncate">{resumen.proveedor_nombre}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{resumen.total_facturas} factura(s)</div>
        </div>

        {/* Métricas: Deuda total & pagado + Los 3 valores identificados con colores */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Deuda Total</div>
            <div className="font-bold text-slate-200 font-mono">{fmt(resumen.monto_total_deuda)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              Pagado: <strong className="text-emerald-400">{fmt(resumen.monto_pagado)}</strong> ({pctPagado.toFixed(0)}%)
            </div>
            <BarraProgreso valor={resumen.monto_pagado} total={resumen.monto_total_deuda} color="bg-emerald-500" />
          </div>

          <div>
            <div className="text-[11px] text-slate-400 uppercase font-bold">Saldo Total</div>
            <div className="font-extrabold text-base text-white font-mono mt-0.5">{fmt(resumen.saldo_pendiente)}</div>
            <span className="text-[10px] text-slate-500">Total adeudado</span>
          </div>

          <div>
            <div className="text-[11px] text-emerald-400 uppercase font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Corriente (En Plazo)
            </div>
            <div className="font-bold text-base text-emerald-400 font-mono mt-0.5">{fmt(corrienteProveedor)}</div>
            <span className="text-[10px] text-emerald-400/80">Dentro de crédito</span>
          </div>

          <div>
            <div className="text-[11px] text-rose-400 uppercase font-bold flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${vencidoProveedor > 0 ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'}`}></span>
              Vencida (Mora)
            </div>
            <div className={`font-bold text-base font-mono mt-0.5 ${vencidoProveedor > 0 ? 'text-rose-400 font-black' : 'text-slate-500'}`}>
              {fmt(vencidoProveedor)}
            </div>
            <span className={`text-[10px] ${vencidoProveedor > 0 ? 'text-rose-400 font-semibold' : 'text-slate-500'}`}>
              {vencidoProveedor > 0 ? 'Requiere atención' : 'Sin mora activa'}
            </span>
          </div>
        </div>

        {/* Indicador */}
        <div className="flex-shrink-0">
          {resumen.saldo_pendiente <= 0 ? (
            <CheckCircleIcon className="h-6 w-6 text-emerald-500" />
          ) : vencidoProveedor > 0 ? (
            <ExclamationTriangleIcon className="h-6 w-6 text-rose-500 animate-pulse" />
          ) : (
            <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
          )}
        </div>
      </button>

      {/* Detalle expandido */}
      {abierto && detalle && (
        <div className="px-4 sm:px-6 pb-6 border-t border-white/[0.08]">
          <DetalleProveedor
            data={detalle}
            alertasVencimiento={alertasVencimiento}
            onPago={(fac) => onPago(detalle, async () => { await recargarDetalle(); }, fac?.numero_factura || fac?.folio_remision || (typeof fac === 'string' ? fac : null))}
            onRecargar={recargarDetalle}
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
  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const [descargandoExcel, setDescargandoExcel] = useState(false);
  const [alertasVencimiento, setAlertasVencimiento] = useState(null);
  const [mostrarAlertas, setMostrarAlertas] = useState(true);

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

  const cargarAlertas = useCallback(async () => {
    try {
      const res = await fetch(`${API}/adeudos/facturas-vencimiento/?dias=7`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setAlertasVencimiento(data);
      }
    } catch {
      // Silencioso si aún no está poblado
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarAlertas();
  }, [cargar, cargarAlertas]);

  const abrirModalPago = (proveedorData, onDone, facturaPreseleccionada = null) => {
    setModalPago({ proveedorData, onDone, facturaPreseleccionada });
  };

  const cerrarModalPago = () => setModalPago(null);

  const pagoGuardado = async () => {
    cerrarModalPago();
    setExito('Pago registrado exitosamente.');
    setTimeout(() => setExito(null), 5000);
    await cargar(); // refrescar totales globales
    await cargarAlertas();
    if (modalPago?.onDone) await modalPago.onDone();
  };

  const exportarReporte = async (tipo) => {
    const isPdf = tipo === 'pdf';
    const url = isPdf ? '/api/reportes/pagos-proveedores/pdf/' : '/api/reportes/pagos-proveedores/excel/';
    const ext = isPdf ? 'pdf' : 'xlsx';
    const setCargando = isPdf ? setDescargandoPDF : setDescargandoExcel;

    setCargando(true);
    try {
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) {
        throw new Error(`Error ${res.status}: no se pudo generar el reporte.`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Reporte_Pagos_Proveedores_${new Date().toISOString().split('T')[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      setError(`Error al descargar reporte ${ext.toUpperCase()}: ${e.message}`);
    } finally {
      setCargando(false);
    }
  };

  // Normalizar facturas de alertas
  const listaFacturasVencidas = useMemo(() => {
    if (!alertasVencimiento) return [];
    const raw = Array.isArray(alertasVencimiento) ? alertasVencimiento : (alertasVencimiento.facturas || []);
    return raw;
  }, [alertasVencimiento]);

  // 1. Facturas Vencidas (Mora Activa): de más días vencidos a menos (ej. -15, -5, -1)
  const facturasVencidas = useMemo(() => {
    return listaFacturasVencidas
      .filter(f => (f.dias_restantes !== undefined ? f.dias_restantes < 0 : (f.estado_alerta === 'vencida' || f.estado_vencimiento === 'vencida')))
      .sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0));
  }, [listaFacturasVencidas]);

  // 2. Facturas Por Vencer (Próximos Días): de las más próximas a vencer a las más lejanas (0, 1, 3...)
  const facturasPorVencer = useMemo(() => {
    return listaFacturasVencidas
      .filter(f => (f.dias_restantes !== undefined ? f.dias_restantes >= 0 : (f.estado_alerta === 'por_vencer' || f.estado_vencimiento === 'por_vencer')))
      .sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0));
  }, [listaFacturasVencidas]);

  const conteoVencidas = facturasVencidas.length;
  const conteoPorVencer = facturasPorVencer.length;

  // Totales globales desglosados: Cuenta Corriente (En Plazo) vs Cuenta Vencida (Mora)
  const totalVencidoGlobal = useMemo(() => {
    return facturasVencidas.reduce((sum, f) => sum + (parseFloat(f.saldo_pendiente ?? f.monto_total) || 0), 0);
  }, [facturasVencidas]);

  const totalCorrienteGlobal = useMemo(() => {
    const saldo = parseFloat(resumen?.saldo_global || 0);
    return Math.max(0, saldo - totalVencidoGlobal);
  }, [resumen, totalVencidoGlobal]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <i className="ri-building-line text-[#df000a]"></i>
            Adeudos a Proveedores
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Acumulado por factura y compras a crédito. Haz clic en un proveedor para ver el detalle.
          </p>
        </div>

        {/* Acciones de Cabecera: Exportación Contable + Recarga */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Reporte Pagos PDF */}
          <button
            onClick={() => exportarReporte('pdf')}
            disabled={descargandoPDF}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 active:scale-98 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60"
            title="Descargar reporte contable en PDF"
          >
            {descargandoPDF ? (
              <i className="ri-loader-4-line animate-spin text-sm"></i>
            ) : (
              <i className="ri-file-pdf-line text-sm text-rose-400"></i>
            )}
            <span>{descargandoPDF ? 'Generando...' : 'Reporte Pagos PDF'}</span>
          </button>

          {/* Botón Reporte Pagos Excel */}
          <button
            onClick={() => exportarReporte('excel')}
            disabled={descargandoExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 active:scale-98 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60"
            title="Descargar reporte contable en Excel (.xlsx)"
          >
            {descargandoExcel ? (
              <i className="ri-loader-4-line animate-spin text-sm"></i>
            ) : (
              <i className="ri-file-excel-line text-sm text-emerald-400"></i>
            )}
            <span>{descargandoExcel ? 'Generando...' : 'Reporte Pagos Excel'}</span>
          </button>

          {/* Botón Recargar */}
          <button
            onClick={() => { cargar(); cargarAlertas(); }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-white/[0.08] transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alertas de Notificación */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-medium">
          <i className="ri-error-warning-line text-lg flex-shrink-0 text-red-500"></i>
          <span>{error}</span>
        </div>
      )}
      {exito && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2 text-xs font-medium">
          <i className="ri-checkbox-circle-line text-lg flex-shrink-0 text-emerald-600"></i>
          <span>{exito}</span>
        </div>
      )}

      {/* Banner / Bloque Desplegable de Alertas de Vencimiento de Facturas */}
      {listaFacturasVencidas.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <i className="ri-alarm-warning-line text-lg"></i>
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <span>Alertas de Vencimiento de Facturas</span>
                  {conteoVencidas > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {conteoVencidas} vencida{conteoVencidas > 1 ? 's' : ''}
                    </span>
                  )}
                  {conteoPorVencer > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {conteoPorVencer} por vencer (7 días)
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Monitoreo preventivo de crédito con proveedores para evitar suspensión de despachos.
                </p>
              </div>
            </div>

            <button
              onClick={() => setMostrarAlertas(!mostrarAlertas)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>{mostrarAlertas ? 'Ocultar' : 'Ver detalle'}</span>
              <i className={mostrarAlertas ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i>
            </button>
          </div>

          {mostrarAlertas && (
            <div className="divide-y divide-slate-800 bg-slate-950">
              {/* SECCIÓN 1: Facturas Vencidas (Mora Activa) - Arriba, ordenadas de más días vencidos a menos */}
              {facturasVencidas.length > 0 && (
                <div>
                  <div className="px-3.5 py-2 bg-rose-950/60 border-b border-rose-900/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-300 uppercase tracking-wider">
                      <i className="ri-error-warning-fill text-rose-500"></i>
                      <span>Facturas Vencidas (Mora Activa)</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-rose-300 bg-rose-900/50 px-2 py-0.5 rounded-md border border-rose-700/50">
                      {facturasVencidas.length} factura{facturasVencidas.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-900">
                    {facturasVencidas.map((f, idx) => {
                      const dias = f.dias_restantes ?? 0;
                      return (
                        <div
                          key={`vencida-${f.id || idx}`}
                          className="py-2.5 px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-900/70 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                            <div>
                              <div className="flex items-center gap-2 text-xs font-bold text-white">
                                <span className="font-mono text-rose-200">{f.numero_factura || f.folio_remision || 'Sin Folio'}</span>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-200">{f.proveedor_nombre}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>Vence: <strong className="font-mono text-slate-300">{f.fecha_vencimiento}</strong></span>
                                <span>•</span>
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  Venció hace {Math.abs(dias)} día{Math.abs(dias) === 1 ? '' : 's'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-between sm:justify-end">
                            <div className="text-right">
                              <div className="text-xs font-mono font-bold text-rose-300">
                                {fmt(f.saldo_pendiente ?? f.monto_total)}
                              </div>
                              <div className="text-[10px] text-slate-400">Saldo pendiente</div>
                            </div>

                            <button
                              onClick={() => abrirModalPago(
                                {
                                  proveedor_id: f.proveedor_id,
                                  proveedor_nombre: f.proveedor_nombre,
                                  saldo_pendiente: f.saldo_pendiente ?? f.monto_total,
                                },
                                null,
                                f.numero_factura || f.folio_remision
                              )}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                              title="Abonar a esta factura vencida"
                            >
                              <i className="ri-hand-coin-line text-sm"></i>
                              <span>Abonar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECCIÓN 2: Facturas Por Vencer (Próximos Días) - Abajo, ordenadas de más próximas a más lejanas */}
              {facturasPorVencer.length > 0 && (
                <div>
                  <div className="px-3.5 py-2 bg-amber-950/60 border-b border-amber-900/60 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                      <i className="ri-time-line text-amber-500"></i>
                      <span>Facturas Por Vencer (Próximos Días)</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-amber-300 bg-amber-900/50 px-2 py-0.5 rounded-md border border-amber-700/50">
                      {facturasPorVencer.length} factura{facturasPorVencer.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-900">
                    {facturasPorVencer.map((f, idx) => {
                      const dias = f.dias_restantes ?? 0;
                      return (
                        <div
                          key={`por-vencer-${f.id || idx}`}
                          className="py-2.5 px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-900/70 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <div>
                              <div className="flex items-center gap-2 text-xs font-bold text-white">
                                <span className="font-mono text-amber-200">{f.numero_factura || f.folio_remision || 'Sin Folio'}</span>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-200">{f.proveedor_nombre}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>Vence: <strong className="font-mono text-slate-300">{f.fecha_vencimiento}</strong></span>
                                <span>•</span>
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}`}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-between sm:justify-end">
                            <div className="text-right">
                              <div className="text-xs font-mono font-bold text-emerald-400">
                                {fmt(f.saldo_pendiente ?? f.monto_total)}
                              </div>
                              <div className="text-[10px] text-slate-400">Saldo pendiente</div>
                            </div>

                            <button
                              onClick={() => abrirModalPago(
                                {
                                  proveedor_id: f.proveedor_id,
                                  proveedor_nombre: f.proveedor_nombre,
                                  saldo_pendiente: f.saldo_pendiente ?? f.monto_total,
                                },
                                null,
                                f.numero_factura || f.folio_remision
                              )}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                              title="Abonar a esta factura próxima a vencer"
                            >
                              <i className="ri-hand-coin-line text-sm"></i>
                              <span>Abonar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tarjetas globales: Saldo Total, Cuenta Corriente y Cuenta Vencida */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tarjeta 1: Deuda Total & Pagado */}
          <div className="bg-[#141720] rounded-xl border border-white/[0.08] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-[#df000a] flex items-center justify-center flex-shrink-0 border border-red-500/20">
                <DocumentTextIcon className="h-6 w-6 text-[#df000a]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-400 uppercase font-bold">Deuda Total</p>
                <p className="text-xl font-black text-white font-mono">{fmt(resumen.total_deuda_global)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">
                  Pagado: <strong className="text-emerald-400">{fmt(resumen.total_pagado_global)}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 2: Saldo Total */}
          <div className="bg-[#141720] rounded-xl border border-white/[0.08] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0 border border-white/[0.05]">
                <BanknotesIcon className="h-6 w-6 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-400 uppercase font-bold">Saldo Total Deuda</p>
                <p className="text-xl font-black text-white font-mono">{fmt(resumen.saldo_global)}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  Total de todas las cuentas
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 3: Cuenta Corriente (En Plazo) */}
          <div className="bg-[#141720] rounded-xl border border-emerald-500/30 p-5 shadow-sm bg-emerald-950/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
                <CheckCircleIcon className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-emerald-400 uppercase font-bold">Cuenta Corriente (En Plazo)</p>
                <p className="text-xl font-black text-emerald-400 font-mono">{fmt(totalCorrienteGlobal)}</p>
                <p className="text-[11px] text-emerald-400/80 mt-0.5 truncate">
                  Dentro del plazo de crédito
                </p>
              </div>
            </div>
          </div>

          {/* Tarjeta 4: Cuenta Vencida (Mora) */}
          <div className={`bg-[#141720] rounded-xl border p-5 shadow-sm ${totalVencidoGlobal > 0 ? 'border-rose-500/40 bg-rose-950/20' : 'border-white/[0.08]'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${totalVencidoGlobal > 0 ? 'bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/30' : 'bg-slate-800 text-slate-500 border border-white/[0.05]'}`}>
                <ExclamationTriangleIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-rose-400 uppercase font-bold">Cuenta Vencida (Mora)</p>
                <p className={`text-xl font-black font-mono ${totalVencidoGlobal > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                  {fmt(totalVencidoGlobal)}
                </p>
                <p className={`text-[11px] mt-0.5 truncate ${totalVencidoGlobal > 0 ? 'text-rose-400 font-semibold' : 'text-slate-500'}`}>
                  {totalVencidoGlobal > 0 ? 'Requiere pago prioritario' : 'Sin mora activa'}
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
            alertasVencimiento={listaFacturasVencidas}
            onPago={abrirModalPago}
          />
        ))}
      </div>

      {/* Modal de pago */}
      {modalPago && (
        <ModalPago
          proveedor={modalPago.proveedorData}
          facturaPreseleccionada={modalPago.facturaPreseleccionada}
          alertasVencimiento={listaFacturasVencidas}
          onClose={cerrarModalPago}
          onGuardado={pagoGuardado}
        />
      )}
    </div>
  );
}
