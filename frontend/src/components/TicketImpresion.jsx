const NEGOCIO = {
  nombre: 'EmirS Centro Llantero',
  direccion: 'Calle 42 #282 por 45, Fracc. Francisco de Montejo',
  telefono: '999 371 8502',
  cierre: '¡Gracias por su preferencia!',
};

const fmtMXN = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (raw) => {
  if (!raw) return '';
  const d = new Date(raw.replace(' ', 'T'));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getMetodoLabel = (metodo, tipoTarjeta) => {
  if (metodo === 'tarjeta') {
    if (tipoTarjeta === 'credito') return 'Tarjeta (Crédito)';
    if (tipoTarjeta === 'debito') return 'Tarjeta (Débito)';
    return 'Tarjeta';
  }
  if (metodo === 'mixto') {
    if (tipoTarjeta === 'credito') return 'Mixto (Efectivo + Tarjeta Crédito)';
    if (tipoTarjeta === 'debito') return 'Mixto (Efectivo + Tarjeta Débito)';
    return 'Mixto (Efectivo + Electrónico)';
  }
  if (metodo === 'transferencia') return 'Transferencia';
  return 'Efectivo';
};

// Todos los estilos son inline para que el tema oscuro de la app no interfiera
// ni en la vista previa del modal ni al imprimir.
const S = {
  wrap: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '16px',
    color: '#000',
    background: '#fff',
    padding: '10px 12px',
    lineHeight: '1.55',
    width: '100%',
    boxSizing: 'border-box',
  },
  logo: {
    display: 'block',
    margin: '0 auto 8px',
    maxWidth: '72%',
    maxHeight: '60px',
    objectFit: 'contain',
  },
  h1: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '20px',
    margin: '3px 0',
  },
  sub: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#333',
    margin: '2px 0',
  },
  hr: {
    border: 'none',
    borderTop: '2px dashed #000',
    margin: '7px 0',
  },
  titulo: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '17px',
    margin: '4px 0',
    letterSpacing: '0.06em',
  },
  folio: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '21px',
    margin: '3px 0',
    letterSpacing: '0.1em',
  },
  voucherBadge: {
    textAlign: 'center',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#000',
    background: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '2px 6px',
    margin: '4px 0',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    margin: '2px 0',
    gap: '6px',
  },
  label: { color: '#444', flexShrink: 0 },
  val: { fontWeight: '600', textAlign: 'right', wordBreak: 'break-word' },
  itemsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 'bold',
    paddingBottom: '3px',
    marginBottom: '0',
    gap: '6px',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    margin: '3px 0',
    gap: '6px',
  },
  itemDesc: { flex: 1, wordBreak: 'break-word' },
  itemNum: { flexShrink: 0, textAlign: 'right', minWidth: '28px' },
  itemAmt: { flexShrink: 0, textAlign: 'right', minWidth: '68px' },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 'bold',
    fontSize: '21px',
    margin: '0 0 3px',
    paddingTop: '4px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '10px',
    fontSize: '13px',
    color: '#444',
    paddingBottom: '6px',
  },
};

