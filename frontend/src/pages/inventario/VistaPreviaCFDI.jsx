import {
  ArrowDownTrayIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FingerPrintIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';

const fmt = (n, d = 2) =>
  Number(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

function formatCorreoFecha(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Tarjeta reutilizable de vista previa de factura CFDI 4.0.
 * Se utiliza tanto en la subida manual de XML como en la Bandeja de Gmail.
 */
export default function VistaPreviaCFDI({
  preview,
  origen = null,
  onCancelar,
  onConfirmar,
  loading = false,
  canConfirm = true,
  confirmLabel = 'Confirmar e Importar',
}) {
  if (!preview) return null;

  const correoMeta = preview.correo_origen || origen || {};
  const cfdiUuid = preview.cfdi_uuid || preview.uuid || correoMeta.cfdi_uuid || null;
  const remitente =
    correoMeta.remitente_nombre && correoMeta.remitente_email
      ? `${correoMeta.remitente_nombre} <${correoMeta.remitente_email}>`
      : correoMeta.remitente_email || correoMeta.remitente_nombre || null;
  const asunto = correoMeta.asunto || null;
  const fechaCorreo = formatCorreoFecha(correoMeta.fecha_correo);
  const nombreArchivo = correoMeta.nombre_archivo || preview.nombre_archivo || null;
  const tieneMetadatosDiscretos = Boolean(cfdiUuid || remitente || asunto || nombreArchivo);

  return (
    <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
            <DocumentTextIcon className="h-6 w-6 shrink-0" />
            <span>Vista previa de la factura</span>
          </h3>
          {cfdiUuid && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-purple-200/40 text-xs font-mono text-gray-600"
              title={`UUID CFDI: ${cfdiUuid}`}
            >
              <FingerPrintIcon className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <span>UUID: {cfdiUuid}</span>
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500">Proveedor:</span>
            <strong className="flex items-center gap-1 text-gray-900">
              <BuildingStorefrontIcon className="h-4 w-4 text-purple-500 shrink-0" />
              <span>{preview.proveedor?.nombre || '—'}</span>
            </strong>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500">RFC:</span>
            <span className="font-mono text-gray-800">{preview.proveedor?.rfc || '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500">Factura:</span>
            <span className="font-mono text-gray-800">{preview.numero_factura || '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500">Fecha:</span>
            <span className="text-gray-800">{preview.fecha_compra || '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500">Subtotal:</span>
            <span className="text-gray-800">${fmt(preview.subtotal)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500">Total:</span>
            <strong className="text-gray-900">${fmt(preview.total)}</strong>
          </div>
        </div>

        {tieneMetadatosDiscretos && (remitente || asunto || nombreArchivo) && (
          <div className="mt-3 pt-2.5 border-t border-purple-200/30 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
            {remitente && (
              <span className="inline-flex items-center gap-1.5">
                <EnvelopeIcon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span>Origen: {remitente}</span>
              </span>
            )}
            {asunto && (
              <span className="truncate max-w-md" title={asunto}>
                Asunto: {asunto}
              </span>
            )}
            {fechaCorreo && <span>Recibido: {fechaCorreo}</span>}
            {nombreArchivo && (
              <span className="inline-flex items-center gap-1 font-mono">
                <PaperClipIcon className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span>{nombreArchivo}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {[
                'Código',
                'Descripción',
                'Medida',
                'Marca',
                'Modelo',
                'IC/IV',
                'Cant.',
                'P. Compra (s/IVA)',
                'P. Compra (c/IVA)',
                'P. Venta Sugerido',
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {preview.items?.map((item, i) => {
              const sinIva = Number(item.precio_compra_sin_iva ?? item.precio_compra ?? 0);
              const conIva =
                item.precio_compra_con_iva !== undefined && item.precio_compra_con_iva !== null
                  ? Number(item.precio_compra_con_iva)
                  : Number((sinIva * (1 + Number(item.tasa_iva ?? 0.16))).toFixed(4));
              const icIv = `${item.indice_carga || ''}${item.indice_velocidad || ''}`;

              return (
                <tr key={`${item.codigo || 'item'}-${i}`} className="hover:bg-purple-50">
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{item.codigo}</td>
                  <td className="px-3 py-3 text-gray-700 max-w-xs text-xs">{item.descripcion}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {item.medida ? (
                      <span className="px-2 py-0.5 bg-red-100 text-[#a80008] rounded font-mono text-xs">
                        {item.medida}
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">No detectada</span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium whitespace-nowrap">
                    {item.marca_nombre || '—'}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{item.modelo || '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-center">{icIv || '—'}</td>
                  <td className="px-3 py-3 text-center font-bold">{item.cantidad}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-500 whitespace-nowrap">
                    $
                    {sinIva.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-gray-900 whitespace-nowrap">
                    $
                    {conIva.toLocaleString('es-MX', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    ${fmt(item.precio_venta_sugerido)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-800">
        Las entradas de inventario y los adeudos con el proveedor se guardan con el costo{' '}
        <strong>con IVA</strong>. Los productos nuevos y actualizados calculan su precio de venta
        sugerido sobre el costo con IVA usando el Tabulador de Utilidad según su Rin (financiamiento
        bancario 1.079 + margen Rin redondeado a múltiplo de 5).
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={loading}
          className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        {canConfirm && (
          <button
            type="button"
            onClick={onConfirmar}
            disabled={loading}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Importando…</span>
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="h-4 w-4" />
                <span>{confirmLabel}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
