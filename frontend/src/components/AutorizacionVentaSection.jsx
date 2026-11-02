import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../lib/apiClient';

/**
 * Componente modular para el flujo de autorización de vendedores/operadores.
 * Permite autorización presencial con PIN maestro o autorización remota vía WhatsApp.
 */
export default function AutorizacionVentaSection({
  accion, // 'eliminar_venta' | 'editar_venta'
  venta,
  motivo,
  setMotivo,
  pinAdmin,
  setPinAdmin,
  codigoOtp,
  setCodigoOtp,
  tab,
  setTab,
  aprobadoRemoto,
  setAprobadoRemoto,
  adminAprobador,
  setAdminAprobador,
}) {
  const [mostrarPin, setMostrarPin] = useState(false);
  const [solicitud, setSolicitud] = useState(null); // { token, whatsapp_mensaje, segundos_restantes, ... }
  const [solicitando, setSolicitando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');
  const [segundosRestantes, setSegundosRestantes] = useState(900); // 15 minutos

  const intervalTimerRef = useRef(null);
  const intervalPollRef = useRef(null);

  // Limpiar temporizadores al desmontar
  useEffect(() => {
    return () => {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (intervalPollRef.current) clearInterval(intervalPollRef.current);
    };
  }, []);

  // Formato mm:ss
  const formatTime = (seg) => {
    const s = Math.max(0, seg);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  // Iniciar temporizador regresivo
  const iniciarTimer = (segundosIniciales) => {
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    setSegundosRestantes(segundosIniciales);

    intervalTimerRef.current = setInterval(() => {
      setSegundosRestantes((prev) => {
        if (prev <= 1) {
          clearInterval(intervalTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Iniciar sondeo (polling) cada 3 segundos
  const iniciarPolling = (token) => {
    if (intervalPollRef.current) clearInterval(intervalPollRef.current);

    intervalPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ventas/solicitudes-autorizacion/${token}/detalle_publico/`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.estado === 'aprobada') {
          clearInterval(intervalPollRef.current);
          setAprobadoRemoto(true);
          if (data.autorizado_por_nombre) {
            setAdminAprobador(data.autorizado_por_nombre);
          }
          if (data.codigo_otp) {
            setCodigoOtp(data.codigo_otp);
          }
          setSolicitud((prev) => ({ ...prev, estado: 'aprobada', ...data }));
        } else if (data.estado === 'rechazada' || data.estado === 'expirada') {
          clearInterval(intervalPollRef.current);
          setSolicitud((prev) => ({ ...prev, estado: data.estado }));
        }
      } catch {
        // En caso de corte momentáneo de red no romper el sondeo
      }
    }, 3000);
  };

  // Solicitar autorización por WhatsApp
  const handleSolicitarWhatsApp = async () => {
    if (!motivo || motivo.trim().length < 3) {
      setErrorLocal('Debes ingresar un motivo válido (mínimo 3 caracteres) antes de solicitar autorización.');
      return;
    }
    setErrorLocal('');
    setSolicitando(true);

    try {
      const data = await apiClient.post('/api/ventas/solicitudes-autorizacion/', {
        venta: venta.id,
        accion,
        motivo: motivo.trim(),
      });

      setSolicitud(data);
      const segs = typeof data.segundos_restantes === 'number' && data.segundos_restantes > 0 
        ? data.segundos_restantes 
        : 900;

      iniciarTimer(segs);
      iniciarPolling(data.token);

      // Armar URL completa de WhatsApp
      const origin = window.location.origin;
      const mensajeTexto = data.whatsapp_mensaje
        ? data.whatsapp_mensaje.replace('/autorizar/', `${origin}/autorizar/`)
        : `*SOLICITUD DE AUTORIZACIÓN - EMIRS*\n\nAcción: ${accion}\nFolio: ${venta.folio}\nMotivo: ${motivo.trim()}\n\nAutorizar aquí:\n${origin}/autorizar/${data.token}`;

      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensajeTexto)}`;
      window.open(whatsappUrl, '_blank');
    } catch (err) {
      setErrorLocal(err.message || 'Error al generar la solicitud de autorización remota.');
    } finally {
      setSolicitando(false);
    }
  };

  // Reabrir mensaje de WhatsApp
  const handleReabrirWhatsApp = () => {
    if (!solicitud?.token) return;
    const origin = window.location.origin;
    const mensajeTexto = solicitud.whatsapp_mensaje
      ? solicitud.whatsapp_mensaje.replace('/autorizar/', `${origin}/autorizar/`)
      : `*SOLICITUD DE AUTORIZACIÓN - EMIRS*\n\nAcción: ${accion}\nFolio: ${venta.folio}\nMotivo: ${motivo.trim()}\n\nAutorizar aquí:\n${origin}/autorizar/${solicitud.token}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensajeTexto)}`;
    window.open(whatsappUrl, '_blank');
  };

  const accionTexto = accion === 'eliminar_venta' ? 'cancelación / eliminación' : 'edición';

  return (
    <div className="mt-3 mb-4 rounded-2xl border-2 border-amber-500/50 bg-[#121624] p-4 text-slate-100 shadow-xl space-y-3">
      {/* Encabezado de Seguridad */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-amber-500/20">
        <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
          <i className="ri-shield-keyhole-line text-lg"></i>
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
            <span>Autorización Requerida (Rol Operador / Vendedor)</span>
          </h4>
          <p className="text-xs text-slate-400">
            Se requiere autorización de un Administrador para proceder con la {accionTexto}.
          </p>
        </div>
      </div>

      {errorLocal && (
        <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <i className="ri-error-warning-line text-base text-red-400 flex-shrink-0"></i>
          <span>{errorLocal}</span>
        </div>
      )}

      {/* Selector de Pestañas de Autorización */}
      <div className="grid grid-cols-2 gap-2 bg-[#1b2032] p-1 rounded-xl border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setTab('pin')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            tab === 'pin'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <i className="ri-lock-password-line text-sm"></i>
          <span>PIN Presencial</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('remoto')}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            tab === 'remoto'
              ? 'bg-emerald-600 text-white shadow-md font-black'
              : 'text-slate-300 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <i className="ri-whatsapp-line text-sm"></i>
          <span>Solicitud Remota</span>
        </button>
      </div>

      {/* ─── PESTAÑA 1: PIN PRESENCIAL ─────────────────────────────────── */}
      {tab === 'pin' && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Motivo de la {accionTexto} *
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={`Especifica por qué se realiza la ${accionTexto} de la venta...`}
              className="w-full px-3 py-2 bg-[#161a29] border border-white/[0.12] rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
              PIN de Administrador (4 a 6 dígitos) *
            </label>
            <div className="relative">
              <input
                type={mostrarPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pinAdmin}
                onChange={(e) => setPinAdmin(e.target.value.replace(/\D/g, ''))}
                placeholder="Ingresa el PIN de seguridad"
                className="w-full px-3 py-2 pr-10 bg-[#161a29] border border-amber-500/40 rounded-xl text-white text-sm tracking-widest font-mono font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setMostrarPin(!mostrarPin)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title={mostrarPin ? 'Ocultar PIN' : 'Ver PIN'}
              >
                <i className={`ri-eye${mostrarPin ? '-off' : ''}-line text-base`}></i>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              El administrador debe ingresar su PIN de 4 a 6 dígitos para validar presencialmente esta acción.
            </p>
          </div>
        </div>
      )}

      {/* ─── PESTAÑA 2: SOLICITUD REMOTA POR WHATSAPP ───────────────────── */}
      {tab === 'remoto' && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Motivo obligatorio para el Administrador *
            </label>
            <textarea
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={`Escribe la justificación detallada de la ${accionTexto}...`}
              className="w-full px-3 py-2 bg-[#161a29] border border-white/[0.12] rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
              disabled={aprobadoRemoto}
            />
          </div>

          {!solicitud ? (
            <div>
              <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                Genera un enlace móvil de autorización que se abrirá en WhatsApp para que el administrador autorice en 1 clic desde su celular.
              </p>
              <button
                type="button"
                onClick={handleSolicitarWhatsApp}
                disabled={solicitando || !motivo.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-950/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {solicitando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Generando Solicitud...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-whatsapp-line text-base"></i>
                    <span>Solicitar Autorización por WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="bg-[#161a29] border border-white/[0.1] rounded-xl p-3 space-y-3">
              {/* Encabezado del Estado Remoto */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <i className="ri-time-line text-emerald-400"></i>
                  Tiempo restante:
                </span>
                <span
                  className={`font-mono font-black text-sm px-2 py-0.5 rounded-md ${
                    segundosRestantes < 120
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                      : 'bg-[#1b2032] text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {formatTime(segundosRestantes)}
                </span>
              </div>

              {/* Banner de Estado */}
              {aprobadoRemoto || solicitud.estado === 'aprobada' ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <i className="ri-checkbox-circle-fill text-emerald-400 text-lg flex-shrink-0"></i>
                  <div>
                    <p className="font-black">¡Solicitud aprobada por el administrador!</p>
                    {adminAprobador && (
                      <p className="text-[11px] text-emerald-200 font-normal mt-0.5">
                        Aprobado por: {adminAprobador}
                      </p>
                    )}
                  </div>
                </div>
              ) : solicitud.estado === 'rechazada' ? (
                <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2">
                  <i className="ri-close-circle-fill text-red-400 text-lg flex-shrink-0"></i>
                  <span>La solicitud fue rechazada por el administrador.</span>
                </div>
              ) : solicitud.estado === 'expirada' || segundosRestantes === 0 ? (
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2">
                  <i className="ri-error-warning-fill text-amber-400 text-lg flex-shrink-0"></i>
                  <span>La solicitud ha expirado. Genera una nueva solicitud.</span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                  <div className="flex-1">
                    <p className="font-bold">Esperando aprobación remota del administrador...</p>
                    <p className="text-[10px] text-sky-300/80">Sondeando automáticamente cada 3s.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReabrirWhatsApp}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                    title="Reenviar enlace por WhatsApp"
                  >
                    <i className="ri-whatsapp-line"></i> Reabrir
                  </button>
                </div>
              )}

              {/* Casilla manual para código OTP dictado */}
              <div className="pt-2 border-t border-white/[0.08]">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Código OTP dictado por el Administrador (6 dígitos)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={codigoOtp}
                    onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej. 849201"
                    className="flex-1 px-3 py-1.5 bg-[#1b2032] border border-white/[0.15] rounded-xl text-white font-mono text-sm tracking-widest font-bold placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {codigoOtp.length === 6 && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <i className="ri-check-line text-sm"></i>
                      <span>OTP Listo</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
