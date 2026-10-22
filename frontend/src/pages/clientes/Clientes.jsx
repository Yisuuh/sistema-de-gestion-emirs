import { useState, useMemo } from 'react';
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
import { extraerDigitosMedida, detectarMedidaFormateada } from '../../lib/medidaUtils';

const API = '/api/clientes';
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Formularios vacíos ────────────────────────────────────────────────────
const CLIENTE_VACIO = {
  nombre: '',
  telefono: '',
  email: '',
  rfc: '',
  direccion: '',
  notas: '',
};

const VEHICULO_VACIO = {
  marca: '',
  modelo: '',
  año: new Date().getFullYear(),
  placas: '',
  color: '',
  medida_llanta_delantera: '',
  medida_llanta_trasera: '',
  medida_llantas: '',
  kilometraje_ultimo: '',
  notas: '',
};

// ─── Badge Semáforo de Servicio ─────────────────────────────────────────────
function BadgeEstadoServicio({ estado, dias }) {
  if (estado === 'vencido') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
        <i className="ri-error-warning-fill text-red-400"></i>
        <span>Vencido{typeof dias === 'number' ? ` (${Math.abs(dias)}d)` : ''}</span>
      </span>
    );
  }
  if (estado === 'proximo') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
        <i className="ri-time-fill text-amber-400"></i>
        <span>Próximo servicio{typeof dias === 'number' ? ` (${dias}d)` : ''}</span>
      </span>
    );
  }
  if (estado === 'al_dia') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        <i className="ri-checkbox-circle-fill text-emerald-400"></i>
        <span>Al día</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
      <i className="ri-history-line text-slate-400"></i>
      <span>Sin fecha programada</span>
    </span>
  );
}

// ─── Placa Estilo Matrícula ─────────────────────────────────────────────────
function PlacaBadge({ placas }) {
  if (!placas) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-dashed border-slate-600 text-[11px] font-mono text-slate-400">
        S/PLACAS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-black text-xs tracking-widest uppercase shadow-2xs">
      <i className="ri-roadster-line text-red-400 text-[11px]"></i>
      {placas}
    </span>
  );
}

