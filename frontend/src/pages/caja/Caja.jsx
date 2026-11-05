import { useState } from 'react';
import ModalTicket from '../../components/ModalTicket';
import AutorizacionVentaSection from '../../components/AutorizacionVentaSection';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  XMarkIcon,
  BanknotesIcon,
  CalculatorIcon,
  DocumentTextIcon,
  ShoppingCartIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockClosedIcon,
  LockOpenIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const API_CAJA = '/api/caja';
const tok = () => localStorage.getItem('token');
const hdrs = () => ({ Authorization: `Bearer ${tok()}` });
const jsonHdrs = () => ({ ...hdrs(), 'Content-Type': 'application/json' });
const fmt = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// --- Denominaciones MXN -------------------------------------------------------
export const DENOMINACIONES_BILLETES = [
  { key: 'billetes_1000', valor: 1000, label: '$1,000' },
  { key: 'billetes_500',  valor: 500,  label: '$500' },
  { key: 'billetes_200',  valor: 200,  label: '$200' },
  { key: 'billetes_100',  valor: 100,  label: '$100' },
  { key: 'billetes_50',   valor: 50,   label: '$50' },
  { key: 'billetes_20',   valor: 20,   label: '$20' },
];

export const DENOMINACIONES_MONEDAS = [
  { key: 'monedas_20',  valor: 20,  label: '$20' },
  { key: 'monedas_10',  valor: 10,  label: '$10' },
  { key: 'monedas_5',   valor: 5,   label: '$5' },
  { key: 'monedas_2',   valor: 2,   label: '$2' },
  { key: 'monedas_1',   valor: 1,   label: '$1' },
  { key: 'monedas_050', valor: 0.5, label: '$0.50' },
];

export const DENOM_INITIAL = {
  billetes_1000: '', billetes_500: '', billetes_200: '',
  billetes_100: '', billetes_50: '', billetes_20: '',
  monedas_20: '', monedas_10: '', monedas_5: '',
  monedas_2: '', monedas_1: '', monedas_050: '',
};