export default function TicketImpresion({ venta }) {
  if (!venta) return null;

  const {
    folio,
    fecha,
    empleado_nombre,
    cliente_nombre,
    detalles = [],
    subtotal,
    descuento,
    total,
    metodo_pago,
    tipo_tarjeta,
    num_voucher_efectivo,
    num_voucher_tarjeta,
    num_voucher_transferencia,
    monto_efectivo,
    monto_electronico,
    num_operacion,
    num_referencia,
  } = venta;

  const efectivoN = parseFloat(monto_efectivo || 0);
  const electronicoN = parseFloat(monto_electronico || 0);
  const totalN = parseFloat(total || 0);
  const descuentoN = parseFloat(descuento || 0);
  const cambio = Math.max(0, efectivoN + electronicoN - totalN);

  const showEfectivo = metodo_pago === 'efectivo' || metodo_pago === 'mixto';
  const showElectronico = metodo_pago === 'tarjeta' || metodo_pago === 'transferencia' || metodo_pago === 'mixto';

  return (
    <div id="ticket-print" style={S.wrap}>
      {/* Logo */}
      <img src="/images/logo_hd.png" alt={NEGOCIO.nombre} style={S.logo} />

      {/* Encabezado */}
      <div style={S.h1}>{NEGOCIO.nombre}</div>
      <div style={S.sub}>{NEGOCIO.direccion}</div>
      <div style={S.sub}>Tel: {NEGOCIO.telefono}</div>
      <hr style={S.hr} />

      {/* Título y folio */}
      <div style={S.titulo}>TICKET DE VENTA</div>
      <div style={S.folio}>{folio}</div>

      {/* Vouchers / Contadores Diarios */}
      {num_voucher_efectivo != null && (
        <div style={S.voucherBadge}>TICKET EFECTIVO #{num_voucher_efectivo}</div>
      )}
      {num_voucher_tarjeta != null && (
        <div style={S.voucherBadge}>
          VOUCHER TARJETA #{num_voucher_tarjeta} {tipo_tarjeta ? `(${tipo_tarjeta.toUpperCase()})` : ''}
        </div>
      )}
      {num_voucher_transferencia != null && (
        <div style={S.voucherBadge}>COMPROBANTE TRANSFERENCIA #{num_voucher_transferencia}</div>
      )}

      <hr style={S.hr} />

      {/* Datos de la venta */}
      <div style={S.row}>
        <span style={S.label}>Fecha:</span>
        <span style={S.val}>{fmtFecha(fecha)}</span>
      </div>
      <div style={S.row}>
        <span style={S.label}>Vendedor:</span>
        <span style={{ ...S.val, maxWidth: '62%' }}>{empleado_nombre || '—'}</span>
      </div>
      <div style={S.row}>
        <span style={S.label}>Cliente:</span>
        <span style={{ ...S.val, maxWidth: '62%' }}>{cliente_nombre || 'Público General'}</span>
      </div>
      <hr style={S.hr} />

      {/* Ítems */}
      <div style={S.itemsHeader}>
        <span style={{ flex: 1 }}>Descripción</span>
        <span style={S.itemNum}>Cant</span>
        <span style={S.itemAmt}>Importe</span>
      </div>
      <div style={{ height: '2px', background: '#000', margin: '0 0 4px' }} />
      {detalles.map((d, i) => (
        <div key={i} style={S.itemRow}>
          <span style={S.itemDesc}>{d.descripcion}</span>
          <span style={S.itemNum}>{d.cantidad}</span>
          <span style={S.itemAmt}>${fmtMXN(d.subtotal)}</span>
        </div>
      ))}
      <hr style={S.hr} />

      {/* Totales */}
      <div style={S.row}>
        <span style={S.label}>Subtotal:</span>
        <span style={S.val}>${fmtMXN(subtotal)}</span>
      </div>
      {descuentoN > 0 && (
        <div style={S.row}>
          <span style={S.label}>Descuento:</span>
          <span style={S.val}>-${fmtMXN(descuentoN)}</span>
        </div>
      )}
      <div style={{ height: '3px', background: '#000', margin: '5px 0 0' }} />
      <div style={S.totalRow}>
        <span>TOTAL:</span>
        <span>${fmtMXN(total)}</span>
      </div>
      <hr style={S.hr} />

      {/* Forma de pago */}
      <div style={{ ...S.titulo, fontSize: '15px', margin: '3px 0' }}>
        {getMetodoLabel(metodo_pago, tipo_tarjeta)}
      </div>
      {showEfectivo && (
        <div style={S.row}>
          <span style={S.label}>Efectivo:</span>
          <span style={S.val}>${fmtMXN(efectivoN)}</span>
        </div>
      )}
      {cambio > 0 && (
        <div style={{ ...S.row, fontWeight: 'bold' }}>
          <span>Cambio:</span>
          <span>${fmtMXN(cambio)}</span>
        </div>
      )}
      {showElectronico && electronicoN > 0 && (
        <div style={S.row}>
          <span style={S.label}>
            {metodo_pago === 'tarjeta'
              ? `Tarjeta ${tipo_tarjeta ? `(${tipo_tarjeta === 'credito' ? 'Crédito' : 'Débito'}):` : ':'}`
              : 'Transf.:'}
          </span>
          <span style={S.val}>${fmtMXN(electronicoN)}</span>
        </div>
      )}
      {num_operacion && (
        <div style={S.row}>
          <span style={S.label}>Núm. Oper.:</span>
          <span style={{ ...S.val, maxWidth: '65%' }}>{num_operacion}</span>
        </div>
      )}
      {num_referencia && (
        <div style={S.row}>
          <span style={S.label}>Ref.:</span>
          <span style={{ ...S.val, maxWidth: '65%' }}>{num_referencia}</span>
        </div>
      )}
      <hr style={S.hr} />

      {/* Footer */}
      <div style={S.footer}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{NEGOCIO.cierre}</div>
        <div style={{ marginTop: '2px' }}>{NEGOCIO.nombre}</div>
      </div>
    </div>
  );
}
