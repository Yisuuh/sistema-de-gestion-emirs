import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../../lib/confirm';
import {
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ── API helpers ───────────────────────────────────────────────────────────────
const API = '/api/nomina';
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

// ── Formateo ──────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const toNum = (v) => parseFloat(v) || 0;

// ── Cálculo de una línea ──────────────────────────────────────────────────────
const calcLinea = (l) => {
  const total_percepciones = toNum(l.sueldo) + toNum(l.comision) + toNum(l.bonos) + toNum(l.domingo);
  const neto = total_percepciones - toNum(l.descuentos);
  const diff = toNum(l.efectivo) + toNum(l.transferencia) - neto;
  return { ...l, total_percepciones, neto, diff };
};

// ── Badge ─────────────────────────────────────────────────────────────────────
const ESTADO_COLORS = {
  borrador: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  cerrada: 'bg-red-100 text-[#a80008] border-red-200',
  pagada: 'bg-green-100 text-green-800 border-green-300',
};
function Badge({ text, color = 'gray' }) {
  const map = {
    green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800', blue: 'bg-red-100 text-[#a80008]',
    gray: 'bg-gray-100 text-gray-600', purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[color] ?? map.gray}`}>{text}</span>;
}
function EstadoBadge({ estado }) {
  const labels = { borrador: 'Borrador', cerrada: 'Cerrada', pagada: 'Pagada' };
  const colors = { borrador: 'yellow', cerrada: 'blue', pagada: 'green' };
  return <Badge text={labels[estado] ?? estado} color={colors[estado] ?? 'gray'} />;
}

// ── Input de celda numérica ───────────────────────────────────────────────────
function CeldaNum({ value, onChange, disabled, tabIndex, onKeyDown, inputRef, highlight }) {
  const [localVal, setLocalVal] = useState(value ?? '');
  useEffect(() => { setLocalVal(value ?? ''); }, [value]);
  return (
    <input
      ref={inputRef}
      type="number"
      tabIndex={tabIndex}
      disabled={disabled}
      value={localVal}
      min="0"
      step="0.01"
      onKeyDown={onKeyDown}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : Math.max(0, v));
      }}
      className={`w-full text-right bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-sm tabular-nums
        ${disabled ? 'text-gray-400 cursor-default' : 'hover:bg-red-50'}
        ${highlight ? 'text-red-600 font-semibold' : ''}`}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers de estilo y formulario ───────────────────────────────────────────
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]';
const selectCls = inputCls + ' bg-white';

function Fld({ label, req, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {req && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// Formulario vacio de empleado
const EMP_VACIO = {
  nombre: '', apellido: '', telefono: '', puesto: '',
  activo: true, fecha_ingreso: '',
  salario_base: '0', tipo_pago: 'semanal', metodo_pago: 'efectivo',
  comision_porcentaje: '0', pago_dominical: '0',
  curp: '', rfc: '', nss: '', banco: '', cuenta_bancaria: '', notas: '',
};
export default function Nomina() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [vista, setVista] = useState('periodos'); // 'periodos' | 'captura' | 'empleados'
  const [exito, setExito] = useState(null);
  const [error, setError] = useState(null);
  const showExito = (msg) => { setExito(msg); setTimeout(() => setExito(null), 3500); };

  // ── Estado periodos ───────────────────────────────────────────────────────
  const [modalPeriodo, setModalPeriodo] = useState(false);
  const [periodoForm, setPeriodoForm] = useState({ fecha_inicio: '', fecha_fin: '', observaciones: '' });

  // ── Estado captura ────────────────────────────────────────────────────────
  const [periodoActivo, setPeriodoActivo] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [loadingCaptura, setLoadingCaptura] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambioPendiente, setCambioPendiente] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type, onConfirm }
  const [autoCalcLoading, setAutoCalcLoading] = useState(false);

  // ── Estado empleados ──────────────────────────────────────────────────────
  const [modalEmp, setModalEmp] = useState(false);
  const [empEditando, setEmpEditando] = useState(null);
  const [empForm, setEmpForm] = useState(EMP_VACIO);
  const [busqEmp, setBusqEmp] = useState('');

  // Default week dates
  useEffect(() => {
    const hoy = new Date();
    const dia = hoy.getDay(); // 0=dom
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    const toISO = (d) => d.toISOString().slice(0, 10);
    setPeriodoForm((p) => ({ ...p, fecha_inicio: toISO(lunes), fecha_fin: toISO(domingo) }));
  }, []);

  // ── Periodos API ──────────────────────────────────────────────────────────
  const { data: periodos = [], isLoading: loadingPeriodos } = useQuery({
    queryKey: ['nomina-periodos'],
    queryFn: async () => {
      const data = await $fetch(`${API}/periodos/`);
      return Array.isArray(data) ? data : data.results ?? [];
    },
  });

  const { data: empleados = [], isLoading: loadingEmp } = useQuery({
    queryKey: ['nomina-empleados'],
    queryFn: async () => {
      const data = await $fetch(`${API}/empleados/`);
      return Array.isArray(data) ? data : data.results ?? [];
    },
  });

  const crearPeriodoMut = useMutation({
    mutationFn: async () =>
      $fetch(`${API}/periodos/`, { method: 'POST', body: JSON.stringify(periodoForm) }),
    onSuccess: (nuevo) => {
      queryClient.invalidateQueries({ queryKey: ['nomina-periodos'] });
      setModalPeriodo(false);
      showExito('Período creado con empleados activos pre-cargados');
      abrirCaptura(nuevo);
    },
    onError: (e) => setError(e.message),
  });

  const eliminarPeriodoMut = useMutation({
    mutationFn: async (id) => {
      await $fetch(`${API}/periodos/${id}/`, { method: 'DELETE' });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomina-periodos'] });
      showExito('Período eliminado');
    },
    onError: (e) => setError(e.message),
  });

  // ── Captura ───────────────────────────────────────────────────────────────
  const crearPeriodo = (e) => {
    e.preventDefault();
    setError(null);
    crearPeriodoMut.mutate();
  };

  const eliminarPeriodo = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar período?',
      message: 'Se borrarán todas las líneas de nómina asociadas. Esta acción es irreversible.',
      variant: 'danger',
    });
    if (!ok) return;
    eliminarPeriodoMut.mutate(id);
  };

  const abrirCaptura = async (periodo) => {
    setLoadingCaptura(true);
    setVista('captura');
    setCambioPendiente(false);
    try {
      const det = await $fetch(`${API}/periodos/${periodo.id}/`);
      setPeriodoActivo(det);
      setLineas((det.lineas ?? []).map(calcLinea));
    } catch (e) { setError(e.message); setVista('periodos'); }
    finally { setLoadingCaptura(false); }
  };

  const updateLinea = useCallback((idx, campo, valor) => {
    setLineas((prev) => {
      const updated = [...prev];
      updated[idx] = calcLinea({ ...updated[idx], [campo]: valor });
      return updated;
    });
    setCambioPendiente(true);
  }, []);

  const guardarLineas = async () => {
    setGuardando(true);
    setError(null);
    try {
      const payload = { lineas: lineas.map(({ diff, total_percepciones, neto, ...l }) => ({ ...l, total_percepciones, neto })) };
      const det = await $fetch(`${API}/periodos/${periodoActivo.id}/guardar_lineas/`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      setPeriodoActivo(det);
      setLineas((det.lineas ?? []).map(calcLinea));
      setCambioPendiente(false);
      showExito('Nómina guardada correctamente');
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const cerrarPeriodo = async () => {
    setError(null);
    try {
      if (cambioPendiente) await guardarLineas();
      const updated = await $fetch(`${API}/periodos/${periodoActivo.id}/cerrar/`, { method: 'POST' });
      setPeriodoActivo(updated);
      queryClient.invalidateQueries({ queryKey: ['nomina-periodos'] });
      showExito('Período cerrado exitosamente');
    } catch (e) { setError(e.message); }
    finally { setConfirmAction(null); }
  };

  const marcarPagada = async () => {
    setError(null);
    try {
      const updated = await $fetch(`${API}/periodos/${periodoActivo.id}/marcar_pagada/`, { method: 'POST' });
      setPeriodoActivo(updated);
      queryClient.invalidateQueries({ queryKey: ['nomina-periodos'] });
      showExito('Período marcado como pagado');
    } catch (e) { setError(e.message); }
    finally { setConfirmAction(null); }
  };

  const reabrirPeriodo = async () => {
    setError(null);
    try {
      const updated = await $fetch(`${API}/periodos/${periodoActivo.id}/reabrir/`, { method: 'POST' });
      setPeriodoActivo(updated);
      queryClient.invalidateQueries({ queryKey: ['nomina-periodos'] });
      showExito('Período reabierto');
    } catch (e) { setError(e.message); }
    finally { setConfirmAction(null); }
  };

  // ── Auto-calcular comisiones ─────────────────────────────────────
  const autoCalcularComisiones = async () => {
    if (!periodoActivo || !editable) return;
    setAutoCalcLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fecha_inicio: periodoActivo.fecha_inicio,
        fecha_fin: periodoActivo.fecha_fin,
      });
      const data = await $fetch(`/api/reportes/comisiones/?${params}`);
      const comisiones = Array.isArray(data) ? data : data.results ?? [];
      let actualizadas = 0;
      setLineas((prev) => {
        const updated = prev.map((linea) => {
          const match = comisiones.find(
            (c) => c.empleado_id === linea.empleado || c.empleado_id === linea.empleado_id
          );
          if (match) {
            actualizadas++;
            return calcLinea({ ...linea, comision: parseFloat(match.comision_calculada ?? match.total ?? 0) });
          }
          return linea;
        });
        return updated;
      });
      if (actualizadas > 0) {
        setCambioPendiente(true);
        showExito(`Comisiones actualizadas para ${actualizadas} empleado(s)`);
      } else {
        showExito('No se encontraron comisiones en el período');
      }
    } catch (e) { setError('Error al calcular comisiones: ' + e.message); }
    finally { setAutoCalcLoading(false); }
  };

  // ── Empleados API ─────────────────────────────────────────────────────────
  const guardarEmpMut = useMutation({
    mutationFn: async (form) => {
      const url = empEditando ? `${API}/empleados/${empEditando}/` : `${API}/empleados/`;
      const method = empEditando ? 'PUT' : 'POST';
      return $fetch(url, { method, body: JSON.stringify(form) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomina-empleados'] });
      setModalEmp(false);
      showExito(empEditando ? 'Empleado actualizado' : 'Empleado registrado');
    },
    onError: (e) => setError('Error al guardar: ' + e.message),
  });

  const eliminarEmpMut = useMutation({
    mutationFn: async (id) => {
      await $fetch(`${API}/empleados/${id}/`, { method: 'DELETE' });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomina-empleados'] });
      showExito('Empleado eliminado');
    },
    onError: (e) => setError(e.message),
  });

  const guardarEmp = (ev) => {
    ev.preventDefault();
    setError(null);
    guardarEmpMut.mutate(empForm);
  };

  const eliminarEmp = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar empleado?',
      message: 'El empleado se removerá del sistema. No afecta a nóminas ya registradas.',
      variant: 'danger',
    });
    if (!ok) return;
    eliminarEmpMut.mutate(id);
  };

  const editarEmp = (e) => {
    setEmpEditando(e.id);
    setEmpForm({
      nombre: e.nombre, apellido: e.apellido, telefono: e.telefono ?? '',
      puesto: e.puesto ?? '', activo: e.activo,
      fecha_ingreso: e.fecha_ingreso ?? '',
      salario_base: e.salario_base ?? '0',
      tipo_pago: e.tipo_pago ?? 'semanal',
      metodo_pago: e.metodo_pago ?? 'efectivo',
      comision_porcentaje: e.comision_porcentaje ?? '0',
      pago_dominical: e.pago_dominical ?? '0',
      curp: e.curp ?? '', rfc: e.rfc ?? '', nss: e.nss ?? '',
      banco: e.banco ?? '', cuenta_bancaria: e.cuenta_bancaria ?? '',
      notas: e.notas ?? '',
    });
    setModalEmp(true);
  };

  const abrirNuevoEmp = () => {
    setEmpEditando(null);
    setEmpForm(EMP_VACIO);
    setModalEmp(true);
  };

  // ── Totales de la captura ─────────────────────────────────────────────────
  const totales = lineas.reduce(
    (acc, l) => ({
      sueldo: acc.sueldo + toNum(l.sueldo),
      comision: acc.comision + toNum(l.comision),
      bonos: acc.bonos + toNum(l.bonos),
      domingo: acc.domingo + toNum(l.domingo),
      descuentos: acc.descuentos + toNum(l.descuentos),
      efectivo: acc.efectivo + toNum(l.efectivo),
      transferencia: acc.transferencia + toNum(l.transferencia),
      neto: acc.neto + toNum(l.neto),
    }),
    { sueldo: 0, comision: 0, bonos: 0, domingo: 0, descuentos: 0, efectivo: 0, transferencia: 0, neto: 0 }
  );
  const hayDiferencias = lineas.some((l) => Math.abs(l.diff ?? 0) > 0.01);
  const editable = periodoActivo?.estado === 'borrador';

  // ── Navegación con teclado en la tabla ───────────────────────────────────
  const EDIT_COLS = ['sueldo', 'comision', 'bonos', 'domingo', 'descuentos', 'efectivo', 'transferencia'];
  const handleKeyDown = useCallback((e, rowIdx, colIdx) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      let nRow = rowIdx, nCol = colIdx + 1;
      if (nCol >= EDIT_COLS.length) { nCol = 0; nRow = rowIdx + 1; }
      if (nRow < lineas.length) {
        document.getElementById(`cell-${nRow}-${nCol}`)?.focus();
      }
    }
  }, [lineas.length]);

  // ═══ RENDER ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Alertas ── */}
      {(exito || error) && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {exito && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl shadow-lg text-sm">
              <CheckCircleIcon className="w-5 h-5 flex-shrink-0" /> {exito}
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-red-600 text-white rounded-xl shadow-lg text-sm">
              <span className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" /> {error}
              </span>
              <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Modal confirmación ── */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">{confirmAction.title}</h3>
            <p className="text-sm text-gray-500 mb-6">{confirmAction.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmAction.onConfirm}
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white ${confirmAction.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#df000a] hover:bg-[#c4000a]'}`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs de navegación principal ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center gap-1 h-14">
          {vista === 'captura' && (
            <button
              onClick={async () => {
                if (cambioPendiente) {
                  const ok = await confirm({
                    title: 'Cambios sin guardar',
                    message: 'Tienes cambios pendientes en la nómina. ¿Salir de todas formas?',
                    variant: 'leave',
                    confirmLabel: 'Salir',
                  });
                  if (!ok) return;
                }
                setVista('periodos');
              }}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-900 mr-3 text-sm"
            >
              <ChevronLeftIcon className="w-4 h-4" /> Períodos
            </button>
          )}
          {['periodos', 'empleados'].map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                vista === v ? 'border-[#df000a] text-[#df000a]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'periodos' ? <><CalendarDaysIcon className="w-4 h-4" /> Períodos</> : <><UserGroupIcon className="w-4 h-4" /> Empleados</>}
            </button>
          ))}
          {vista === 'captura' && periodoActivo && (
            <div className="ml-4 flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">
                {fmtDate(periodoActivo.fecha_inicio)} – {fmtDate(periodoActivo.fecha_fin)}
              </span>
              <EstadoBadge estado={periodoActivo.estado} />
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">

        {/* ═══════════ VISTA: PERIODOS ═══════════ */}
        {vista === 'periodos' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nómina Semanal</h1>
                <p className="text-sm text-gray-500 mt-1">Gestión de períodos de pago</p>
              </div>
              <button
                onClick={() => setModalPeriodo(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] transition-colors shadow-sm"
              >
                <PlusIcon className="w-4 h-4" /> Nueva Semana
              </button>
            </div>

            {loadingPeriodos ? (
              <p className="text-center py-16 text-gray-400">Cargando períodos…</p>
            ) : periodos.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <CalendarDaysIcon className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No hay períodos registrados</p>
                <p className="text-sm mt-1">Crea tu primera semana de nómina</p>
              </div>
            ) : (
              <div className="space-y-3">
                {periodos.map((p) => (
                  <div key={p.id}
                    className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => abrirCaptura(p)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-3 h-10 rounded-full flex-shrink-0 ${p.estado === 'pagada' ? 'bg-green-500' : p.estado === 'cerrada' ? 'bg-[#df000a]' : 'bg-yellow-400'}`} />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {fmtDate(p.fecha_inicio)} – {fmtDate(p.fecha_fin)}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <EstadoBadge estado={p.estado} />
                          <span className="text-xs text-gray-400">{p.lineas_count} empleados</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-400">Efectivo</p>
                        <p className="text-sm font-semibold text-gray-800">${fmt(p.total_efectivo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Transferencia</p>
                        <p className="text-sm font-semibold text-gray-800">${fmt(p.total_transferencia)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Total</p>
                        <p className="text-base font-bold text-[#df000a]">${fmt(p.total_general)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 md:ml-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => abrirCaptura(p)}
                        className="px-3 py-1.5 bg-red-50 text-[#df000a] rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        Abrir
                      </button>
                      {p.estado === 'borrador' && (
                        <button
                          onClick={() => eliminarPeriodo(p.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ VISTA: CAPTURA ═══════════ */}
        {vista === 'captura' && (
          <div>
            {loadingCaptura ? (
              <p className="text-center py-20 text-gray-400">Cargando nómina…</p>
            ) : (
              <>
                {/* Barra de acciones */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  {editable && (
                    <button
                      onClick={guardarLineas}
                      disabled={guardando || !cambioPendiente}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm ${
                        cambioPendiente
                          ? 'bg-[#df000a] text-white hover:bg-[#c4000a]'
                          : 'bg-gray-100 text-gray-400 cursor-default'
                      }`}
                    >
                      {guardando ? 'Guardando…' : cambioPendiente ? '● Guardar cambios' : '✓ Sin cambios'}
                    </button>
                  )}
                  {editable && (
                    <button
                      onClick={autoCalcularComisiones}
                      disabled={autoCalcLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 shadow-sm disabled:opacity-50"
                      title="Calcular comisiones desde ventas del período"
                    >
                      {autoCalcLoading
                        ? <><BanknotesIcon className="w-4 h-4 animate-pulse" /> Calculando…</>
                        : <><BanknotesIcon className="w-4 h-4" /> Auto-comisiones</>}
                    </button>
                  )}
                  {editable && !hayDiferencias && lineas.length > 0 && (
                    <button
                      onClick={() => setConfirmAction({
                        title: 'Cerrar período',
                        message: 'Se validarán todas las diferencias de pago. ¿Continuar?',
                        onConfirm: cerrarPeriodo,
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] shadow-sm"
                    >
                      <LockClosedIcon className="w-4 h-4" /> Cerrar período
                    </button>
                  )}
                  {periodoActivo?.estado === 'cerrada' && (
                    <>
                      <button
                        onClick={() => setConfirmAction({
                          title: 'Marcar como pagada',
                          message: 'Esta acción confirma que todos los pagos fueron realizados.',
                          onConfirm: marcarPagada,
                        })}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 shadow-sm"
                      >
                        <CheckCircleIcon className="w-4 h-4" /> Marcar como pagada
                      </button>
                      <button
                        onClick={() => setConfirmAction({
                          title: 'Reabrir período',
                          message: 'El período regresará a estado borrador para edición.',
                          onConfirm: reabrirPeriodo,
                        })}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                      >
                        Reabrir
                      </button>
                    </>
                  )}
                  {hayDiferencias && editable && (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      Hay filas con diferencia en pagos
                    </span>
                  )}
                  {periodoActivo?.observaciones && (
                    <span className="text-xs text-gray-500 italic ml-2">{periodoActivo.observaciones}</span>
                  )}
                </div>

                {/* Tarjetas resumen */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                  {[
                    { label: 'Sueldos', val: totales.sueldo, color: 'text-gray-900' },
                    { label: 'Comisiones', val: totales.comision, color: 'text-purple-700' },
                    { label: 'Domingos', val: totales.domingo, color: 'text-orange-700' },
                    { label: 'Total Efectivo', val: totales.efectivo, color: 'text-[#df000a]', bold: true },
                    { label: 'Total Transferencia', val: totales.transferencia, color: 'text-indigo-700', bold: true },
                  ].map(({ label, val, color, bold }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <p className={`font-${bold ? 'bold' : 'semibold'} text-sm ${color}`}>${fmt(val)}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#df000a] text-white rounded-xl px-5 py-3 mb-5 flex items-center justify-between">
                  <span className="font-medium">Total general de nómina</span>
                  <span className="text-2xl font-bold">${fmt(totales.neto)}</span>
                </div>

                {/* Tabla Excel */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-800 text-gray-100 text-xs uppercase">
                          <th className="px-3 py-3 text-left font-medium w-44 sticky left-0 bg-gray-800 z-10">Empleado</th>
                          <th className="px-3 py-3 text-right font-medium w-28">Sueldo</th>
                          <th className="px-3 py-3 text-right font-medium w-28">Comisión</th>
                          <th className="px-3 py-3 text-right font-medium w-24">Bonos</th>
                          <th className="px-3 py-3 text-right font-medium w-24">Domingo</th>
                          <th className="px-3 py-3 text-right font-medium w-24">Desc.</th>
                          <th className="px-3 py-3 text-right font-medium w-28 bg-green-900">Efectivo</th>
                          <th className="px-3 py-3 text-right font-medium w-28 bg-green-900">Transf.</th>
                          <th className="px-3 py-3 text-right font-medium w-32 bg-[#8c0007]">Percepciones</th>
                          <th className="px-3 py-3 text-right font-medium w-28 bg-[#8c0007]">Neto</th>
                          <th className="px-3 py-3 text-center font-medium w-20 bg-gray-700">Diff.</th>
                          <th className="px-3 py-3 text-left font-medium w-36">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineas.map((linea, ri) => {
                          const hasDiff = Math.abs(linea.diff ?? 0) > 0.01;
                          return (
                            <tr key={linea.id ?? ri}
                              className={`border-b border-gray-100 ${hasDiff && editable ? 'bg-red-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-red-50 transition-colors`}
                            >
                              {/* Nombre — sticky */}
                              <td className={`px-3 py-1 sticky left-0 z-10 ${hasDiff && editable ? 'bg-red-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-red-50`}>
                                <p className="font-medium text-gray-900 truncate max-w-[160px]">{linea.empleado_nombre}</p>
                                <p className="text-xs text-gray-400 truncate">{linea.empleado_puesto}</p>
                              </td>
                              {/* Celdas editables: sueldo, comision, bonos, domingo, descuentos, efectivo, transferencia */}
                              {EDIT_COLS.map((col, ci) => (
                                <td key={col} className={`px-1 py-0.5 ${col === 'efectivo' || col === 'transferencia' ? 'bg-green-50' : ''}`}>
                                  <CeldaNum
                                    value={linea[col]}
                                    disabled={!editable}
                                    tabIndex={editable ? ri * EDIT_COLS.length + ci + 1 : -1}
                                    onKeyDown={(e) => handleKeyDown(e, ri, ci)}
                                    inputRef={(el) => { if (el) el.id = `cell-${ri}-${ci}`; }}
                                    onChange={(v) => updateLinea(ri, col, v)}
                                    highlight={hasDiff && (col === 'efectivo' || col === 'transferencia')}
                                  />
                                </td>
                              ))}
                              {/* Totales calculados */}
                              <td className="px-3 py-1 text-right bg-red-50 font-medium text-[#8c0007] tabular-nums">
                                ${fmt(linea.total_percepciones)}
                              </td>
                              <td className="px-3 py-1 text-right bg-red-50 font-bold text-[#df000a] tabular-nums">
                                ${fmt(linea.neto)}
                              </td>
                              {/* Diferencia */}
                              <td className="px-2 py-1 text-center">
                                {Math.abs(linea.diff ?? 0) < 0.01 ? (
                                  <span className="text-green-500 text-xs">✓</span>
                                ) : (
                                  <span className="text-red-600 text-xs font-semibold" title="Diferencia">
                                    ${fmt(Math.abs(linea.diff))}
                                  </span>
                                )}
                              </td>
                              {/* Observaciones */}
                              <td className="px-1 py-0.5">
                                <input
                                  type="text"
                                  disabled={!editable}
                                  value={linea.observaciones ?? ''}
                                  onChange={(e) => updateLinea(ri, 'observaciones', e.target.value)}
                                  placeholder="—"
                                  className="w-full text-xs bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#df000a] rounded px-1 py-0.5 text-gray-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {lineas.length === 0 && (
                          <tr>
                            <td colSpan={12} className="px-4 py-10 text-center text-gray-400 text-sm">
                              No hay empleados en este período. Agrega empleados activos primero.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {/* Footer de totales */}
                      {lineas.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-900 text-white text-xs font-bold">
                            <td className="px-3 py-3 sticky left-0 bg-gray-900 z-10">TOTALES</td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmt(totales.sueldo)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmt(totales.comision)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmt(totales.bonos)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">${fmt(totales.domingo)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-300">${fmt(totales.descuentos)}</td>
                            <td className="px-3 py-2 text-right tabular-nums bg-green-900 text-green-200">${fmt(totales.efectivo)}</td>
                            <td className="px-3 py-2 text-right tabular-nums bg-green-900 text-green-200">${fmt(totales.transferencia)}</td>
                            <td className="px-3 py-2 text-right tabular-nums bg-[#8c0007]"></td>
                            <td className="px-3 py-2 text-right tabular-nums bg-[#8c0007] text-red-200">${fmt(totales.neto)}</td>
                            <td className="px-2 py-2 text-center bg-gray-800">
                              {hayDiferencias
                                ? <span className="text-red-400">⚠</span>
                                : <span className="text-green-400">✓</span>}
                            </td>
                            <td className="px-3 py-2"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Nota teclado */}
                {editable && lineas.length > 0 && (
                  <p className="text-xs text-gray-400 mt-3 text-right">
                    Usa <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Tab</kbd> o <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> para navegar entre celdas
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════ VISTA: EMPLEADOS ═══════════ */}
        {vista === 'empleados' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
                <p className="text-sm text-gray-500 mt-1">Gestión del personal activo e inactivo</p>
              </div>
              <button
                onClick={abrirNuevoEmp}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] shadow-sm"
              >
                <PlusIcon className="w-4 h-4" /> Nuevo Empleado
              </button>
            </div>

            <div className="relative mb-4 max-w-sm">
              <input
                type="text"
                placeholder="Buscar empleado…"
                value={busqEmp}
                onChange={(e) => setBusqEmp(e.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-4 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]"
              />
            </div>

            {loadingEmp ? (
              <p className="text-center py-10 text-gray-400">Cargando empleados…</p>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Empleado</th>
                      <th className="px-4 py-3 text-left">Puesto</th>
                      <th className="px-4 py-3 text-right">Sueldo base</th>
                      <th className="px-4 py-3 text-center">Método pago</th>
                      <th className="px-4 py-3 text-right">Comisión %</th>
                      <th className="px-4 py-3 text-right">Pago domingo</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {empleados.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Sin empleados registrados</td></tr>
                    ) : empleados.map((e) => (
                      <tr key={e.id} className={`hover:bg-gray-50 transition-colors ${!e.activo ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-100 text-[#df000a] flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {e.nombre?.[0]}{e.apellido?.[0]}
                            </div>
                            <p className="font-medium text-gray-900">{e.nombre_completo}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{e.puesto || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">${fmt(e.salario_base)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            text={e.metodo_pago}
                            color={e.metodo_pago === 'efectivo' ? 'green' : e.metodo_pago === 'transferencia' ? 'blue' : 'purple'}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{e.comision_porcentaje}%</td>
                        <td className="px-4 py-3 text-right text-gray-600">${fmt(e.pago_dominical)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge text={e.activo ? 'Activo' : 'Inactivo'} color={e.activo ? 'green' : 'gray'} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => editarEmp(e)}
                              className="p-1.5 text-gray-400 hover:text-[#df000a] hover:bg-red-50 rounded transition-colors">
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => eliminarEmp(e.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
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
        )}
      </div>

      {/* ═══════════ MODAL: NUEVO PERÍODO ═══════════ */}
      {modalPeriodo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-[#df000a]" /> Nueva Semana de Nómina
              </h2>
              <button onClick={() => setModalPeriodo(false)}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={crearPeriodo} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio <span className="text-red-500">*</span></label>
                  <input type="date" required className={inputCls} value={periodoForm.fecha_inicio}
                    onChange={(e) => setPeriodoForm({ ...periodoForm, fecha_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha fin <span className="text-red-500">*</span></label>
                  <input type="date" required className={inputCls} value={periodoForm.fecha_fin}
                    onChange={(e) => setPeriodoForm({ ...periodoForm, fecha_fin: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <textarea rows={2} className={inputCls} value={periodoForm.observaciones}
                  onChange={(e) => setPeriodoForm({ ...periodoForm, observaciones: e.target.value })} />
              </div>
              <p className="text-xs text-gray-400">Se agregarán automáticamente todos los empleados activos con su sueldo base.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalPeriodo(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={crearPeriodoMut.isPending}
                  className="flex-1 py-2.5 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] disabled:opacity-50">
                  {crearPeriodoMut.isPending ? 'Creando…' : 'Crear período'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: EMPLEADO ═══════════ */}
      {modalEmp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">{empEditando ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
              <button onClick={() => setModalEmp(false)}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={guardarEmp} className="p-5 space-y-5">
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos personales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Fld label="Nombre" req><input required className={inputCls} value={empForm.nombre} onChange={(e) => setEmpForm({ ...empForm, nombre: e.target.value })} /></Fld>
                  <Fld label="Apellido" req><input required className={inputCls} value={empForm.apellido} onChange={(e) => setEmpForm({ ...empForm, apellido: e.target.value })} /></Fld>
                  <Fld label="Teléfono"><input className={inputCls} value={empForm.telefono} onChange={(e) => setEmpForm({ ...empForm, telefono: e.target.value })} /></Fld>
                  <Fld label="Puesto"><input className={inputCls} value={empForm.puesto} onChange={(e) => setEmpForm({ ...empForm, puesto: e.target.value })} /></Fld>
                </div>
              </section>
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Configuración de pago</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Fld label="Sueldo base (MXN)"><input type="number" min="0" step="0.01" className={inputCls} value={empForm.salario_base} onChange={(e) => setEmpForm({ ...empForm, salario_base: e.target.value })} /></Fld>
                  <Fld label="Método de pago">
                    <select className={selectCls} value={empForm.metodo_pago} onChange={(e) => setEmpForm({ ...empForm, metodo_pago: e.target.value })}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="mixto">Mixto</option>
                    </select>
                  </Fld>
                  <Fld label="Comisión (%)"><input type="number" min="0" max="100" step="0.01" className={inputCls} value={empForm.comision_porcentaje} onChange={(e) => setEmpForm({ ...empForm, comision_porcentaje: e.target.value })} /></Fld>
                  <Fld label="Pago dominical fijo (MXN)"><input type="number" min="0" step="0.01" className={inputCls} value={empForm.pago_dominical} onChange={(e) => setEmpForm({ ...empForm, pago_dominical: e.target.value })} /></Fld>
                  <Fld label="Fecha de ingreso"><input type="date" className={inputCls} value={empForm.fecha_ingreso} onChange={(e) => setEmpForm({ ...empForm, fecha_ingreso: e.target.value })} /></Fld>
                  <Fld label="Estado">
                    <select className={selectCls} value={empForm.activo ? 'true' : 'false'} onChange={(e) => setEmpForm({ ...empForm, activo: e.target.value === 'true' })}>
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </Fld>
                </div>
              </section>
              <details className="border border-gray-200 rounded-xl">
                <summary className="px-4 py-3 text-sm font-medium text-gray-600 cursor-pointer select-none">Datos fiscales y bancarios (opcional)</summary>
                <div className="p-4 grid grid-cols-2 gap-4 border-t">
                  <Fld label="CURP"><input className={inputCls} maxLength={18} value={empForm.curp} onChange={(e) => setEmpForm({ ...empForm, curp: e.target.value.toUpperCase() })} /></Fld>
                  <Fld label="RFC"><input className={inputCls} maxLength={13} value={empForm.rfc} onChange={(e) => setEmpForm({ ...empForm, rfc: e.target.value.toUpperCase() })} /></Fld>
                  <Fld label="NSS"><input className={inputCls} maxLength={11} value={empForm.nss} onChange={(e) => setEmpForm({ ...empForm, nss: e.target.value })} /></Fld>
                  <Fld label="Banco"><input className={inputCls} value={empForm.banco} onChange={(e) => setEmpForm({ ...empForm, banco: e.target.value })} /></Fld>
                  <Fld label="Cuenta bancaria"><input className={inputCls} maxLength={25} value={empForm.cuenta_bancaria} onChange={(e) => setEmpForm({ ...empForm, cuenta_bancaria: e.target.value })} /></Fld>
                  <Fld label="Notas"><textarea rows={2} className={inputCls} value={empForm.notas} onChange={(e) => setEmpForm({ ...empForm, notas: e.target.value })} /></Fld>
                </div>
              </details>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalEmp(false)} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={guardarEmpMut.isPending} className="flex-1 py-2.5 bg-[#df000a] text-white rounded-xl text-sm font-medium hover:bg-[#c4000a] disabled:opacity-50">
                  {guardarEmpMut.isPending ? 'Guardando…' : empEditando ? 'Actualizar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