export function calcTotalArqueo(arqueo) {
  if (!arqueo) return 0;
  const totalBilletes = DENOMINACIONES_BILLETES.reduce(
    (sum, d) => sum + d.valor * (parseInt(arqueo[d.key], 10) || 0),
    0
  );
  const totalMonedas = DENOMINACIONES_MONEDAS.reduce(
    (sum, d) => sum + d.valor * (parseFloat(arqueo[d.key]) || 0),
    0
  );
  return totalBilletes + totalMonedas;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Badge({ text, color = 'gray' }) {
  const map = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-red-100 text-[#a80008]',
    gray: 'bg-gray-100 text-gray-600',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[color] ?? map.gray}`}>{text}</span>
  );
}

function StatCard({ icon: Icon, label, value, color = 'blue', sub }) {
  const colors = {
    blue: 'bg-red-50 text-[#df000a] border-red-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="flex items-center gap-3 mb-2">
        <Icon className="h-6 w-6" />
        <span className="text-sm font-medium opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Modal Apertura ──────────────────────────────────────────────────────────
function ModalApertura({ empleados, onGuardado, onClose }) {
  const [form, setForm] = useState({ empleado_apertura: '', monto_inicial: '', notas_apertura: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/cajas/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({ ...form, monto_inicial: parseFloat(form.monto_inicial) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <LockOpenIcon className="h-6 w-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-900">Abrir Caja</h2>
        </div>
        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select required value={form.empleado_apertura}
              onChange={(e) => setForm({ ...form, empleado_apertura: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto inicial (fondo) *</label>
            <input type="number" min="0" step="0.01" required value={form.monto_inicial}
              onChange={(e) => setForm({ ...form, monto_inicial: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea rows={2} value={form.notas_apertura}
              onChange={(e) => setForm({ ...form, notas_apertura: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockOpenIcon className="h-4 w-4" />}
              Abrir Caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Cierre ────────────────────────────────────────────────────────────
function ModalCierre({ caja, empleados, onGuardado, onClose }) {
  const [paso, setPaso] = useState(1); // 1=arqueo, 2=confirmar
  const [arqueo, setArqueo] = useState(DENOM_INITIAL);
  const [form, setForm] = useState({ empleado_cierre: '', notas_cierre: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const totalArqueo = calcTotalArqueo(arqueo);
  const diferencia  = totalArqueo - parseFloat(caja.saldo_esperado || 0);

  const tieneMovimientos =
    (caja.num_ventas || 0) > 0 ||
    parseFloat(caja.saldo_esperado || 0) > 0 ||
    parseFloat(caja.monto_inicial || 0) > 0 ||
    parseFloat(caja.total_ingresos || 0) > 0 ||
    parseFloat(caja.total_egresos || 0) > 0;

  const setDenom = (d, val) =>
    setArqueo((prev) => ({ ...prev, [d]: val === '' ? '' : val }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const notasFinal = form.notas_cierre || (totalArqueo === 0 && parseFloat(caja.saldo_esperado || 0) === 0 ? 'Cierre en ceros (apertura accidental o sin operaciones)' : '');
      const res = await fetch(`${API_CAJA}/cajas/${caja.id}/cerrar/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({
          ...form,
          notas_cierre: notasFinal,
          monto_final: totalArqueo,
          empleado_cierre: parseInt(form.empleado_cierre),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <LockClosedIcon className="h-6 w-6 text-red-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cerrar Caja {caja.folio}</h2>
              <p className="text-xs text-gray-500">
                {paso === 1 ? 'Paso 1 de 2 — Arqueo de efectivo' : 'Paso 2 de 2 — Confirmar cierre'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen saldo esperado */}
        <div className="mx-6 mt-4 bg-gray-50 rounded-lg px-4 py-3 text-sm grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">Saldo esperado:</span>{' '}
            <span className="font-semibold text-gray-800">{fmt(caja.saldo_esperado)}</span>
          </div>
          <div>
            <span className="text-gray-500">Ventas del día:</span>{' '}
            <span className="font-semibold text-gray-800">{caja.num_ventas}</span>
          </div>
        </div>

        {/* --- Paso 1: Arqueo ------------------------------------------- */}
        {paso === 1 && (
          <div className="px-6 py-4 space-y-5">
            {/* Billetes */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <BanknotesIcon className="h-4 w-4 text-gray-500" />
                Billetes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DENOMINACIONES_BILLETES.map((d) => (
                  <div key={d.key} className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-0.5 font-medium">{d.label}</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                      <input
                        type="number"
                        min="0"
                        value={arqueo[d.key] || ''}
                        onChange={(e) => setDenom(d.key, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-[#df000a]"
                      />
                      <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                        pzs
                      </span>
                    </div>
                    {(parseFloat(arqueo[d.key]) || 0) > 0 && (
                      <span className="text-xs text-green-600 mt-0.5 text-right font-medium">
                        = {fmt(d.valor * (parseInt(arqueo[d.key], 10) || 0))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Monedas */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <CurrencyDollarIcon className="h-4 w-4 text-gray-500" />
                Monedas
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DENOMINACIONES_MONEDAS.map((d) => (
                  <div key={d.key} className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-0.5 font-medium">{d.label}</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                      <input
                        type="number"
                        min="0"
                        value={arqueo[d.key] || ''}
                        onChange={(e) => setDenom(d.key, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-[#df000a]"
                      />
                      <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                        pzs
                      </span>
                    </div>
                    {(parseFloat(arqueo[d.key]) || 0) > 0 && (
                      <span className="text-xs text-green-600 mt-0.5 text-right font-medium">
                        = {fmt(d.valor * (parseFloat(arqueo[d.key]) || 0))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total arqueo */}
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#a80008]">Total contado:</span>
              <span className="text-xl font-bold text-[#8c0007]">{fmt(totalArqueo)}</span>
            </div>

            {totalArqueo === 0 && tieneMovimientos && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-start gap-2">
                <i className="ri-error-warning-line text-sm text-rose-600 mt-0.5"></i>
                <span>
                  <strong>Caja con movimientos:</strong> Registra {caja.num_ventas || 0} operaciones y un saldo esperado de {fmt(caja.saldo_esperado)}. No es posible cerrarla en $0.00; ingrese el conteo físico de billetes y monedas.
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={totalArqueo === 0 && tieneMovimientos}
                onClick={() => setPaso(2)}
                className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <CalculatorIcon className="h-4 w-4" />
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* --- Paso 2: Confirmar cierre ---------------------------------- */}
        {paso === 2 && (
          <form onSubmit={submit} className="px-6 py-4 space-y-4">
            {totalArqueo === 0 && parseFloat(caja.saldo_esperado || 0) === 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
                <i className="ri-information-line text-sm text-amber-600 mt-0.5"></i>
                <span>
                  <strong>Caja en $0.00:</strong> Al cerrarla sin operaciones ni ventas, se descartará automáticamente para no ensuciar el historial contable.
                </span>
              </div>
            )}
            <div className="rounded-lg border overflow-hidden text-sm">
              <div className="px-4 py-2 bg-gray-50 border-b grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Saldo esperado</p>
                  <p className="font-bold text-gray-800">{fmt(caja.saldo_esperado)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total arqueo</p>
                  <p className="font-bold text-gray-800">{fmt(totalArqueo)}</p>
                </div>
              </div>
              <div className={`px-4 py-3 flex items-center justify-between ${diferencia >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`font-semibold text-sm ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {diferencia >= 0 ? 'Sobrante' : 'Faltante'}
                </span>
                <span className={`text-lg font-bold ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empleado que cierra *</label>
              <select required value={form.empleado_cierre}
                onChange={(e) => setForm({ ...form, empleado_cierre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-400">
                <option value="">Seleccionar empleado</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <textarea rows={2} value={form.notas_cierre}
                onChange={(e) => setForm({ ...form, notas_cierre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-400" />
            </div>

            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setPaso(1)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                ← Regresar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockClosedIcon className="h-4 w-4" />}
                Cerrar Caja
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal Arqueo (Conteo Físico) ─────────────────────────────────────────────
function ModalArqueo({ caja, empleados, onGuardado, onClose }) {
  const [arqueo, setArqueo] = useState(DENOM_INITIAL);
  const [empleado, setEmpleado] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const totalArqueo = calcTotalArqueo(arqueo);
  const diferencia = totalArqueo - parseFloat(caja?.saldo_esperado || 0);

  const setDenom = (k, val) =>
    setArqueo((prev) => ({ ...prev, [k]: val === '' ? '' : val }));

  const submit = async (e) => {
    e.preventDefault();
    if (!empleado) {
      setErr('Selecciona el empleado que realiza el arqueo.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = {
        caja: caja.id,
        empleado: parseInt(empleado, 10),
        billetes_1000: parseInt(arqueo.billetes_1000, 10) || 0,
        billetes_500: parseInt(arqueo.billetes_500, 10) || 0,
        billetes_200: parseInt(arqueo.billetes_200, 10) || 0,
        billetes_100: parseInt(arqueo.billetes_100, 10) || 0,
        billetes_50: parseInt(arqueo.billetes_50, 10) || 0,
        billetes_20: parseInt(arqueo.billetes_20, 10) || 0,
        monedas_20: parseInt(arqueo.monedas_20, 10) || 0,
        monedas_10: parseInt(arqueo.monedas_10, 10) || 0,
        monedas_5: parseInt(arqueo.monedas_5, 10) || 0,
        monedas_2: parseInt(arqueo.monedas_2, 10) || 0,
        monedas_1: parseInt(arqueo.monedas_1, 10) || 0,
        monedas_050: parseInt(arqueo.monedas_050, 10) || 0,
        notas: notas.trim(),
      };
      const res = await fetch(`${API_CAJA}/arqueos/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail || data.error || JSON.stringify(data));
        return;
      }
      onGuardado(data);
    } catch {
      setErr('Error de conexión al registrar el arqueo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <CalculatorIcon className="h-6 w-6 text-[#df000a]" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Arqueo de Efectivo {caja?.folio}</h2>
              <p className="text-xs text-gray-500">Conteo físico de dinero en turno</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-6 mt-4 bg-gray-50 rounded-lg px-4 py-3 text-sm grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">Saldo esperado:</span>{' '}
            <span className="font-semibold text-gray-800">{fmt(caja?.saldo_esperado)}</span>
          </div>
          <div>
            <span className="text-gray-500">Ventas en caja:</span>{' '}
            <span className="font-semibold text-gray-800">{caja?.num_ventas || 0}</span>
          </div>
        </div>

        {err && (
          <div className="mx-6 mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <form onSubmit={submit} className="px-6 py-4 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Empleado responsable *</label>
            <select
              required
              value={empleado}
              onChange={(e) => setEmpleado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#df000a]"
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre_completo || `${e.nombre} ${e.apellido}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <BanknotesIcon className="h-4 w-4 text-gray-500" />
              Billetes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DENOMINACIONES_BILLETES.map((d) => (
                <div key={d.key} className="flex flex-col">
                  <label className="text-xs text-gray-500 mb-0.5 font-medium">{d.label}</label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <input
                      type="number"
                      min="0"
                      value={arqueo[d.key] || ''}
                      onChange={(e) => setDenom(d.key, e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-[#df000a]"
                    />
                    <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                      pzs
                    </span>
                  </div>
                  {(parseFloat(arqueo[d.key]) || 0) > 0 && (
                    <span className="text-xs text-green-600 mt-0.5 text-right font-medium">
                      = {fmt(d.valor * (parseInt(arqueo[d.key], 10) || 0))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <CurrencyDollarIcon className="h-4 w-4 text-gray-500" />
              Monedas
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DENOMINACIONES_MONEDAS.map((d) => (
                <div key={d.key} className="flex flex-col">
                  <label className="text-xs text-gray-500 mb-0.5 font-medium">{d.label}</label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <input
                      type="number"
                      min="0"
                      value={arqueo[d.key] || ''}
                      onChange={(e) => setDenom(d.key, e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-[#df000a]"
                    />
                    <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                      pzs
                    </span>
                  </div>
                  {(parseFloat(arqueo[d.key]) || 0) > 0 && (
                    <span className="text-xs text-green-600 mt-0.5 text-right font-medium">
                      = {fmt(d.valor * (parseFloat(arqueo[d.key]) || 0))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border overflow-hidden text-sm">
            <div className="px-4 py-2 bg-gray-50 border-b grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-400">Saldo esperado</p>
                <p className="font-bold text-gray-800">{fmt(caja?.saldo_esperado)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total arqueo contado</p>
                <p className="font-bold text-gray-800">{fmt(totalArqueo)}</p>
              </div>
            </div>
            <div className={`px-4 py-2.5 flex items-center justify-between ${diferencia >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <span className={`font-semibold text-sm ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {diferencia >= 0 ? 'Sobrante estimado' : 'Faltante estimado'}
              </span>
              <span className={`text-base font-bold ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Notas del Arqueo</label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones sobre billetes, diferencias, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-[#df000a] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CalculatorIcon className="h-4 w-4" />}
              Guardar Arqueo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Modificar Cierre (Administrador) ──────────────────────────────────
function ModalModificarCierre({ caja, empleados, onGuardado, onClose }) {
  const [montoFinal, setMontoFinal] = useState(caja?.monto_final != null ? String(caja.monto_final) : '');
  const [empleadoCierre, setEmpleadoCierre] = useState(() => {
    if (caja?.empleado_cierre_id) return String(caja.empleado_cierre_id);
    const found = empleados.find(e => e.nombre_completo === caja?.empleado_cierre || `${e.nombre} ${e.apellido}` === caja?.empleado_cierre);
    return found ? String(found.id) : '';
  });
  const [notasCierre, setNotasCierre] = useState(caja?.notas_cierre || '');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const saldoEsperado = parseFloat(caja?.saldo_esperado || 0);
  const montoFinalNum = parseFloat(montoFinal) || 0;
  const nuevaDiferencia = montoFinalNum - saldoEsperado;

  const submit = async (e) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setErr('El motivo de la modificación es obligatorio para fines de auditoría.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/cajas/${caja.id}/modificar_cierre/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({
          monto_final: montoFinalNum,
          empleado_cierre: empleadoCierre ? parseInt(empleadoCierre, 10) : undefined,
          notas_cierre: notasCierre.trim(),
          motivo: motivo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail || data.error || JSON.stringify(data));
        return;
      }
      onGuardado(data);
    } catch {
      setErr('Error de conexión al modificar el cierre de caja.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 p-6">
        <div className="flex items-center justify-between mb-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <PencilIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Modificar Cierre {caja?.folio}</h2>
              <p className="text-xs text-gray-500">Ajuste administrativo de arqueo y cierre</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen previo */}
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-gray-400 block">Saldo Esperado</span>
            <span className="font-bold text-gray-800 text-sm">{fmt(caja?.saldo_esperado)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Monto Final Anterior</span>
            <span className="font-bold text-gray-800 text-sm">{fmt(caja?.monto_final)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Diferencia Anterior</span>
            <span className={`font-bold text-sm ${parseFloat(caja?.diferencia || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {parseFloat(caja?.diferencia || 0) >= 0 ? '+' : ''}{fmt(caja?.diferencia)}
            </span>
          </div>
        </div>

        {/* Alerta de Auditoría */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-900 flex items-start gap-2">
          <i className="ri-shield-check-line text-blue-600 text-base mt-0.5 flex-shrink-0"></i>
          <span>
            <strong>Registro de Auditoría:</strong> Esta modificación quedará registrada con tu usuario, fecha y el motivo estipulado en la bitácora administrativa del sistema.
          </span>
        </div>

        {err && (
          <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 font-medium">
            {err}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Monto Final Contado ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={montoFinal}
              onChange={(e) => setMontoFinal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-base font-bold text-gray-900 focus:ring-2 focus:ring-[#df000a]"
            />
            <div className={`mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
              nuevaDiferencia >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <span>Nueva diferencia ({nuevaDiferencia >= 0 ? 'Sobrante' : 'Faltante'}):</span>
              <span className="font-bold font-mono text-sm">
                {nuevaDiferencia >= 0 ? '+' : ''}{fmt(nuevaDiferencia)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Empleado de Cierre</label>
            <select
              value={empleadoCierre}
              onChange={(e) => setEmpleadoCierre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-[#df000a]"
            >
              <option value="">Mantener empleado actual</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre_completo || `${e.nombre} ${e.apellido}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Notas de Cierre</label>
            <textarea
              rows={2}
              value={notasCierre}
              onChange={(e) => setNotasCierre(e.target.value)}
              placeholder="Notas generales del cierre"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-[#df000a] resize-none text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#df000a] uppercase mb-1">
              Motivo de la Modificación * (Obligatorio)
            </label>
            <input
              type="text"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Corrección por billete de $500 no contado en arqueo nocturno"
              className="w-full px-3 py-2 border border-red-300 bg-red-50/20 rounded-xl text-gray-900 text-xs focus:ring-2 focus:ring-[#df000a]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#df000a] hover:bg-[#c4000a] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-red-950/20"
            >
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PencilIcon className="h-4 w-4" />}
              Guardar Modificación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Reabrir Caja (Administrador) ───────────────────────────────────────
function ModalReabrirCaja({ caja, onReabierta, onClose }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setErr('Debes ingresar el motivo de reapertura.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/cajas/${caja.id}/reabrir/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail || data.error || JSON.stringify(data));
        return;
      }
      onReabierta(data);
    } catch {
      setErr('Error de conexión al reabrir la caja.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
          <LockOpenIcon className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
          ¿Reabrir Caja {caja?.folio}?
        </h3>
        <p className="text-center text-xs text-gray-500 mb-4">
          Apertura original: {caja?.fecha_apertura}
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Advertencia importante:</strong> Esta acción volverá a poner la caja en estado <strong>ABIERTA</strong>. No debe existir otra caja abierta simultáneamente en el sistema.
          </div>
        </div>

        {err && (
          <div className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 font-medium">
            {err}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Motivo de reapertura *
            </label>
            <textarea
              rows={2}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Se cerró por error antes de ingresar última venta del turno"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-md shadow-emerald-950/20 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockOpenIcon className="h-4 w-4" />}
              Reabrir Caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Movimiento (Nuevo) ────────────────────────────────────────────────
function ModalMovimiento({ cajaId, empleados, onGuardado, onClose }) {
  const [form, setForm] = useState({ caja: cajaId, tipo: 'ingreso', concepto: '', descripcion: '', monto: '', empleado: '', categoria: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/movimientos/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({ ...form, monto: parseFloat(form.monto), empleado: parseInt(form.empleado) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Registrar Movimiento</h2>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
            {['ingreso', 'egreso'].map((t) => (
              <button key={t} type="button"
                onClick={() => setForm({ ...form, tipo: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.tipo === t
                  ? t === 'ingreso' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select required value={form.empleado} onChange={(e) => setForm({ ...form, empleado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]">
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
              <input required type="text" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input required type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría (opcional)</label>
            <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Operativo, Servicios, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <textarea rows={2} value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Detalles adicionales del movimiento"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a] resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50">
              {loading ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Editar Movimiento ─────────────────────────────────────────────────
function ModalEditarMovimiento({ movimiento, empleados, onGuardado, onClose }) {
  const [form, setForm] = useState({
    tipo: movimiento.tipo || 'ingreso',
    concepto: movimiento.concepto || '',
    descripcion: movimiento.descripcion || '',
    monto: String(movimiento.monto || ''),
    empleado: String(movimiento.empleado || ''),
    categoria: movimiento.categoria || '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/movimientos/${movimiento.id}/`, {
        method: 'PATCH',
        headers: jsonHdrs(),
        body: JSON.stringify({
          tipo: form.tipo,
          concepto: form.concepto.trim(),
          descripcion: form.descripcion.trim(),
          monto: parseFloat(form.monto),
          empleado: parseInt(form.empleado),
          categoria: form.categoria.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Editar Movimiento</h2>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
            {['ingreso', 'egreso'].map((t) => (
              <button key={t} type="button"
                onClick={() => setForm({ ...form, tipo: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.tipo === t
                  ? t === 'ingreso' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select required value={form.empleado} onChange={(e) => setForm({ ...form, empleado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]">
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
              <input required type="text" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input required type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea rows={2} value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a] resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Eliminar Movimiento ───────────────────────────────────────────────
function ModalEliminarMovimiento({ movimiento, onEliminado, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const eliminar = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/movimientos/${movimiento.id}/`, {
        method: 'DELETE',
        headers: hdrs(),
      });
      if (res.ok || res.status === 204) {
        onEliminado();
      } else {
        const d = await res.json();
        setErr(d.error || d.detail || 'Error al eliminar el movimiento');
      }
    } catch {
      setErr('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <TrashIcon className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar Movimiento</h3>
        <p className="text-sm text-gray-600 mb-4">
          ¿Estás seguro de eliminar el movimiento <strong>{movimiento.concepto}</strong> ({movimiento.tipo === 'ingreso' ? '+' : '-'}{fmt(movimiento.monto)})?
        </p>
        {err && <div className="text-xs text-red-600 bg-red-50 p-2 rounded mb-3">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={eliminar} disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Editar Venta ───────────────────────────────────────────────────────
function ModalEditarVenta({ venta, empleados, clientes, onGuardado, onClose }) {
  const [form, setForm] = useState({
    empleado: String(venta.empleado || ''),
    cliente: String(venta.cliente || ''),
    metodo_pago: venta.metodo_pago || 'efectivo',
    tipo_tarjeta: venta.tipo_tarjeta || 'debito',
    num_operacion: venta.num_operacion || '',
    num_referencia: venta.num_referencia || '',
    notas: venta.notas || '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Control de autorización por roles
  const rol = localStorage.getItem('rol') || '';
  const esAdmin = ['admin', 'administrador'].includes(rol.toLowerCase());

  const [motivo, setMotivo] = useState('');
  const [pinAdmin, setPinAdmin] = useState('');
  const [codigoOtp, setCodigoOtp] = useState('');
  const [tabAuth, setTabAuth] = useState('pin'); // 'pin' | 'remoto'
  const [aprobadoRemoto, setAprobadoRemoto] = useState(false);
  const [adminAprobador, setAdminAprobador] = useState('');

  const puedeGuardar = esAdmin || (
    tabAuth === 'pin'
      ? (pinAdmin.length >= 4 && motivo.trim().length >= 3)
      : (motivo.trim().length >= 3 && (aprobadoRemoto || codigoOtp.trim().length === 6))
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!puedeGuardar) {
      if (!esAdmin) {
        if (!motivo.trim()) {
          setErr('Debes ingresar el motivo de la edición.');
          return;
        }
        if (tabAuth === 'pin' && pinAdmin.length < 4) {
          setErr('Debes ingresar un PIN de administrador válido (4 a 6 dígitos).');
          return;
        }
        if (tabAuth === 'remoto' && !aprobadoRemoto && codigoOtp.trim().length !== 6) {
          setErr('Debes esperar la aprobación remota del Administrador o ingresar el código OTP de 6 dígitos.');
          return;
        }
      }
      return;
    }

    setLoading(true); setErr(null);
    try {
      const payload = {
        empleado: form.empleado ? parseInt(form.empleado) : undefined,
        cliente: form.cliente ? parseInt(form.cliente) : null,
        metodo_pago: form.metodo_pago,
        tipo_tarjeta: ['tarjeta', 'mixto'].includes(form.metodo_pago) ? form.tipo_tarjeta : null,
        num_operacion: ['tarjeta', 'mixto'].includes(form.metodo_pago) ? form.num_operacion.trim() : '',
        num_referencia: ['transferencia', 'mixto'].includes(form.metodo_pago) ? form.num_referencia.trim() : '',
        notas: form.notas.trim(),
      };

      if (!esAdmin) {
        payload.motivo = motivo.trim();
        if (tabAuth === 'pin') {
          payload.pin_admin = pinAdmin.trim();
        } else {
          payload.codigo_autorizacion = codigoOtp.trim();
        }
      }

      const res = await fetch(`/api/ventas/ventas/${venta.id}/`, {
        method: 'PATCH',
        headers: jsonHdrs(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || data.error || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-100 text-[#df000a]">
              <PencilIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Editar Venta {venta.folio}</h2>
              <p className="text-xs text-gray-500">Monto total: {fmt(venta.total)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 font-medium">{err}</div>}

        <form onSubmit={submit} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Vendedor *</label>
            <select required value={form.empleado} onChange={(e) => setForm({ ...form, empleado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800">
              <option value="">Seleccionar vendedor</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre_completo || `${e.nombre} ${e.apellido}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Cliente</label>
            <select value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800">
              <option value="">Público General</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} — {c.telefono}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Método de Pago</label>
            <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>

          {['tarjeta', 'mixto'].includes(form.metodo_pago) && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Tipo de Tarjeta</label>
              <div className="grid grid-cols-2 gap-2">
                {['debito', 'credito'].map((tt) => (
                  <button key={tt} type="button" onClick={() => setForm({ ...form, tipo_tarjeta: tt })}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold border capitalize flex items-center justify-center gap-1.5 cursor-pointer ${
                      form.tipo_tarjeta === tt ? 'bg-[#df000a] text-white border-[#df000a]' : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}>
                    <i className={tt === 'debito' ? 'ri-bank-card-line' : 'ri-bank-card-2-line'}></i>
                    <span>{tt === 'debito' ? 'Débito' : 'Crédito'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {['tarjeta', 'mixto'].includes(form.metodo_pago) && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">No. Operación Tarjeta</label>
              <input type="text" value={form.num_operacion} onChange={(e) => setForm({ ...form, num_operacion: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800" />
            </div>
          )}

          {['transferencia', 'mixto'].includes(form.metodo_pago) && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">No. Referencia Transf.</label>
              <input type="text" value={form.num_referencia} onChange={(e) => setForm({ ...form, num_referencia: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Notas</label>
            <textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#df000a] text-gray-800 resize-none" />
          </div>

          {/* Sección de Autorización para Vendedores / Operadores */}
          {!esAdmin && (
            <AutorizacionVentaSection
              accion="editar_venta"
              venta={venta}
              motivo={motivo}
              setMotivo={setMotivo}
              pinAdmin={pinAdmin}
              setPinAdmin={setPinAdmin}
              codigoOtp={codigoOtp}
              setCodigoOtp={setCodigoOtp}
              tab={tabAuth}
              setTab={setTabAuth}
              aprobadoRemoto={aprobadoRemoto}
              setAprobadoRemoto={setAprobadoRemoto}
              adminAprobador={adminAprobador}
              setAdminAprobador={setAdminAprobador}
            />
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={loading || (!esAdmin && !puedeGuardar)}
              className="flex-1 px-4 py-2.5 bg-[#df000a] text-white rounded-xl hover:bg-[#c4000a] disabled:opacity-50 font-bold transition-all shadow-md shadow-red-950/20 cursor-pointer">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Eliminar Venta ─────────────────────────────────────────────────────
function ModalEliminarVenta({ venta, onEliminado, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Control de autorización por roles
  const rol = localStorage.getItem('rol') || '';
  const esAdmin = ['admin', 'administrador'].includes(rol.toLowerCase());

  const [motivo, setMotivo] = useState('');
  const [pinAdmin, setPinAdmin] = useState('');
  const [codigoOtp, setCodigoOtp] = useState('');
  const [tabAuth, setTabAuth] = useState('pin'); // 'pin' | 'remoto'
  const [aprobadoRemoto, setAprobadoRemoto] = useState(false);
  const [adminAprobador, setAdminAprobador] = useState('');

  const puedeEliminar = esAdmin || (
    tabAuth === 'pin'
      ? (pinAdmin.length >= 4 && motivo.trim().length >= 3)
      : (motivo.trim().length >= 3 && (aprobadoRemoto || codigoOtp.trim().length === 6))
  );

  const eliminar = async () => {
    if (!puedeEliminar) {
      if (!esAdmin) {
        if (!motivo.trim()) {
          setErr('Debes ingresar el motivo de la cancelación de la venta.');
          return;
        }
        if (tabAuth === 'pin' && pinAdmin.length < 4) {
          setErr('Debes ingresar un PIN de administrador válido (4 a 6 dígitos).');
          return;
        }
        if (tabAuth === 'remoto' && !aprobadoRemoto && codigoOtp.trim().length !== 6) {
          setErr('Debes esperar la aprobación remota del Administrador o ingresar el código OTP de 6 dígitos.');
          return;
        }
      }
      return;
    }

    setLoading(true); setErr(null);
    try {
      let url = `/api/ventas/ventas/${venta.id}/`;
      if (!esAdmin) {
        const params = new URLSearchParams();
        params.append('motivo', motivo.trim());
        if (tabAuth === 'pin') {
          params.append('pin_admin', pinAdmin.trim());
        } else {
          params.append('codigo_autorizacion', codigoOtp.trim());
        }
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, {
        method: 'DELETE',
        headers: hdrs(),
      });
      if (res.ok || res.status === 204) {
        onEliminado();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || d.detail || 'Error al eliminar la venta');
      }
    } catch {
      setErr('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 p-6 max-h-[92vh] overflow-y-auto">
        <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
          <ExclamationTriangleIcon className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
          ¿Eliminar Venta {venta.folio}?
        </h3>
        <p className="text-center text-sm font-semibold text-[#df000a] mb-4">
          Total: {fmt(venta.total)}
        </p>
        
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
          <i className="ri-error-warning-line text-amber-600 text-base mt-0.5 flex-shrink-0"></i>
          <div>
            <strong>Aviso de inventario:</strong> Al eliminar esta venta, el registro se cancelará de la caja y los productos vendidos retornarán automáticamente al stock disponible en el inventario.
          </div>
        </div>

        {/* Sección de Autorización para Vendedores / Operadores */}
        {!esAdmin && (
          <AutorizacionVentaSection
            accion="eliminar_venta"
            venta={venta}
            motivo={motivo}
            setMotivo={setMotivo}
            pinAdmin={pinAdmin}
            setPinAdmin={setPinAdmin}
            codigoOtp={codigoOtp}
            setCodigoOtp={setCodigoOtp}
            tab={tabAuth}
            setTab={setTabAuth}
            aprobadoRemoto={aprobadoRemoto}
            setAprobadoRemoto={setAprobadoRemoto}
            adminAprobador={adminAprobador}
            setAdminAprobador={setAdminAprobador}
          />
        )}

        {err && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200 mb-3 font-medium">{err}</div>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
            Cancelar
          </button>
          <button type="button" onClick={eliminar} disabled={loading || (!esAdmin && !puedeEliminar)}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-md shadow-red-950/20 cursor-pointer">
            {loading ? 'Eliminando...' : 'Sí, Eliminar Venta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Caja Activa ────────────────────────────────────────────────────────
function CajaActiva({ caja, ventas, movimientos, empleados, clientes, onRefresh, setModal, onNotif }) {
  const queryClient = useQueryClient();
  const metodoPagoColor = { efectivo: 'green', tarjeta: 'blue', transferencia: 'purple', mixto: 'orange' };
  const metodoPagoLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' };
  const [ticketVenta, setTicketVenta] = useState(null);
  const [ventaAEditar, setVentaAEditar] = useState(null);
  const [ventaAEliminar, setVentaAEliminar] = useState(null);
  const [movAEditar, setMovAEditar] = useState(null);
  const [movAEliminar, setMovAEliminar] = useState(null);

  const abrirTicket = async (id) => {
    const r = await fetch(`/api/ventas/ventas/${id}/ticket/`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (r.ok) setTicketVenta(await r.json());
  };

  const handleVentaEliminada = () => {
    setVentaAEliminar(null);
    onNotif('Venta eliminada y stock restituido al inventario.');
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
    queryClient.invalidateQueries({ queryKey: ['pos-productos'] });
    queryClient.invalidateQueries({ queryKey: ['inventario-consolidado'] });
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
  };

  const handleVentaEditada = () => {
    setVentaAEditar(null);
    onNotif('Venta actualizada correctamente.');
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
  };

  const handleMovEliminado = () => {
    setMovAEliminar(null);
    onNotif('Movimiento eliminado correctamente.');
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
  };

  const handleMovEditado = () => {
    setMovAEditar(null);
    onNotif('Movimiento actualizado correctamente.');
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
  };

  return (
    <div className="space-y-6">
      {/* Header caja */}
      <div className="bg-white rounded-xl border border-green-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-xl">
            <LockOpenIcon className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Caja activa</p>
            <h2 className="text-xl font-bold text-gray-900">{caja.folio}</h2>
            <p className="text-sm text-gray-500">
              Apertura: <span className="font-medium">{caja.fecha_apertura_formateada}</span>
              {' · '}{caja.empleado_apertura_nombre}
              {' · '}Inicial: <span className="font-medium">{fmt(caja.monto_inicial)}</span>
            </p>
          </div>
        </div>
        <div className="sm:ml-auto flex gap-2 flex-wrap">
          <button onClick={() => setModal('arqueo')}
            className="px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm flex items-center gap-1.5 cursor-pointer">
            <CalculatorIcon className="h-4 w-4" /> Arqueo
          </button>
          <button onClick={() => setModal('movimiento')}
            className="px-3 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] text-sm flex items-center gap-1.5 cursor-pointer">
            <PlusIcon className="h-4 w-4" /> Movimiento
          </button>
          <button onClick={onRefresh}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1.5 text-gray-600 cursor-pointer">
            <ArrowPathIcon className="h-4 w-4" /> Actualizar
          </button>
          <button onClick={() => setModal('cierre')}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center gap-1.5 cursor-pointer">
            <LockClosedIcon className="h-4 w-4" /> Cerrar Caja
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ShoppingCartIcon} label="Ventas registradas" value={caja.num_ventas ?? 0} color="blue" />
        <StatCard icon={CurrencyDollarIcon} label="Total ventas" value={fmt(caja.total_ventas)} color="green" />
        <StatCard icon={BanknotesIcon} label="Efectivo" value={fmt(caja.total_ventas_efectivo)} color="orange"
          sub={`Electrónico: ${fmt(caja.total_ventas_electronico)}`} />
        <StatCard icon={CalculatorIcon} label="Saldo esperado" value={fmt(caja.saldo_esperado)} color="purple"
          sub={`Egresos: ${fmt(caja.total_egresos)}`} />
      </div>

      {/* Ventas del día */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCartIcon className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-800">Ventas en esta caja</h3>
          <span className="ml-auto text-sm text-gray-400">{ventas.length} venta(s)</span>
        </div>
        {ventas.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Sin ventas registradas en esta caja aún.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Folio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Art.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Efectivo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Electrónico</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.map((v) => (
                  <tr key={v.id} className="hover:bg-red-50/50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{v.folio}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{v.fecha_formateada}</td>
                    <td className="px-4 py-3 text-gray-700">{v.empleado_nombre}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <Badge text={metodoPagoLabel[v.metodo_pago] ?? v.metodo_pago}
                          color={metodoPagoColor[v.metodo_pago] ?? 'gray'} />
                        {v.tipo_tarjeta && (
                          <span className="text-[10px] text-gray-400 font-mono capitalize">
                            {v.tipo_tarjeta}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{v.total_items}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-mono">{fmt(v.monto_efectivo)}</td>
                    <td className="px-4 py-3 text-right text-[#df000a] font-mono">{fmt(v.monto_electronico)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => abrirTicket(v.id)}
                          title="Imprimir ticket"
                          className="p-1.5 text-gray-400 hover:text-[#df000a] hover:bg-gray-100 rounded transition-colors"
                        >
                          <i className="ri-printer-line text-base"></i>
                        </button>
                        <button
                          onClick={() => setVentaAEditar(v)}
                          title="Editar Venta"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setVentaAEliminar(v)}
                          title="Eliminar Venta"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-gray-600">Totales</td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.monto_efectivo || 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-[#df000a]">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.monto_electronico || 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.total || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Movimientos extra */}
      {movimientos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <ArrowUpIcon className="h-5 w-5 text-gray-400" />
            <h3 className="font-semibold text-gray-800">Movimientos de caja</h3>
            <span className="ml-auto text-sm text-gray-400">{movimientos.length} movimiento(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Concepto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{m.fecha_formateada}</td>
                    <td className="px-4 py-2">
                      <Badge text={m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                        color={m.tipo === 'ingreso' ? 'green' : 'red'} />
                    </td>
                    <td className="px-4 py-2 text-gray-700">{m.concepto}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{m.categoria || '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold font-mono ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setMovAEditar(m)}
                          title="Editar Movimiento"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setMovAEliminar(m)}
                          title="Eliminar Movimiento"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
        </div>
      )}

      {/* Modales de acción */}
      <ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />

      {ventaAEditar && (
        <ModalEditarVenta
          venta={ventaAEditar}
          empleados={empleados}
          clientes={clientes}
          onGuardado={handleVentaEditada}
          onClose={() => setVentaAEditar(null)}
        />
      )}

      {ventaAEliminar && (
        <ModalEliminarVenta
          venta={ventaAEliminar}
          onEliminado={handleVentaEliminada}
          onClose={() => setVentaAEliminar(null)}
        />
      )}

      {movAEditar && (
        <ModalEditarMovimiento
          movimiento={movAEditar}
          empleados={empleados}
          onGuardado={handleMovEditado}
          onClose={() => setMovAEditar(null)}
        />
      )}

      {movAEliminar && (
        <ModalEliminarMovimiento
          movimiento={movAEliminar}
          onEliminado={handleMovEliminado}
          onClose={() => setMovAEliminar(null)}
        />
      )}
    </div>
  );
}

function ModalDetalleVenta({ venta, onClose, onReimprimir }) {
  if (!venta) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161a29] border border-white/[0.08] text-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
              <i className="ri-file-list-3-line text-xl"></i>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Detalle de Venta #{venta.folio}</h3>
              <p className="text-xs text-slate-400">{venta.fecha_formateada || venta.creado_en}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#1b2032] border border-white/[0.05]">
              <span className="text-[11px] uppercase font-bold text-slate-400 block">Atendió</span>
              <span className="text-sm font-semibold text-white truncate block">{venta.empleado_nombre || '—'}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#1b2032] border border-white/[0.05]">
              <span className="text-[11px] uppercase font-bold text-slate-400 block">Cliente</span>
              <span className="text-sm font-semibold text-white truncate block">{venta.cliente_nombre || venta.cliente?.nombre || 'Público General'}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#1b2032] border border-white/[0.05]">
              <span className="text-[11px] uppercase font-bold text-slate-400 block">Método</span>
              <span className="text-sm font-semibold text-emerald-400 capitalize block">{venta.metodo_pago}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#1b2032] border border-white/[0.05]">
              <span className="text-[11px] uppercase font-bold text-slate-400 block">Total</span>
              <span className="text-sm font-black font-mono text-white block">{fmt(venta.total)}</span>
            </div>
          </div>

          {venta.vehiculo && (
            <div className="p-3 rounded-xl bg-[#1b2032] border border-white/[0.05] flex items-center gap-2 text-xs text-slate-300">
              <i className="ri-car-line text-red-400 text-sm"></i>
              <span>Vehículo: <strong>{typeof venta.vehiculo === 'string' ? venta.vehiculo : `${venta.vehiculo.marca} ${venta.vehiculo.modelo} (${venta.vehiculo.placas || 'Sin placas'})`}</strong></span>
            </div>
          )}

          {/* Partidas / Detalles */}
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Productos y Servicios</h4>
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-[#1b2032] text-slate-400 border-b border-white/[0.08]">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">Concepto</th>
                    <th className="px-3 py-2 text-center font-bold">Cant.</th>
                    <th className="px-3 py-2 text-right font-bold">P. Unit</th>
                    <th className="px-3 py-2 text-right font-bold">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {(venta.detalles || []).length > 0 ? (
                    venta.detalles.map((d, i) => (
                      <tr key={d.id || i} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-slate-200">
                          <div className="font-semibold">{d.producto_nombre || d.producto_titulo || d.descripcion || 'Producto'}</div>
                          {d.producto_codigo && <div className="text-[10px] font-mono text-slate-400">{d.producto_codigo}</div>}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-slate-300">{d.cantidad}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{fmt(d.precio_unitario)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-white">{fmt(d.subtotal)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-slate-400">Sin desglose de partidas detalladas disponible.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#161a29] flex items-center justify-between gap-3">
          <button
            onClick={() => onReimprimir?.(venta.id)}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <i className="ri-printer-line text-sm"></i> Reimprimir Ticket
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1b2032] hover:bg-slate-700 border border-white/[0.08] text-slate-300 text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Historial ──────────────────────────────────────────────────────────
function Historial({ empleados = [], onNotif }) {
  const queryClient = useQueryClient();
  const rolUsuario = (localStorage.getItem('rol') || '').toLowerCase();
  const esAdmin = ['admin', 'administrador', 'gerente'].includes(rolUsuario);

  const [periodo, setPeriodo] = useState('hoy');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [submitted, setSubmitted] = useState({ periodo: 'hoy', fechaInicio: '', fechaFin: '' });
  const [cajasAbiertas, setCajasAbiertas] = useState({});
  const [ventasCaja, setVentasCaja] = useState({});
  const [ticketVenta, setTicketVenta] = useState(null);
  const [detalleVenta, setDetalleVenta] = useState(null);
  const [cajaAModificar, setCajaAModificar] = useState(null);
  const [cajaAReabrir, setCajaAReabrir] = useState(null);

  const handleCierreModificado = (data) => {
    setCajaAModificar(null);
    onNotif?.(`Cierre de caja ${data?.folio || ''} modificado con éxito.`);
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
    queryClient.invalidateQueries({ queryKey: ['cajas'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
  };

  const handleCajaReabierta = (data) => {
    setCajaAReabrir(null);
    onNotif?.(`Caja ${data?.folio || ''} reabierta exitosamente.`);
    queryClient.invalidateQueries({ queryKey: ['historial-cajas'] });
    queryClient.invalidateQueries({ queryKey: ['cajas'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
    queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
  };

  const abrirTicketHistorial = async (id) => {
    try {
      const r = await fetch(`/api/ventas/ventas/${id}/ticket/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (r.ok) setTicketVenta(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  const abrirDetalleHistorial = async (v) => {
    try {
      const r = await fetch(`/api/ventas/ventas/${v.id}/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (r.ok) {
        setDetalleVenta(await r.json());
      } else {
        setDetalleVenta(v);
      }
    } catch {
      setDetalleVenta(v);
    }
  };

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['historial-cajas', submitted.periodo, submitted.fechaInicio, submitted.fechaFin],
    queryFn: async () => {
      let url = `${API_CAJA}/cajas/historial/?periodo=${submitted.periodo}`;
      if (submitted.periodo === 'rango') url += `&fecha_inicio=${submitted.fechaInicio}&fecha_fin=${submitted.fechaFin}`;
      const res = await fetch(url, { headers: hdrs() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const error = queryError ? String(queryError) : null;

  const toggleCaja = async (cajaId) => {
    const abierto = cajasAbiertas[cajaId];
    if (abierto) { setCajasAbiertas((s) => ({ ...s, [cajaId]: false })); return; }
    setCajasAbiertas((s) => ({ ...s, [cajaId]: true }));
    if (ventasCaja[cajaId]) return;
    try {
      const res = await fetch(`${API_CAJA}/cajas/${cajaId}/ventas_caja/`, { headers: hdrs() });
      const d = await res.json();
      setVentasCaja((s) => ({ ...s, [cajaId]: d }));
    } catch { /* silencio */ }
  };

  const cambiarPeriodo = (key) => {
    setPeriodo(key);
    if (key !== 'rango') {
      setSubmitted({ periodo: key, fechaInicio: '', fechaFin: '' });
    }
  };

  const periodos = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'rango', label: 'Rango' },
  ];

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
        <div className="flex gap-2 flex-wrap">
          {periodos.map((p) => (
            <button key={p.key}
              onClick={() => cambiarPeriodo(p.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${periodo === p.key ? 'bg-[#df000a] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'rango' && (
          <div className="flex gap-2 items-center ml-2">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <span className="text-gray-400">—</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <button onClick={() => setSubmitted({ periodo: 'rango', fechaInicio, fechaFin })}
              className="ml-2 px-4 py-1.5 bg-[#df000a] text-white rounded-full text-sm font-medium hover:bg-[#c4000a] flex items-center gap-1.5">
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
              Buscar
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {data && (
        <>
          {/* Totales período */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={DocumentTextIcon} label="Cajas" value={data.totales.cajas} color="blue" />
            <StatCard icon={ShoppingCartIcon} label="Ventas totales" value={fmt(data.totales.monto_ventas)} color="green"
              sub={`${data.totales.ventas} venta(s)`} />
            <StatCard icon={BanknotesIcon} label="Efectivo" value={fmt(data.totales.efectivo)} color="orange"
              sub={`Electrónico: ${fmt(data.totales.electronico)}`} />
            <StatCard icon={ArrowDownIcon} label="Egresos" value={fmt(data.totales.egresos)} color="red" />
          </div>

          {/* Lista de cajas */}
          {data.cajas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay cajas en este período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.cajas.map((c) => {
                const abierta = cajasAbiertas[c.id];
                const vc = ventasCaja[c.id];
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <button onClick={() => toggleCaja(c.id)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left">
                      {abierta
                        ? <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        : <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                      <div className="w-28 flex-shrink-0">
                        <p className="font-mono font-semibold text-gray-800">{c.folio}</p>
                        <Badge text={c.estado} color={c.estado === 'abierta' ? 'green' : 'gray'} />
                      </div>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Apertura</p>
                          <p className="font-medium text-gray-700">{c.fecha_apertura}</p>
                          <p className="text-xs text-gray-500">{c.empleado_apertura}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Ventas ({c.num_ventas})</p>
                          <p className="font-semibold text-green-700">{fmt(c.total_ventas)}</p>
                          <p className="text-xs text-gray-400">Ef: {fmt(c.total_ventas_efectivo)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Saldo esperado</p>
                          <p className="font-bold text-gray-800">{fmt(c.saldo_esperado)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Diferencia</p>
                          {c.diferencia !== null ? (
                            <p className={`font-bold ${c.diferencia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {c.diferencia >= 0 ? '+' : ''}{fmt(c.diferencia)}
                            </p>
                          ) : <p className="text-gray-400 text-xs">Sin cierre</p>}
                        </div>
                      </div>
                    </button>

                    {/* Acciones administrativas para cajas cerradas */}
                    {esAdmin && c.estado === 'cerrada' && (
                      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setCajaAModificar(c)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors shadow-xs cursor-pointer"
                        >
                          <PencilIcon className="w-3.5 h-3.5 text-amber-600" />
                          <span>Modificar Cierre</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCajaAReabrir(c)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors shadow-xs cursor-pointer"
                        >
                          <LockOpenIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Reabrir Caja</span>
                        </button>
                      </div>
                    )}

                    {/* Detalle de ventas de la caja */}
                    {abierta && vc && (
                      <div className="border-t border-gray-100 overflow-x-auto">
                        <div className="px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                          Ventas registradas en {c.folio}
                        </div>
                        {vc.ventas && vc.ventas.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-gray-400">Sin ventas en esta caja.</p>
                        ) : (
                          <table className="min-w-full text-sm">
                            <thead className="bg-white border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Folio</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Hora</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Empleado</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Método</th>
                                <th className="px-4 py-2 text-right text-xs text-gray-400 font-medium">Efectivo</th>
                                <th className="px-4 py-2 text-right text-xs text-gray-400 font-medium">Electrónico</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400">Total</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-400">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {(vc.ventas || []).map((v) => (
                                <tr key={v.id} className="hover:bg-red-50/50">
                                  <td className="px-4 py-2 font-mono font-semibold text-gray-800">{v.folio}</td>
                                  <td className="px-4 py-2 text-xs text-gray-500">{v.fecha_formateada}</td>
                                  <td className="px-4 py-2 text-gray-700">{v.empleado_nombre}</td>
                                  <td className="px-4 py-2">
                                    <Badge text={v.metodo_pago}
                                      color={{ efectivo: 'green', tarjeta: 'blue', transferencia: 'purple', mixto: 'orange' }[v.metodo_pago] ?? 'gray'} />
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-green-700">{fmt(v.monto_efectivo)}</td>
                                  <td className="px-4 py-2 text-right font-mono text-[#df000a]">{fmt(v.monto_electronico)}</td>
                                  <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                                  <td className="px-4 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => abrirTicketHistorial(v.id)}
                                        title="Reimprimir Ticket"
                                        className="p-1.5 text-gray-400 hover:text-[#df000a] hover:bg-red-50 rounded transition-colors cursor-pointer"
                                      >
                                        <i className="ri-printer-line text-base"></i>
                                      </button>
                                      <button
                                        onClick={() => abrirDetalleHistorial(v)}
                                        title="Ver Detalle"
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                      >
                                        <i className="ri-eye-line text-base"></i>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de Reimpresión de Ticket Térmico Oficial */}
      {ticketVenta && (
        <ModalTicket venta={ticketVenta} onClose={() => setTicketVenta(null)} />
      )}

      {/* Modal de Detalle Completo de Venta */}
      {detalleVenta && (
        <ModalDetalleVenta
          venta={detalleVenta}
          onClose={() => setDetalleVenta(null)}
          onReimprimir={(id) => {
            setDetalleVenta(null);
            abrirTicketHistorial(id);
          }}
        />
      )}

      {/* Modal Modificar Cierre */}
      {cajaAModificar && (
        <ModalModificarCierre
          caja={cajaAModificar}
          empleados={empleados}
          onGuardado={handleCierreModificado}
          onClose={() => setCajaAModificar(null)}
        />
      )}

      {/* Modal Reabrir Caja */}
      {cajaAReabrir && (
        <ModalReabrirCaja
          caja={cajaAReabrir}
          onReabierta={handleCajaReabierta}
          onClose={() => setCajaAReabrir(null)}
        />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Caja() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('activa');
  const [exito, setExito] = useState(null);
  const [modal, setModal] = useState(null); // 'apertura' | 'cierre' | 'movimiento'

  const { data: cajaData, isLoading: loading } = useQuery({
    queryKey: ['caja-activa-completa'],
    queryFn: async () => {
      const res = await fetch(`${API_CAJA}/cajas/caja_actual/`, { headers: hdrs() });
      if (!res.ok) return { cajaActual: null, ventas: [], movimientos: [] };
      const caja = await res.json();
      if (!caja || caja.estado !== 'abierta') return { cajaActual: caja, ventas: [], movimientos: [] };
      const [resV, resM] = await Promise.all([
        fetch(`${API_CAJA}/cajas/${caja.id}/ventas_caja/`, { headers: hdrs() }),
        fetch(`${API_CAJA}/movimientos/?caja=${caja.id}`, { headers: hdrs() }),
      ]);
      const ventasData = resV.ok ? await resV.json() : {};
      const movData = resM.ok ? await resM.json() : [];
      return { cajaActual: caja, ventas: ventasData.ventas ?? [], movimientos: Array.isArray(movData) ? movData : movData.results ?? [] };
    },
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
  });
  const cajaActual = cajaData?.cajaActual ?? null;
  const ventas = cajaData?.ventas ?? [];
  const movimientos = cajaData?.movimientos ?? [];

  const { data: empleados = [] } = useQuery({
    queryKey: ['caja-empleados'],
    queryFn: async () => {
      const res = await fetch('/api/nomina/empleados/?activos=true', { headers: hdrs() });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : d.results ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['caja-clientes'],
    queryFn: async () => {
      const res = await fetch('/api/clientes/clientes/', { headers: hdrs() });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : d.results ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const ok = (msg) => { setExito(msg); setTimeout(() => setExito(null), 5000); };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de apertura, ventas, movimientos y cierre diario</p>
        </div>
        <div className="flex items-center gap-3">
          {cajaActual?.estado === 'abierta'
            ? <Badge text={<span className="flex items-center gap-1"><i className="ri-checkbox-circle-line"></i> Caja abierta</span>} color="green" />
            : <Badge text={<span className="flex items-center gap-1"><i className="ri-forbid-2-line"></i> Sin caja activa</span>} color="gray" />}
        </div>
      </div>

      {exito && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          {exito}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
        {[
          { key: 'activa', label: 'Caja Activa', icon: LockOpenIcon },
          { key: 'historial', label: 'Historial', icon: CalendarDaysIcon },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${tab === key ? 'bg-[#df000a] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Caja Activa */}
      {tab === 'activa' && (
        loading ? (
          <div className="text-center py-20 text-gray-400">
            <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-3" />
            Cargando caja...
          </div>
        ) : cajaActual && cajaActual.estado === 'abierta' ? (
          <CajaActiva
            caja={cajaActual}
            ventas={ventas}
            movimientos={movimientos}
            empleados={empleados}
            clientes={clientes}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
              queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
            }}
            setModal={setModal}
            onNotif={ok}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="p-5 bg-gray-100 rounded-full mb-4">
              <LockClosedIcon className="h-14 w-14 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-1">No hay caja abierta</h2>
            <p className="text-gray-400 text-sm mb-6">Abre una caja para comenzar a registrar ventas.</p>
            <button onClick={() => setModal('apertura')}
              className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold flex items-center gap-2 shadow-md">
              <LockOpenIcon className="h-5 w-5" />
              Abrir Caja
            </button>
          </div>
        )
      )}

      {/* Tab: Historial */}
      {tab === 'historial' && <Historial empleados={empleados} onNotif={ok} />}

      {/* Modales */}
      {modal === 'apertura' && (
        <ModalApertura
          empleados={empleados}
          onGuardado={(data) => {
            setModal(null);
            ok(`Caja ${data.folio} abierta exitosamente.`);
            queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
            queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'arqueo' && cajaActual && (
        <ModalArqueo
          caja={cajaActual}
          empleados={empleados}
          onGuardado={(data) => {
            setModal(null);
            ok(`Arqueo registrado exitosamente. Total contado: ${fmt(data.total)}`);
            queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
            queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'cierre' && cajaActual && (
        <ModalCierre
          caja={cajaActual}
          empleados={empleados}
          onGuardado={(data) => {
            setModal(null);
            ok(`Caja ${data.folio} cerrada. Diferencia: ${fmt(data.diferencia ?? 0)}`);
            queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
            queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'movimiento' && cajaActual && (
        <ModalMovimiento
          cajaId={cajaActual.id}
          empleados={empleados}
          onGuardado={() => {
            setModal(null);
            ok('Movimiento registrado.');
            queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] });
            queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] });
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
