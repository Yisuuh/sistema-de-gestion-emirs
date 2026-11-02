import React, { useState, useEffect } from 'react';
import {
  TABULADOR_UTILIDAD_RINES,
  obtenerTabuladorConfigurado,
  guardarTabuladorConfigurado,
  restaurarTabuladorOficial,
} from '../../lib/medidaUtils';

const FILAS_TABULADOR = [
  { key: 'rin_13',    nombre: 'Rin 13',       desc: 'Compactos / R13' },
  { key: 'rin_14',    nombre: 'Rin 14',       desc: 'Sedanes pequeños / R14' },
  { key: 'rin_15',    nombre: 'Rin 15',       desc: 'Sedanes estándar / R15' },
  { key: 'rin_16',    nombre: 'Rin 16',       desc: 'Medida estándar más común / R16' },
  { key: 'rin_17_18', nombre: 'Rin 17 - 18',  desc: 'Camioneta / SUV / R17-R18' },
  { key: 'rin_19_24', nombre: 'Rin 19 a 24',  desc: 'Gama alta / Pickup / R19-R24' },
  { key: 'rin_17_auto', nombre: 'Rin 17A',    desc: 'Auto / Económico Rin 17' },
];

export default function ModalTabuladorRines({
  isOpen,
  onClose,
  factorInteres = 1.079,
  onGuardado,
}) {
  const [tabulador, setTabulador] = useState(() => obtenerTabuladorConfigurado());
  const [mensajeFeedback, setMensajeFeedback] = useState(null);

  // Sincronizar datos al abrir el modal
  useEffect(() => {
    if (isOpen) {
      setTabulador(obtenerTabuladorConfigurado());
      setMensajeFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const factor = parseFloat(factorInteres) || 1.079;

  const handleMargenChange = (rinKey, field, val) => {
    const num = val === '' ? '' : parseFloat(val) || 0;
    setTabulador((prev) => ({
      ...prev,
      [rinKey]: {
        ...prev[rinKey],
        [field]: num,
      },
    }));
  };

  const handleGuardar = () => {
    guardarTabuladorConfigurado(tabulador);
    setMensajeFeedback({
      tipo: 'exito',
      texto: '✓ Tabulador de rines guardado exitosamente. Las cotizaciones se han recalculado.',
    });
    if (onGuardado) {
      onGuardado(tabulador);
    }
    setTimeout(() => {
      setMensajeFeedback(null);
    }, 3000);
  };

  const handleRestaurar = () => {
    const oficiales = restaurarTabuladorOficial();
    setTabulador({ ...oficiales });
    setMensajeFeedback({
      tipo: 'info',
      texto: '↺ Se restauraron los márgenes oficiales de EmirS según la Hoja de Precios.',
    });
    if (onGuardado) {
      onGuardado(oficiales);
    }
    setTimeout(() => {
      setMensajeFeedback(null);
    }, 3000);
  };

  const fmtMoneda = (val) =>
    Number(val ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#141720] border border-white/[0.08] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#1b2032]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-[#df000a]">
              <i className="ri-table-line text-xl"></i>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Tabulador Oficial de Utilidades por Rin
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Factor: {factor.toFixed(3)}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ajusta las utilidades base (Costo 1, 2 y x4). Los montos finales financiados se calculan al vuelo multiplicando por {factor}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Mensaje de feedback temporal */}
        {mensajeFeedback && (
          <div
            className={`px-6 py-2.5 text-xs font-bold flex items-center justify-between border-b ${
              mensajeFeedback.tipo === 'exito'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            <span>{mensajeFeedback.texto}</span>
            <button
              type="button"
              onClick={() => setMensajeFeedback(null)}
              className="text-slate-400 hover:text-white ml-2"
            >
              <i className="ri-close-line"></i>
            </button>
          </div>
        )}

        {/* Contenido / Tabla */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-[#161a29]">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-[#1e2438] text-[11px] font-black uppercase text-slate-300 border-b border-white/[0.08]">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Medida
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-slate-300">
                    Costo 1 <br />
                    <span className="text-[10px] font-normal text-slate-400 font-mono">(Base 1 Llanta)</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-emerald-400 bg-emerald-950/20">
                    Costo 1 Final <br />
                    <span className="text-[10px] font-normal text-emerald-300/80 font-mono">(×{factor})</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-slate-300">
                    Costo 2 <br />
                    <span className="text-[10px] font-normal text-slate-400 font-mono">(Base Par c/u)</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-sky-400 bg-sky-950/20">
                    Costo 2 Final <br />
                    <span className="text-[10px] font-normal text-sky-300/80 font-mono">(×{factor})</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-slate-300">
                    Costo x4 <br />
                    <span className="text-[10px] font-normal text-slate-400 font-mono">(Base Juego c/u)</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-amber-400 bg-amber-950/20">
                    Costo x4 Final <br />
                    <span className="text-[10px] font-normal text-amber-300/80 font-mono">(×{factor})</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {FILAS_TABULADOR.map((fila) => {
                  const dataRow = tabulador[fila.key] || TABULADOR_UTILIDAD_RINES[fila.key] || { m1: 0, m2: 0, m4: 0 };
                  const m1Val = dataRow.m1 ?? '';
                  const m2Val = dataRow.m2 ?? '';
                  const m4Val = dataRow.m4 ?? '';

                  const m1Final = Number(m1Val || 0) * factor;
                  const m2Final = Number(m2Val || 0) * factor;
                  const m4Final = Number(m4Val || 0) * factor;

                  return (
                    <tr key={fila.key} className="hover:bg-white/[0.02] transition-colors">
                      {/* Medida / Nombre */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-black text-white flex items-center gap-2">
                          <i className="ri-disc-line text-[#df000a]"></i>
                          <span>{fila.nombre}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal">{fila.desc}</div>
                      </td>

                      {/* Costo 1 (editable) */}
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center">
                          <span className="text-slate-500 mr-1">$</span>
                          <input
                            type="number"
                            min="0"
                            step="25"
                            value={m1Val}
                            onChange={(e) => handleMargenChange(fila.key, 'm1', e.target.value)}
                            className="w-20 px-2 py-1.5 rounded-lg bg-[#0f121d] border border-white/[0.12] focus:border-red-500 text-white font-mono font-bold text-center text-xs focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Costo 1 Final (calculado) */}
                      <td className="px-3 py-2 text-center bg-emerald-950/15">
                        <span className="font-mono font-black text-emerald-300">
                          ${fmtMoneda(m1Final)}
                        </span>
                      </td>

                      {/* Costo 2 (editable) */}
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center">
                          <span className="text-slate-500 mr-1">$</span>
                          <input
                            type="number"
                            min="0"
                            step="25"
                            value={m2Val}
                            onChange={(e) => handleMargenChange(fila.key, 'm2', e.target.value)}
                            className="w-20 px-2 py-1.5 rounded-lg bg-[#0f121d] border border-white/[0.12] focus:border-red-500 text-white font-mono font-bold text-center text-xs focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Costo 2 Final (calculado) */}
                      <td className="px-3 py-2 text-center bg-sky-950/15">
                        <span className="font-mono font-black text-sky-300">
                          ${fmtMoneda(m2Final)}
                        </span>
                      </td>

                      {/* Costo x4 (editable) */}
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center">
                          <span className="text-slate-500 mr-1">$</span>
                          <input
                            type="number"
                            min="0"
                            step="25"
                            value={m4Val}
                            onChange={(e) => handleMargenChange(fila.key, 'm4', e.target.value)}
                            className="w-20 px-2 py-1.5 rounded-lg bg-[#0f121d] border border-white/[0.12] focus:border-red-500 text-white font-mono font-bold text-center text-xs focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Costo x4 Final (calculado) */}
                      <td className="px-3 py-2 text-center bg-amber-950/15">
                        <span className="font-mono font-black text-amber-300">
                          ${fmtMoneda(m4Final)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Nota técnica explicativa */}
          <div className="p-3.5 rounded-xl bg-[#1b2032] border border-white/[0.08] flex items-start gap-3">
            <i className="ri-information-line text-lg text-sky-400 shrink-0 mt-0.5"></i>
            <div className="text-xs text-slate-300 space-y-1">
              <span className="font-bold text-white block">
                Fórmula oficial de cálculo Centro Llantero EmirS:
              </span>
              <p className="text-slate-400 leading-relaxed font-mono text-[11px]">
                • Costo Financiado = Costo con IVA (+16%) × Factor ({factor.toFixed(3)})<br />
                • Precio 1 Llanta = Múltiplo de 5 sup. de [ Costo Financiado + (Costo 1 × Factor) ]<br />
                • Precio Par = Múltiplo de 5 sup. de [ (Costo Financiado + Costo 2 × Factor) × 2 ]<br />
                • Precio Juego (4) = Múltiplo de 5 sup. de [ (Costo Financiado + Costo x4 × Factor) × 4 ]
              </p>
            </div>
          </div>
        </div>

        {/* Pie del Modal con Botones */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-[#1b2032] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleRestaurar}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all"
            title="Restablecer los valores predeterminados de la imagen oficial"
          >
            <i className="ri-restart-line"></i>
            <span>Restaurar Valores Oficiales</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-transparent hover:bg-white/[0.05] text-slate-300 hover:text-white border border-white/[0.1] text-xs font-bold cursor-pointer transition-all"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              className="px-5 py-2 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white text-xs font-black shadow-lg shadow-red-900/40 inline-flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <i className="ri-save-line"></i>
              <span>Guardar Tabulador</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
