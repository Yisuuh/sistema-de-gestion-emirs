import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';

export default function AutorizarSolicitud() {
  const { token } = useParams();
  const [solicitud, setSolicitud] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [pinAdmin, setPinAdmin] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [resultado, setResultado] = useState(null); // { tipo: 'aprobada' | 'rechazada', codigo_otp, mensaje }
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  // Cargar detalle público de la solicitud
  const cargarDetalle = useCallback(async () => {
    try {
      const res = await fetch(`/api/ventas/solicitudes-autorizacion/${token}/detalle_publico/`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Solicitud no encontrada o enlace inválido.');
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || 'Error al consultar la solicitud.');
      }
      const data = await res.json();
      setSolicitud(data);

      if (data.estado === 'aprobada' && data.codigo_otp) {
        setResultado({
          tipo: 'aprobada',
          codigo_otp: data.codigo_otp,
          mensaje: 'Esta solicitud ya ha sido autorizada.',
          autorizado_por: data.autorizado_por_nombre,
        });
      } else if (data.estado === 'rechazada') {
        setResultado({
          tipo: 'rechazada',
          mensaje: 'Esta solicitud fue rechazada.',
        });
      }

      // Calcular tiempo restante en segundos
      if (typeof data.segundos_restantes === 'number') {
        setSegundosRestantes(Math.max(0, Math.floor(data.segundos_restantes)));
      } else if (data.expira_en) {
        const exp = new Date(data.expira_en).getTime();
        const ahora = Date.now();
        setSegundosRestantes(Math.max(0, Math.floor((exp - ahora) / 1000)));
      }
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    cargarDetalle();
  }, [cargarDetalle]);

  // Contador regresivo en tiempo real
  useEffect(() => {
    if (segundosRestantes <= 0) return;
    const interval = setInterval(() => {
      setSegundosRestantes((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [segundosRestantes]);

  const formatearTiempo = (seg) => {
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const fmtDinero = (val) => {
    const num = parseFloat(val) || 0;
    return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Aprobar solicitud
  const handleAprobar = async () => {
    setErrorAccion('');
    if (!pinAdmin || !/^\d{4,6}$/.test(pinAdmin)) {
      setErrorAccion('Ingresa tu PIN de Administrador (4 a 6 dígitos).');
      return;
    }

    setProcesando(true);
    try {
      const res = await fetch(`/api/ventas/solicitudes-autorizacion/${token}/aprobar_remoto/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_admin: pinAdmin }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'PIN incorrecto o error al autorizar.');
      }

      setResultado({
        tipo: 'aprobada',
        codigo_otp: data.codigo_otp,
        mensaje: data.mensaje || '¡Solicitud aprobada exitosamente!',
        autorizado_por: data.autorizado_por,
      });
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setProcesando(false);
    }
  };

  // Rechazar solicitud
  const handleRechazar = async () => {
    if (!window.confirm('¿Seguro que deseas RECHAZAR esta solicitud en caja?')) return;
    setErrorAccion('');
    setProcesando(true);
    try {
      const res = await fetch(`/api/ventas/solicitudes-autorizacion/${token}/rechazar_remoto/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'No se pudo rechazar la solicitud.');
      }

      setResultado({
        tipo: 'rechazada',
        mensaje: 'La solicitud ha sido rechazada.',
      });
    } catch (e) {
      setErrorAccion(e.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e121e] text-white flex flex-col justify-between p-4 sm:p-6 font-sans">
      <div className="max-w-md mx-auto w-full space-y-4">
        {/* Cabecera institucional */}
        <div className="text-center pt-2 pb-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/15 border border-red-500/30 text-red-400 text-xs font-black tracking-wide uppercase mb-2">
            <span className="w-2 h-2 rounded-full bg-[#df000a] animate-pulse"></span>
            Centro Llantero EmirS
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Autorización Remota
          </h1>
          <p className="text-xs text-slate-400">
            Módulo Seguro de Confirmación para Administradores
          </p>
        </div>

        {/* Estado de Carga */}
        {loading && (
          <div className="bg-[#161a29] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-slate-300 font-medium">Consultando solicitud en vivo...</p>
          </div>
        )}

        {/* Error de Carga / Enlace Inválido */}
        {errorCarga && !loading && (
          <div className="bg-[#161a29] border border-red-500/40 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-2xl">
              <i className="ri-error-warning-line"></i>
            </div>
            <h2 className="text-base font-bold text-white">Enlace no disponible</h2>
            <p className="text-xs text-slate-400">{errorCarga}</p>
          </div>
        )}

        {/* Pantalla de Éxito / OTP Aprobado */}
        {resultado?.tipo === 'aprobada' && (
          <div className="bg-[#161a29] border border-emerald-500/40 rounded-2xl p-6 text-center space-y-5 shadow-2xl animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-3xl border border-emerald-500/40">
              <i className="ri-checkbox-circle-fill"></i>
            </div>

            <div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-wider">
                {solicitud?.tipo_accion === 'cancelar_venta' || solicitud?.accion === 'eliminar_venta'
                  ? 'Cancelación Aprobada'
                  : solicitud?.tipo_accion === 'editar_venta' || solicitud?.accion === 'editar_venta'
                  ? 'Edición Aprobada'
                  : 'Solicitud Aprobada'}
              </span>
              <h2 className="text-lg font-black text-white mt-2">
                Código de Autorización OTP
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Proporciona este código al cajero en el mostrador para desbloquear la operación
              </p>
            </div>

            {/* Recuadro Destacado con el OTP */}
            <div className="p-4 bg-[#1b2032] border-2 border-emerald-500 rounded-2xl">
              <div className="text-3xl sm:text-4xl font-mono font-black tracking-widest text-emerald-400 select-all">
                {resultado.codigo_otp || '------'}
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">
                Válido por única ocasión para Folio #{solicitud?.venta_folio || ''}
              </p>
            </div>

            <button
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(resultado.codigo_otp);
                  alert('Código OTP copiado al portapapeles');
                }
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
            >
              <i className="ri-file-copy-line text-base"></i>
              <span>Copiar Código</span>
            </button>
          </div>
        )}

        {/* Pantalla de Rechazo */}
        {resultado?.tipo === 'rechazada' && (
          <div className="bg-[#161a29] border border-red-500/40 rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-3xl border border-red-500/40">
              <i className="ri-close-circle-fill"></i>
            </div>
            <h2 className="text-lg font-black text-white">Solicitud Rechazada</h2>
            <p className="text-xs text-slate-400">
              La acción solicitada en caja ha sido declinada. El cajero no podrá proceder con esta operación.
            </p>
          </div>
        )}

        {/* Formulario Principal (Solo si está pendiente y no resuelta) */}
        {!loading && !errorCarga && !resultado && solicitud && (
          <div className="space-y-4">
            {/* Tarjeta de Detalles de la Operación */}
            <div className="bg-[#161a29] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Tipo de Acción</span>
                  <span className="text-sm font-black text-amber-400 uppercase tracking-wide flex items-center gap-1.5 mt-0.5">
                    {solicitud.tipo_accion === 'cancelar_venta' || solicitud.accion === 'eliminar_venta' ? (
                      <>
                        <i className="ri-delete-bin-line text-rose-400 text-base"></i>
                        <span>Cancelación de Venta</span>
                      </>
                    ) : solicitud.tipo_accion === 'editar_venta' || solicitud.accion === 'editar_venta' ? (
                      <>
                        <i className="ri-edit-line text-amber-400 text-base"></i>
                        <span>Edición de Venta</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-shield-keyhole-line text-amber-400 text-base"></i>
                        <span>{solicitud.tipo_accion || solicitud.accion || 'Autorización Especial'}</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Contador regresivo */}
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Expira en</span>
                  <span
                    className={`text-sm font-mono font-black ${
                      segundosRestantes < 60 ? 'text-red-400 animate-pulse' : 'text-slate-200'
                    }`}
                  >
                    <i className="ri-time-line mr-1 text-slate-400"></i>
                    {formatearTiempo(segundosRestantes)}
                  </span>
                </div>
              </div>

              {/* Grid de Datos Clave */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Folio de Venta</span>
                  <span className="text-sm font-mono font-bold text-white block">
                    #{solicitud.venta_folio || 'S/N'}
                  </span>
                </div>

                <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05]">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Monto Total</span>
                  <span className="text-sm font-mono font-black text-emerald-400 block">
                    {fmtDinero(solicitud.venta_total)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Solicitado por</span>
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mt-0.5">
                  <i className="ri-user-line text-slate-400"></i>
                  <span>{solicitud.solicitado_por_nombre || 'Cajero en turno'}</span>
                </span>
              </div>

              {/* Motivo */}
              <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05]">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                  Motivo reportado
                </span>
                <p className="text-xs text-slate-300 italic leading-relaxed">
                  &ldquo;{solicitud.motivo || 'Sin motivo detallado'}&rdquo;
                </p>
              </div>

              {/* Si expiró */}
              {segundosRestantes <= 0 && (
                <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-center text-xs text-red-300 font-bold flex items-center justify-center gap-1.5">
                  <i className="ri-alarm-warning-line text-rose-400 text-sm"></i>
                  <span>Esta solicitud ha caducado por límite de tiempo.</span>
                </div>
              )}
            </div>

            {/* Panel de Aprobación con PIN */}
            {segundosRestantes > 0 && (
              <div className="bg-[#161a29] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Ingresa tu PIN de Administrador
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="••••"
                    value={pinAdmin}
                    onChange={(e) => setPinAdmin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-2xl tracking-[0.3em] font-mono py-3 bg-[#1b2032] border-2 border-white/[0.1] rounded-xl text-white focus:outline-none focus:border-red-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 text-center">
                    PIN maestro personal de 4 a 6 dígitos
                  </p>
                </div>

                {errorAccion && (
                  <div className="p-3 bg-red-950/60 border border-red-500 rounded-xl text-red-200 text-xs font-semibold flex items-center gap-2">
                    <i className="ri-error-warning-line text-red-400 text-base flex-shrink-0"></i>
                    <span>{errorAccion}</span>
                  </div>
                )}

                {/* Botón APROBAR CANCELACIÓN / EDICIÓN EN CAJA */}
                <button
                  onClick={handleAprobar}
                  disabled={procesando || !pinAdmin}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white rounded-xl font-black text-sm tracking-wide uppercase flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                >
                  {procesando ? (
                    <i className="ri-loader-4-line animate-spin text-lg"></i>
                  ) : (
                    <i className="ri-checkbox-circle-line text-lg"></i>
                  )}
                  <span>
                    {solicitud.tipo_accion === 'cancelar_venta' || solicitud.accion === 'eliminar_venta'
                      ? '[ APROBAR CANCELACIÓN EN CAJA ]'
                      : solicitud.tipo_accion === 'editar_venta' || solicitud.accion === 'editar_venta'
                      ? '[ APROBAR EDICIÓN EN CAJA ]'
                      : '[ APROBAR OPERACIÓN EN CAJA ]'}
                  </span>
                </button>

                {/* Botón RECHAZAR SOLICITUD */}
                <button
                  onClick={handleRechazar}
                  disabled={procesando}
                  className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 border border-red-500/40 text-red-300 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <i className="ri-close-circle-line text-base"></i>
                  <span>[ RECHAZAR SOLICITUD ]</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer seguro */}
      <div className="text-center py-3 text-[11px] text-slate-600">
        © {new Date().getFullYear()} Centro Llantero EmirS • Sistema de Gestión Autorizado
      </div>
    </div>
  );
}