function sumarMesesFecha(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Modal Expediente Clínico del Vehículo ──────────────────────────────────
function ModalExpedienteVehiculo({ vehiculoId, onClose, onVehiculoActualizado }) {
  const queryClient = useQueryClient();
  const [filtroTimeline, setFiltroTimeline] = useState('todos'); // 'todos' | 'ventas' | 'rescates'
  const [mostrarProgramarFecha, setMostrarProgramarFecha] = useState(false);
  const [fechaProgInput, setFechaProgInput] = useState('');
  const [kmProgInput, setKmProgInput] = useState('');
  const [msgExitoProg, setMsgExitoProg] = useState(null);
  const [msgErrorProg, setMsgErrorProg] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expediente-vehiculo', vehiculoId],
    queryFn: async () => {
      const res = await fetch(`${API}/vehiculos/${vehiculoId}/expediente/`, { headers: headers() });
      if (!res.ok) throw new Error('No se pudo cargar el expediente clínico');
      return res.json();
    },
    enabled: !!vehiculoId,
  });

  const abrirPanelProgramarFecha = (veh) => {
    setMsgErrorProg(null);
    setFechaProgInput(veh?.fecha_proximo_servicio || sumarMesesFecha(6));
    setKmProgInput(veh?.kilometraje_ultimo ? String(veh.kilometraje_ultimo) : '');
    setMostrarProgramarFecha((prev) => !prev);
  };

  const programarFechaMut = useMutation({
    mutationFn: async () => {
      setMsgErrorProg(null);
      if (!fechaProgInput) {
        throw new Error('Selecciona una fecha para el próximo servicio.');
      }
      const payload = {
        fecha_proximo_servicio: fechaProgInput,
      };
      if (kmProgInput !== '' && !Number.isNaN(parseInt(kmProgInput, 10))) {
        payload.kilometraje_ultimo = parseInt(kmProgInput, 10);
      }
      const res = await fetch(`${API}/vehiculos/${vehiculoId}/`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('No se pudo guardar la fecha de próximo servicio.');
      }
      return res.json();
    },
    onSuccess: (updatedVeh) => {
      queryClient.invalidateQueries({ queryKey: ['expediente-vehiculo', vehiculoId] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['vehiculos-alertas-servicio'] });
      if (onVehiculoActualizado) onVehiculoActualizado(updatedVeh);
      setMostrarProgramarFecha(false);
      setMsgExitoProg('Fecha de próximo servicio programada correctamente.');
      setTimeout(() => setMsgExitoProg(null), 3500);
    },
    onError: (err) => setMsgErrorProg(err.message),
  });

  const eventosTimeline = useMemo(() => {
    if (!data) return [];
    const ventas = (data.historial_ventas || []).map((v) => ({
      tipo_evento: 'venta',
      id: `v-${v.id}`,
      folio: v.folio,
      fecha: v.fecha,
      fecha_corta: v.fecha_corta,
      responsable: v.empleado_nombre || 'Mostrador',
      metodo_pago: v.metodo_pago,
      kilometraje: v.kilometraje_actual,
      total: v.total,
      notas: v.notas,
      detalles: v.detalles || [],
      vinculado_directo: v.vinculado_directo,
    }));
    const rescates = (data.historial_rescates || []).map((r) => ({
      tipo_evento: 'rescate',
      id: `r-${r.id}`,
      folio: r.folio,
      fecha: r.fecha_solicitud,
      fecha_corta: r.fecha_corta,
      responsable: r.operador_nombre || 'Técnico Vial',
      unidad: r.unidad_nombre,
      ubicacion: r.ubicacion_texto,
      estado: r.estado,
      total: r.total,
      notas: r.notas,
      detalles: r.detalles || [],
    }));

    const combinados = [...ventas, ...rescates].sort((a, b) =>
      String(b.fecha).localeCompare(String(a.fecha))
    );

    if (filtroTimeline === 'ventas') return combinados.filter((e) => e.tipo_evento === 'venta');
    if (filtroTimeline === 'rescates') return combinados.filter((e) => e.tipo_evento === 'rescate');
    return combinados;
  }, [data, filtroTimeline]);

  if (!vehiculoId) return null;

  const v = data?.vehiculo;
  const c = data?.cliente;
  const res = data?.resumen;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#161a29] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-white/10">
        {/* Cabecera */}
        <div className="bg-[#0f172a] text-white px-5 py-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#df000a] text-white shadow-sm">
              <i className="ri-file-list-3-line text-xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Expediente Clínico Automotriz
                </h2>
                {v && <PlacaBadge placas={v.placas} />}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {v ? `${v.marca} ${v.modelo} ${v.año}${v.color ? ` • Color: ${v.color}` : ''}` : 'Cargando vehículo...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0f172a]">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Consultando historial clínico del vehículo...</span>
            </div>
          ) : isError || !v ? (
            <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
              <i className="ri-error-warning-line text-xl block mb-1"></i>
              Error al obtener el expediente clínico del vehículo.
            </div>
          ) : (
            <>
              {msgExitoProg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <i className="ri-checkbox-circle-line text-base"></i>
                  <span>{msgExitoProg}</span>
                </div>
              )}

              {/* Ficha Técnica y Semáforo */}
              <div className="bg-[#161a29] rounded-xl border border-white/10 p-4 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">Propietario Registrado</p>
                    <p className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
                      <i className="ri-user-3-line text-[#df000a]"></i>
                      <span>{c?.nombre}</span>
                      <span className="text-slate-500 font-normal">•</span>
                      <span className="text-slate-300 font-mono text-xs">{c?.telefono}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <BadgeEstadoServicio estado={v.estado_alerta} dias={v.dias_para_servicio} />
                    <button
                      type="button"
                      onClick={() => abrirPanelProgramarFecha(v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <i className="ri-calendar-event-line text-sm"></i>
                      <span>Programar Fecha</span>
                    </button>
                    {v.whatsapp_recordatorio_url && (
                      <a
                        href={v.whatsapp_recordatorio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors"
                      >
                        <i className="ri-whatsapp-line text-sm"></i>
                        <span>Recordatorio WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Panel Desplegable para Programar / Cambiar Fecha de Próximo Servicio */}
                {mostrarProgramarFecha && (
                  <div className="bg-[#1b2032] border border-amber-500/30 rounded-xl p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <i className="ri-calendar-event-line text-base"></i>
                        <span>Programar / Actualizar Fecha de Próximo Servicio</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFechaProgInput(sumarMesesFecha(3))}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[11px] font-bold cursor-pointer"
                        >
                          +3 Meses
                        </button>
                        <button
                          type="button"
                          onClick={() => setFechaProgInput(sumarMesesFecha(6))}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold cursor-pointer"
                        >
                          +6 Meses
                        </button>
                      </div>
                    </div>

                    {msgErrorProg && (
                      <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs">
                        {msgErrorProg}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                          Fecha de Próximo Servicio *
                        </label>
                        <input
                          type="date"
                          value={fechaProgInput}
                          onChange={(e) => setFechaProgInput(e.target.value)}
                          className="w-full border border-slate-600 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                          Último Kilometraje (Opcional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={kmProgInput}
                          onChange={(e) => setKmProgInput(e.target.value)}
                          placeholder="Ej. 75000"
                          className="w-full border border-slate-600 rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => programarFechaMut.mutate()}
                          disabled={programarFechaMut.isPending}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          {programarFechaMut.isPending ? 'Guardando...' : 'Guardar Fecha'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMostrarProgramarFecha(false)}
                          className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                  <div className="bg-[#1b2032] rounded-lg p-3 border border-white/[0.08]">
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Medida Delantera</span>
                    <span className="font-mono font-bold text-[#ff4040] text-sm mt-0.5 block">
                      {v.medida_llanta_delantera || v.medida_llantas || '—'}
                    </span>
                  </div>
                  <div className="bg-[#1b2032] rounded-lg p-3 border border-white/[0.08]">
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Medida Trasera</span>
                    <span className="font-mono font-bold text-white text-sm mt-0.5 block">
                      {v.medida_llanta_trasera || v.medida_llanta_delantera || v.medida_llantas || '—'}
                    </span>
                  </div>
                  <div className="bg-[#1b2032] rounded-lg p-3 border border-white/[0.08]">
                    <span className="text-slate-400 block font-semibold uppercase text-[10px]">Último Kilometraje</span>
                    <span className="font-mono font-bold text-white text-sm mt-0.5 block">
                      {v.kilometraje_ultimo ? `${Number(v.kilometraje_ultimo).toLocaleString('es-MX')} km` : 'Sin registro'}
                    </span>
                  </div>
                  <div className="bg-[#1b2032] rounded-lg p-3 border border-white/[0.08] flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-slate-400 block font-semibold uppercase text-[10px]">Próximo Servicio (6m)</span>
                      <button
                        type="button"
                        onClick={() => abrirPanelProgramarFecha(v)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer"
                        title="Programar o cambiar fecha de próximo servicio"
                      >
                        <i className="ri-calendar-event-line"></i>
                        <span>Programar Fecha</span>
                      </button>
                    </div>
                    <span className="font-mono font-bold text-amber-300 text-sm mt-0.5 block">
                      {v.fecha_proximo_servicio || 'Pendiente'}
                    </span>
                  </div>
                </div>

                {v.notas && (
                  <div className="mt-2 pt-2.5 border-t border-white/[0.08] text-xs text-slate-300 flex items-start gap-1.5">
                    <i className="ri-sticky-note-line text-amber-400 mt-0.5"></i>
                    <span><strong className="text-white">Notas técnicas:</strong> {v.notas}</span>
                  </div>
                )}
              </div>

              {/* KPIs del Expediente */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#161a29] border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Visitas a Taller (Mostrador)</p>
                    <p className="text-xl font-black text-white mt-0.5">{res?.total_visitas_taller ?? 0}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
                    <i className="ri-store-2-line text-xl"></i>
                  </div>
                </div>
                <div className="bg-[#161a29] border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Rescates Viales en Ruta</p>
                    <p className="text-xl font-black text-amber-400 mt-0.5">{res?.total_rescates_viales ?? 0}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <i className="ri-truck-line text-xl"></i>
                  </div>
                </div>
                <div className="bg-[#161a29] border border-white/10 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Inversión Acumulada</p>
                    <p className="text-xl font-black text-emerald-400 font-mono mt-0.5">${fmt(res?.inversion_total)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <i className="ri-money-dollar-circle-line text-xl"></i>
                  </div>
                </div>
              </div>

              {/* Controles de Línea de Tiempo */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <i className="ri-time-line text-[#df000a]"></i>
                  <span>Línea de Tiempo de Intervenciones ({eventosTimeline.length})</span>
                </h3>
                <div className="flex gap-1 bg-[#161a29] p-1 rounded-xl border border-white/10 text-xs">
                  {[
                    { id: 'todos', label: 'Todos' },
                    { id: 'ventas', label: 'Taller / POS' },
                    { id: 'rescates', label: 'Rescates Viales' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setFiltroTimeline(t.id)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filtroTimeline === t.id
                          ? 'bg-red-600 text-white font-bold shadow'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Línea de tiempo */}
              {eventosTimeline.length === 0 ? (
                <div className="bg-[#161a29] rounded-xl border border-white/10 p-8 text-center text-slate-400 text-sm">
                  <i className="ri-history-line text-3xl block mb-1 text-slate-500"></i>
                  No hay intervenciones registradas en esta categoría para este vehículo.
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-white/10 space-y-4">
                  {eventosTimeline.map((ev) => {
                    const esVenta = ev.tipo_evento === 'venta';
                    return (
                      <div key={ev.id} className="relative bg-[#161a29] rounded-xl border border-white/10 p-4 shadow-2xs">
                        {/* Nodo en línea de tiempo */}
                        <span
                          className={`absolute -left-[33px] top-4 w-4 h-4 rounded-full border-2 border-[#0f172a] shadow ${
                            esVenta ? 'bg-[#df000a]' : 'bg-amber-500'
                          }`}
                        />
                        <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                  esVenta
                                    ? 'bg-red-600/20 text-red-300 border border-red-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                <i className={esVenta ? 'ri-store-2-line' : 'ri-roadster-line'}></i>
                                {esVenta ? 'Servicio en Taller' : 'Auxilio Vial / Rescate'}
                              </span>
                              <span className="font-mono font-black text-xs text-white">{ev.folio}</span>
                              <span className="text-xs text-slate-400">{ev.fecha}</span>
                              {ev.kilometraje && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-mono text-[11px] font-bold">
                                  <i className="ri-dashboard-3-line text-amber-400"></i>
                                  {Number(ev.kilometraje).toLocaleString('es-MX')} km
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              Atendió: <strong className="text-slate-200">{ev.responsable}</strong>
                              {ev.ubicacion ? ` • Ubicación: ${ev.ubicacion}` : ''}
                              {ev.unidad ? ` • Unidad: ${ev.unidad}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-black text-sm text-emerald-400">${fmt(ev.total)}</p>
                            {ev.metodo_pago && (
                              <span className="text-[11px] text-slate-400 capitalize">{ev.metodo_pago}</span>
                            )}
                          </div>
                        </div>

                        {/* Detalles */}
                        {ev.detalles.length > 0 && (
                          <div className="mt-2.5 space-y-1">
                            {ev.detalles.map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-200 py-0.5">
                                <span className="flex items-center gap-1.5">
                                  <i className="ri-checkbox-blank-circle-fill text-[6px] text-slate-500"></i>
                                  <span>{d.descripcion}</span>
                                  <span className="font-mono text-slate-400">x{d.cantidad}</span>
                                </span>
                                <span className="font-mono text-slate-300">${fmt(d.subtotal)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {ev.notas && (
                          <p className="mt-2 pt-2 border-t border-white/[0.08] text-xs text-slate-400 italic">
                            Nota: {ev.notas}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie del modal */}
        <div className="px-5 py-3 bg-[#161a29] border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar Expediente
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Clientes() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [vistaSuperior, setVistaSuperior] = useState('directorio'); // 'directorio' | 'alertas'
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  // Modal cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [clienteForm, setClienteForm] = useState(CLIENTE_VACIO);
  const [clienteEditando, setClienteEditando] = useState(null);

  // Panel lateral y modales de vehículo
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [panelTab, setPanelTab] = useState('vehiculos');
  const [modalVehiculo, setModalVehiculo] = useState(false);
  const [vehiculoForm, setVehiculoForm] = useState(VEHICULO_VACIO);
  const [vehiculoEditando, setVehiculoEditando] = useState(null);
  const [expedienteVehiculoId, setExpedienteVehiculoId] = useState(null);

  const mostrarExito = (msg) => {
    setExito(msg);
    setTimeout(() => setExito(null), 3500);
  };

  const medidaDetectadaBusqueda = useMemo(() => detectarMedidaFormateada(busqueda), [busqueda]);

  // ─── Clientes (cargamos lista completa y filtramos también por medida inteligente / placas) ───
  const { data: clientesRaw = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const res = await fetch(`${API}/clientes/`, { headers: headers() });
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      return Array.isArray(data) ? data : data.results || [];
    },
  });

  const clientes = useMemo(() => {
    if (!busqueda.trim()) return clientesRaw;
    const q = busqueda.trim().toLowerCase();
    const qCanon = extraerDigitosMedida(q);

    return clientesRaw.filter((c) => {
      const matchCliente =
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.rfc || '').toLowerCase().includes(q);
      if (matchCliente) return true;

      // Buscar en sus vehículos por placas, marca, modelo o medida canónica
      return (c.vehiculos || []).some((v) => {
        const matchTextoVeh =
          (v.placas || '').toLowerCase().includes(q) ||
          (v.marca || '').toLowerCase().includes(q) ||
          (v.modelo || '').toLowerCase().includes(q) ||
          (v.medida_llantas || '').toLowerCase().includes(q) ||
          (v.medida_llanta_delantera || '').toLowerCase().includes(q) ||
          (v.medida_llanta_trasera || '').toLowerCase().includes(q);
        if (matchTextoVeh) return true;

        if (qCanon.length >= 3) {
          const m1 = extraerDigitosMedida(v.medida_llantas);
          const m2 = extraerDigitosMedida(v.medida_llanta_delantera);
          const m3 = extraerDigitosMedida(v.medida_llanta_trasera);
          const pCanon = extraerDigitosMedida(v.placas);
          return m1.includes(qCanon) || m2.includes(qCanon) || m3.includes(qCanon) || pCanon.includes(qCanon);
        }
        return false;
      });
    });
  }, [clientesRaw, busqueda]);

  // ─── Alertas de Próximo Servicio (6 Meses) ──────────────────────────────
  const { data: alertasServicio = [], isLoading: loadingAlertas } = useQuery({
    queryKey: ['vehiculos-alertas-servicio'],
    queryFn: async () => {
      const res = await fetch(`${API}/vehiculos/alertas_servicio/`, { headers: headers() });
      if (!res.ok) return [];
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
      marca: v.marca || '',
      modelo: v.modelo || '',
      año: v.año || new Date().getFullYear(),
      placas: v.placas || '',
      color: v.color || '',
      medida_llanta_delantera: v.medida_llanta_delantera || v.medida_llantas || '',
      medida_llanta_trasera: v.medida_llanta_trasera || '',
      medida_llantas: v.medida_llantas || v.medida_llanta_delantera || '',
      kilometraje_ultimo: v.kilometraje_ultimo ?? '',
      notas: v.notas || '',
    });
    setModalVehiculo(true);
  };

  const guardarVehiculoMut = useMutation({
    mutationFn: async (formData) => {
      const url = vehiculoEditando
        ? `${API}/vehiculos/${vehiculoEditando}/`
        : `${API}/vehiculos/`;
      const method = vehiculoEditando ? 'PUT' : 'POST';
      const medidaDel = detectarMedidaFormateada(formData.medida_llanta_delantera) || formData.medida_llanta_delantera.trim();
      const medidaTras = detectarMedidaFormateada(formData.medida_llanta_trasera) || formData.medida_llanta_trasera.trim();
      const payload = {
        ...formData,
        cliente: clienteSeleccionado.id,
        placas: (formData.placas || '').trim().toUpperCase(),
        medida_llanta_delantera: medidaDel,
        medida_llanta_trasera: medidaTras,
        medida_llantas: medidaDel,
        kilometraje_ultimo: formData.kilometraje_ultimo !== '' ? parseInt(formData.kilometraje_ultimo, 10) || 0 : 0,
      };
      const res = await fetch(url, {
        method,
        headers: headers(),
        body: JSON.stringify(payload),
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
      queryClient.invalidateQueries({ queryKey: ['vehiculos-alertas-servicio'] });
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
      queryClient.invalidateQueries({ queryKey: ['vehiculos-alertas-servicio'] });
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

  const medidaDelDetectada = detectarMedidaFormateada(vehiculoForm.medida_llanta_delantera);
  const medidaTrasDetectada = detectarMedidaFormateada(vehiculoForm.medida_llanta_trasera);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Clientes y Expediente Automotriz</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clientesRaw.length} clientes registrados • Seguimiento clínico de vehículos y alertas semestrales
          </p>
        </div>
        <button
          onClick={abrirModalNuevoCliente}
          className="flex items-center justify-center gap-2 bg-[#df000a] text-white px-4 py-2 rounded-xl hover:bg-[#c4000a] transition-colors whitespace-nowrap text-sm font-bold shadow-xs cursor-pointer"
        >
          <PlusIcon className="w-5 h-5" />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* Pestañas Conmutables Superiores */}
      <div className="flex flex-wrap gap-2 bg-[#161a29] p-1.5 rounded-xl border border-white/10 mb-5 w-fit">
        <button
          type="button"
          onClick={() => setVistaSuperior('directorio')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            vistaSuperior === 'directorio'
              ? 'bg-red-600 text-white shadow'
              : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <i className="ri-contacts-book-2-line text-base"></i>
          <span>Directorio de Clientes y Vehículos</span>
        </button>
        <button
          type="button"
          onClick={() => setVistaSuperior('alertas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            vistaSuperior === 'alertas'
              ? 'bg-red-600 text-white shadow'
              : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <i className="ri-alarm-warning-line text-base"></i>
          <span>Alertas de Próximo Servicio (6 Meses)</span>
          {alertasServicio.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950">
              {alertasServicio.length}
            </span>
          )}
        </button>
      </div>

      {/* Notificaciones */}
      {exito && (
        <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-lg text-sm flex items-center gap-2">
          <i className="ri-checkbox-circle-line text-emerald-400 font-bold"></i>
          <span>{exito}</span>
        </div>
      )}
      {(error || queryError) && (
        <div className="mb-4 p-3 bg-red-500/15 border border-red-500/40 text-red-300 rounded-lg flex justify-between text-sm">
          <span>{error || 'Error al cargar clientes'}</span>
          <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}

      {/* ══ VISTA 2: ALERTAS DE PRÓXIMO SERVICIO (6 MESES) ══════════════════ */}
      {vistaSuperior === 'alertas' ? (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 shrink-0">
                <i className="ri-calendar-check-line text-xl"></i>
              </div>
              <div>
                <h2 className="text-sm font-bold text-amber-200">
                  Seguimiento Preventivo de Rotación y Balanceo (Cada 6 Meses)
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Vehículos cuyo servicio semestral está vencido o próximo a vencer en los siguientes 30 días. Envía un recordatorio directo por WhatsApp en 1 clic.
                </p>
              </div>
            </div>
          </div>

          {loadingAlertas ? (
            <div className="text-center py-12 text-slate-400">Cargando alertas de servicio...</div>
          ) : alertasServicio.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-slate-400">
              <i className="ri-shield-check-line text-4xl text-emerald-400 block mb-2"></i>
              <p className="font-bold text-white">No hay vehículos con servicio vencido o próximo</p>
              <p className="text-xs text-slate-400 mt-1">
                Las alertas se programan automáticamente a los 6 meses de cada venta vinculada a un vehículo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alertasServicio.map((v) => (
                <div
                  key={v.id}
                  className="bg-[#161a29] rounded-xl border border-white/10 p-4 shadow-2xs flex flex-col justify-between gap-3 hover:border-red-500/40 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <PlacaBadge placas={v.placas} />
                      <BadgeEstadoServicio estado={v.estado_alerta} dias={v.dias_para_servicio} />
                    </div>

                    <div>
                      <h3 className="font-bold text-white text-sm">
                        {v.marca} {v.modelo} {v.año}
                        {v.color ? <span className="text-slate-400 font-normal"> • {v.color}</span> : ''}
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                        <i className="ri-user-3-line text-[#df000a]"></i>
                        <span className="font-medium text-white">{v.cliente_nombre}</span>
                        <span>({v.cliente_telefono})</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#1b2032] p-2.5 rounded-lg border border-white/[0.08] text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Medida Llantas</span>
                        <span className="font-mono font-bold text-[#ff4040]">
                          {v.medida_llanta_delantera || v.medida_llantas}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Kilometraje</span>
                        <span className="font-mono font-bold text-white">
                          {v.kilometraje_ultimo ? `${Number(v.kilometraje_ultimo).toLocaleString('es-MX')} km` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Último Servicio</span>
                        <span className="font-mono text-slate-200">{v.fecha_ultimo_servicio || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Próximo Servicio</span>
                        <span className="font-mono font-bold text-amber-300">{v.fecha_proximo_servicio || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setExpedienteVehiculoId(v.id)}
                      className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <i className="ri-file-list-3-line"></i>
                      <span>Ver Expediente Clínico</span>
                    </button>
                    {v.whatsapp_recordatorio_url && (
                      <a
                        href={v.whatsapp_recordatorio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                        title="Enviar Recordatorio por WhatsApp"
                      >
                        <i className="ri-whatsapp-line text-sm"></i>
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ══ VISTA 1: DIRECTORIO DE CLIENTES Y VEHÍCULOS ═══════════════════ */
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* ── Lista de clientes ── */}
          <div className="flex-1 min-w-0">
            {/* Buscador */}
            <div className="mb-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, teléfono, placas (ej. YZA-123) o medida (ej. 2055516)..."
                  value={busqueda}
                  onChange={handleBusqueda}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                />
              </div>
              {medidaDetectadaBusqueda && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600/20 border border-red-500/40 text-xs font-bold text-red-300">
                  <i className="ri-focus-3-line"></i>
                  <span>Medida detectada: {medidaDetectadaBusqueda}</span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-500">Cargando...</div>
            ) : clientes.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
                <UserIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No se encontraron clientes ni vehículos para esa búsqueda</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[540px]">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                      <th className="text-left px-4 py-3">Nombre</th>
                      <th className="text-left px-4 py-3">Teléfono</th>
                      <th className="text-left px-4 py-3">Vehículos / Placas</th>
                      <th className="text-center px-4 py-3">Compras</th>
                      <th className="text-center px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientes.map((cliente) => (
                      <tr
                        key={cliente.id}
                        className={`hover:bg-white/[0.04] cursor-pointer transition-colors ${
                          clienteSeleccionado?.id === cliente.id ? 'bg-red-600/15' : ''
                        }`}
                        onClick={() => seleccionarCliente(cliente)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{cliente.nombre}</div>
                          {cliente.email && <div className="text-xs text-slate-400">{cliente.email}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">{cliente.telefono}</td>
                        <td className="px-4 py-3">
                          {cliente.vehiculos && cliente.vehiculos.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {cliente.vehiculos.slice(0, 2).map((v) => (
                                <span
                                  key={v.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1b2032] text-slate-200 text-xs font-medium border border-white/10"
                                >
                                  <TruckIcon className="w-3.5 h-3.5 text-[#df000a]" />
                                  <span>{v.placas || `${v.marca} ${v.modelo}`}</span>
                                  <span className="text-[11px] font-mono text-red-400">
                                    ({v.medida_llanta_delantera || v.medida_llantas})
                                  </span>
                                </span>
                              ))}
                              {cliente.vehiculos.length > 2 && (
                                <span className="text-xs text-slate-400 font-semibold">
                                  +{cliente.vehiculos.length - 2} más
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Sin vehículos</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-200">{cliente.total_compras}</td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => abrirModalEditarCliente(cliente)}
                              className="p-2 text-red-400 hover:bg-red-500/15 rounded cursor-pointer"
                              title="Editar"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => eliminarCliente(cliente.id)}
                              className="p-2 text-red-400 hover:bg-red-500/15 rounded cursor-pointer"
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

          {/* ── Panel de vehículos y expediente del cliente ── */}
          {clienteSeleccionado && (
            <div className="w-full lg:w-[410px] lg:shrink-0">
              <div className="bg-[#161a29] rounded-xl border border-white/10 overflow-hidden shadow-xs">
                {/* Encabezado panel */}
                <div className="bg-[#0f172a] text-white px-4 py-3.5 border-b border-white/10 flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-white text-base">{clienteSeleccionado.nombre}</h2>
                    <p className="text-xs text-slate-300 mt-0.5 font-mono">{clienteSeleccionado.telefono}</p>
                    {clienteSeleccionado.rfc && (
                      <p className="text-xs text-slate-400">RFC: {clienteSeleccionado.rfc}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setClienteSeleccionado(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Info adicional */}
                {(clienteSeleccionado.direccion || clienteSeleccionado.notas) && (
                  <div className="px-4 py-2 text-xs text-slate-300 border-b border-white/10 space-y-1 bg-[#1b2032]">
                    {clienteSeleccionado.direccion && <p>{clienteSeleccionado.direccion}</p>}
                    {clienteSeleccionado.notas && <p className="italic">{clienteSeleccionado.notas}</p>}
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-white/10 bg-[#141720]">
                  <button
                    onClick={() => setPanelTab('vehiculos')}
                    className={`flex-1 py-2.5 text-xs transition-colors cursor-pointer ${
                      panelTab === 'vehiculos'
                        ? 'bg-red-600/20 text-white border-b-2 border-red-500 font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    Vehículos ({clienteSeleccionado.vehiculos?.length || 0})
                  </button>
                  <button
                    onClick={() => setPanelTab('compras')}
                    className={`flex-1 py-2.5 text-xs transition-colors cursor-pointer ${
                      panelTab === 'compras'
                        ? 'bg-red-600/20 text-white border-b-2 border-red-500 font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    Compras ({clienteSeleccionado.total_compras})
                  </button>
                </div>

                {/* Tab: Vehículos */}
                {panelTab === 'vehiculos' && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <TruckIcon className="w-4 h-4 text-[#df000a]" />
                        Flota / Vehículos del Cliente
                      </h3>
                      <button
                        onClick={abrirModalNuevoVehiculo}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#df000a] text-white text-xs font-bold hover:bg-[#a80008] transition-colors cursor-pointer"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        Agregar Vehículo
                      </button>
                    </div>

                    {!clienteSeleccionado.vehiculos?.length ? (
                      <p className="text-xs text-slate-400 text-center py-6">Sin vehículos registrados</p>
                    ) : (
                      <ul className="space-y-3">
                        {clienteSeleccionado.vehiculos.map((v) => (
                          <li key={v.id} className="bg-[#1b2032] rounded-xl p-3.5 text-xs border border-white/10 space-y-2.5">
                            {/* Fila superior: Placa + Semáforo + Editar/Eliminar */}
                            <div className="flex items-center justify-between gap-2">
                              <PlacaBadge placas={v.placas} />
                              <div className="flex items-center gap-1">
                                <BadgeEstadoServicio estado={v.estado_alerta} dias={v.dias_para_servicio} />
                                <button
                                  onClick={() => abrirModalEditarVehiculo(v)}
                                  className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded cursor-pointer"
                                  title="Editar vehículo"
                                >
                                  <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => eliminarVehiculo(v.id)}
                                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/15 rounded cursor-pointer"
                                  title="Eliminar vehículo"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Datos del vehículo */}
                            <div>
                              <p className="font-bold text-white text-sm">
                                {v.marca} {v.modelo} {v.año}
                                {v.color ? <span className="font-normal text-slate-400"> • {v.color}</span> : ''}
                              </p>
                              <div className="mt-1.5 grid grid-cols-2 gap-1.5 bg-[#161a29] p-2.5 rounded-lg border border-white/[0.08]">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Medida Delantera</span>
                                  <span className="text-[#ff4040] font-mono font-bold">
                                    {v.medida_llanta_delantera || v.medida_llantas || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Kilometraje</span>
                                  <span className="text-white font-mono font-semibold">
                                    {v.kilometraje_ultimo ? `${Number(v.kilometraje_ultimo).toLocaleString('es-MX')} km` : '—'}
                                  </span>
                                </div>
                                {v.medida_llanta_trasera && v.medida_llanta_trasera !== v.medida_llanta_delantera && (
                                  <div className="col-span-2">
                                    <span className="text-[10px] text-slate-400 uppercase font-semibold mr-1">Trasera:</span>
                                    <span className="text-white font-mono font-bold">{v.medida_llanta_trasera}</span>
                                  </div>
                                )}
                              </div>
                              {v.notas && (
                                <p className="text-[11px] text-slate-400 italic mt-1">{v.notas}</p>
                              )}
                            </div>

                            {/* Botones de Acción del Expediente */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setExpedienteVehiculoId(v.id)}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <i className="ri-file-list-3-line"></i>
                                <span>Ver Expediente Clínico</span>
                              </button>
                              {v.whatsapp_recordatorio_url && (
                                <a
                                  href={v.whatsapp_recordatorio_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-colors"
                                  title="Recordatorio WhatsApp de rotación y balanceo"
                                >
                                  <i className="ri-whatsapp-line text-sm"></i>
                                  <span>Recordatorio WhatsApp</span>
                                </a>
                              )}
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
                      <p className="text-xs text-slate-400 text-center py-4">Cargando...</p>
                    ) : compras.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Sin compras registradas</p>
                    ) : (
                      <ul className="space-y-2">
                        {compras.map((v) => (
                          <li key={v.id} className="bg-[#1b2032] rounded-lg p-3 text-xs border border-white/10">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-mono font-semibold text-white">{v.folio}</p>
                                <p className="text-slate-400 mt-0.5">{v.fecha_formateada || v.fecha}</p>
                                <span className="inline-block mt-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 capitalize">
                                  {v.metodo_pago}
                                </span>
                              </div>
                              <p className="font-bold text-emerald-400 font-mono">
                                ${Number(v.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            {v.detalles && v.detalles.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/[0.08] space-y-0.5">
                                {v.detalles.map((d, i) => (
                                  <p key={i} className="text-slate-300 truncate">
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
      )}

      {/* ══ Modal Expediente Clínico ═══════════════════════════════════════ */}
      {expedienteVehiculoId && (
        <ModalExpedienteVehiculo
          vehiculoId={expedienteVehiculoId}
          onClose={() => setExpedienteVehiculoId(null)}
          onVehiculoActualizado={(updatedVeh) => {
            if (clienteSeleccionado?.vehiculos) {
              setClienteSeleccionado((prev) =>
                prev
                  ? {
                      ...prev,
                      vehiculos: prev.vehiculos.map((v) => (v.id === updatedVeh.id ? updatedVeh : v)),
                    }
                  : prev
              );
            }
          }}
        />
      )}

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

      {/* ══ Modal Vehículo (con campos completos del Expediente Clínico) ════ */}
      {modalVehiculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <i className="ri-roadster-line text-[#df000a]"></i>
                <span>{vehiculoEditando ? 'Editar Vehículo' : 'Agregar Vehículo al Expediente'}</span>
              </h2>
              <button onClick={() => setModalVehiculo(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarVehiculo} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Placas (Matrícula)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={vehiculoForm.placas}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, placas: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-700 rounded-lg px-3 py-2 font-mono font-bold uppercase text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="YZA-123-A"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Color
                  </label>
                  <input
                    type="text"
                    value={vehiculoForm.color}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, color: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Blanco, Rojo, Plata..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Marca <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.marca}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, marca: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Toyota, Nissan, VW..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Modelo <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.modelo}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, modelo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Hilux, Versa, Jetta..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Año <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min={1980}
                    max={new Date().getFullYear() + 1}
                    value={vehiculoForm.año}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, año: parseInt(e.target.value) || new Date().getFullYear() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Último Kilometraje (km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={vehiculoForm.kilometraje_ultimo}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, kilometraje_ultimo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Ej. 65000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Medida Llanta Delantera <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={vehiculoForm.medida_llanta_delantera}
                    onChange={(e) =>
                      setVehiculoForm({
                        ...vehiculoForm,
                        medida_llanta_delantera: e.target.value,
                        medida_llantas: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Ej. 2055516 o 205/55 R16"
                  />
                  {medidaDelDetectada && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#df000a]">
                      <i className="ri-focus-3-line"></i> Se guardará como: {medidaDelDetectada}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Medida Llanta Trasera (Opcional)
                  </label>
                  <input
                    type="text"
                    value={vehiculoForm.medida_llanta_trasera}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, medida_llanta_trasera: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#df000a] focus:border-transparent"
                    placeholder="Igual a delantera si se omite"
                  />
                  {medidaTrasDetectada && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#df000a]">
                      <i className="ri-focus-3-line"></i> Se guardará como: {medidaTrasDetectada}
                    </span>
                  )}
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                    Notas Técnicas / Observaciones
                  </label>
                  <textarea
                    rows={2}
                    value={vehiculoForm.notas}
                    onChange={(e) => setVehiculoForm({ ...vehiculoForm, notas: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent resize-none"
                    placeholder="Birlo de seguridad en guantera, presión 34 PSI, rines deportivos..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalVehiculo(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardarVehiculoMut.isPending}
                  className="flex-1 bg-[#df000a] text-white py-2 rounded-lg hover:bg-[#c4000a] transition-colors disabled:opacity-50 text-sm font-bold"
                >
                  {guardarVehiculoMut.isPending ? 'Guardando...' : vehiculoEditando ? 'Actualizar Vehículo' : 'Guardar Vehículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
