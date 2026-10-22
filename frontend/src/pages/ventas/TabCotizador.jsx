import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coincideProductoInteligente, detectarMedidaFormateada } from '../../lib/medidaUtils';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GAMA_META = {
  economica: {
    label: 'Gama Económica',
    badgeCls: 'bg-[#1e2438] text-white border-slate-600',
    icon: 'ri-shield-line',
  },
  media: {
    label: 'Gama Media / Calidad',
    badgeCls: 'bg-[#1e2438] text-white border-slate-600',
    icon: 'ri-medal-line',
  },
  premium: {
    label: 'Gama Premium',
    badgeCls: 'bg-[#1e2438] text-white border-slate-600',
    icon: 'ri-vip-crown-line',
  },
};

const ESTADO_COT_META = {
  vigente:   { label: 'Vigente',   cls: 'bg-[#1e2438] text-emerald-300 border-emerald-500/40' },
  aceptada:  { label: 'Aceptada',  cls: 'bg-[#1e2438] text-sky-300 border-sky-500/40' },
  vencida:   { label: 'Vencida',   cls: 'bg-[#1e2438] text-slate-300 border-slate-600' },
  cancelada: { label: 'Cancelada', cls: 'bg-[#1e2438] text-red-300 border-red-500/40' },
};

const crearOpcionVacia = (gama = 'media', medidaDefault = '', recomend = false) => ({
  _uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  gama,
  origen: 'sobre_pedido', // 'stock' | 'sobre_pedido'
  producto: null,
  producto_obj: null,
  proveedor: '',
  proveedor_nombre_libre: '',
  marca: '',
  modelo: '',
  medida: medidaDefault,
  tiempo_entrega: '2-3 Horas',
  costo_proveedor: '',
  tipo_margen: 'porcentaje', // 'porcentaje' | 'monto_fijo'
  valor_margen: '25',
  precio_unitario_publico: '',
  recomendada: recomend,
});

function calcularPrecioConMargen(costo, tipoMargen, valorMargen) {
  const c = parseFloat(costo) || 0;
  const v = parseFloat(valorMargen) || 0;
  if (c <= 0) return 0;
  if (tipoMargen === 'porcentaje') {
    return Math.round(c * (1 + v / 100) * 100) / 100;
  }
  return Math.round((c + v) * 100) / 100;
}

export default function TabCotizador({ onCargarAlPOS }) {
  const queryClient = useQueryClient();

  // ─── Estado del formulario de cotización ─────────────────────────────────
  const [clienteId, setClienteId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [vehiculoReferencia, setVehiculoReferencia] = useState('');
  const [medidaSolicitada, setMedidaSolicitada] = useState('');
  const [cantidadRequerida, setCantidadRequerida] = useState(4);
  const [vigenciaDias, setVigenciaDias] = useState(5);

  const [incluyeMontaje, setIncluyeMontaje] = useState(true);
  const [incluyeBalanceo, setIncluyeBalanceo] = useState(true);
  const [incluyeValvula, setIncluyeValvula] = useState(true);
  const [incluyeAlineacion, setIncluyeAlineacion] = useState(false);

  // Servicios adicionales personalizados o del catálogo
  const [serviciosAdicionales, setServiciosAdicionales] = useState([]);
  const [mostrarAgregarServicio, setMostrarAgregarServicio] = useState(false);
  const [servicioCatalogoSel, setServicioCatalogoSel] = useState('');
  const [servicioPersonalizado, setServicioPersonalizado] = useState('');

  const [notasCliente, setNotasCliente] = useState('');
  const [notasInternas, setNotasInternas] = useState('');

  // Opciones comparativas
  const [opciones, setOpciones] = useState(() => [
    crearOpcionVacia('economica', '', false),
    crearOpcionVacia('media', '', true),
    crearOpcionVacia('premium', '', false),
  ]);

  // Modal selector de stock para una fila
  const [filaSelectorStock, setFilaSelectorStock] = useState(null);
  const [busquedaStockModal, setBusquedaStockModal] = useState('');

  // Mensajes y cotización recién guardada
  const [errorMsg, setErrorMsg] = useState(null);
  const [cotizacionActiva, setCotizacionActiva] = useState(null);
  const [descargandoId, setDescargandoId] = useState(null);
  const [busquedaHistorial, setBusquedaHistorial] = useState('');

  // ─── Queries de catálogos e historial ────────────────────────────────────
  const toArr = async (r) => (r.ok ? r.json().then((d) => (Array.isArray(d) ? d : d.results || [])) : []);

  const { data: clientes = [] } = useQuery({
    queryKey: ['pos-clientes'],
    queryFn: () => fetch('/api/clientes/clientes/', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['pos-productos'],
    queryFn: () => fetch('/api/inventario/productos/?activos=true', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogoServicios = [] } = useQuery({
    queryKey: ['pos-servicios-catalogo'],
    queryFn: () => fetch('/api/ventas/servicios/?activos=true', { headers: tok() }).then(toArr),
    staleTime: 5 * 60 * 1000,
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ['inventario-proveedores'],
    queryFn: () => fetch('/api/inventario/proveedores/?activo=true', { headers: tok() }).then(toArr),
    staleTime: 10 * 60 * 1000,
  });

  const { data: historial = [], isLoading: loadingHistorial } = useQuery({
    queryKey: ['ventas-cotizaciones'],
    queryFn: () => fetch('/api/ventas/cotizaciones/', { headers: tok() }).then(toArr),
  });

  const clienteSeleccionadoObj = useMemo(
    () => clientes.find((c) => String(c.id) === String(clienteId)) || null,
    [clientes, clienteId]
  );

  const medidaDetectadaPrincipal = useMemo(
    () => detectarMedidaFormateada(medidaSolicitada),
    [medidaSolicitada]
  );

  const medidaEfectiva = medidaDetectadaPrincipal || medidaSolicitada.trim();

  // ─── Handlers de Cliente y Vehículo ──────────────────────────────────────
  const handleSelectCliente = (id) => {
    setClienteId(id);
    setVehiculoId('');
    const cli = clientes.find((c) => String(c.id) === String(id));
    if (cli) {
      setNombreCliente(cli.nombre || '');
      setTelefonoCliente(cli.telefono || '');
      if (cli.vehiculos && cli.vehiculos.length === 1) {
        const v = cli.vehiculos[0];
        setVehiculoId(String(v.id));
        setVehiculoReferencia(`${v.marca} ${v.modelo} ${v.año}${v.placas ? ` (${v.placas})` : ''}`);
        const medVeh = v.medida_llanta_delantera || v.medida_llantas || '';
        if (medVeh && !medidaSolicitada) {
          setMedidaSolicitada(medVeh);
        }
      }
    }
  };

  const handleSelectVehiculo = (vId) => {
    setVehiculoId(vId);
    const v = (clienteSeleccionadoObj?.vehiculos || []).find((x) => String(x.id) === String(vId));
    if (v) {
      setVehiculoReferencia(`${v.marca} ${v.modelo} ${v.año}${v.placas ? ` (${v.placas})` : ''}`);
      const medVeh = v.medida_llanta_delantera || v.medida_llantas || '';
      if (medVeh) {
        setMedidaSolicitada(medVeh);
      }
    }
  };

  // ─── Handlers de Opciones y Calculadora en Vivo ──────────────────────────
  const agregarOpcion = (gama = 'media') => {
    setOpciones((prev) => [...prev, crearOpcionVacia(gama, medidaEfectiva, false)]);
  };

  const eliminarOpcion = (uid) => {
    if (opciones.length <= 1) return;
    setOpciones((prev) => prev.filter((o) => o._uid !== uid));
  };

  const actualizarOpcion = (uid, cambios) => {
    setOpciones((prev) =>
      prev.map((op) => {
        if (op._uid !== uid) return op;
        const next = { ...op, ...cambios };

        // Si cambió costo, tipo_margen o valor_margen (y no fue edición directa de precio_unitario_publico)
        if (
          ('costo_proveedor' in cambios || 'tipo_margen' in cambios || 'valor_margen' in cambios) &&
          !('precio_unitario_publico' in cambios)
        ) {
          const calc = calcularPrecioConMargen(next.costo_proveedor, next.tipo_margen, next.valor_margen);
          next.precio_unitario_publico = calc > 0 ? String(calc) : next.precio_unitario_publico;
        }
        return next;
      })
    );
  };

  const redondearPrecioOpcion = (uid, multiplo = 50) => {
    setOpciones((prev) =>
      prev.map((op) => {
        if (op._uid !== uid) return op;
        const actual = parseFloat(op.precio_unitario_publico) || 0;
        if (actual <= 0) return op;
        const redondeado = Math.ceil(actual / multiplo) * multiplo;
        return { ...op, precio_unitario_publico: String(redondeado) };
      })
    );
  };

  const seleccionarProductoDeStock = (uid, prod) => {
    const costoBase = parseFloat(prod.ultimo_precio_compra || prod.precio_compra || 0);
    const precioVentaLista = parseFloat(prod.precio_descuento || prod.precio_venta || 0);
    const costoEstimado = costoBase > 0 ? costoBase : Math.round(precioVentaLista * 0.75 * 100) / 100;
    const marcaNom = typeof prod.marca === 'string' ? prod.marca : prod.marca?.nombre || prod.marca_nombre || '';

    // Calcular margen implícito si hay precio de lista y costo
    let valorMargenCalc = '25';
    if (costoEstimado > 0 && precioVentaLista > costoEstimado) {
      valorMargenCalc = String(Math.round(((precioVentaLista - costoEstimado) / costoEstimado) * 1000) / 10);
    }

    setOpciones((prev) =>
      prev.map((op) => {
        if (op._uid !== uid) return op;
        return {
          ...op,
          origen: 'stock',
          producto: prod.id,
          producto_obj: prod,
          marca: marcaNom,
          modelo: prod.modelo || prod.descripcion_completa || '',
          medida: prod.medida || medidaEfectiva,
          tiempo_entrega: 'Inmediata (En Stock)',
          costo_proveedor: costoEstimado > 0 ? String(costoEstimado) : '',
          tipo_margen: 'porcentaje',
          valor_margen: valorMargenCalc,
          precio_unitario_publico: precioVentaLista > 0 ? String(precioVentaLista) : '',
        };
      })
    );
    setFilaSelectorStock(null);
  };

  // Productos filtrados para el modal de "Tomar de Stock"
  const productosFiltradosModal = useMemo(() => {
    const q = busquedaStockModal.trim() || medidaEfectiva;
    if (!q) return productos;
    return productos.filter((p) => coincideProductoInteligente(p, q));
  }, [productos, busquedaStockModal, medidaEfectiva]);

  const medidaDetectadaModal = useMemo(
    () => detectarMedidaFormateada(busquedaStockModal),
    [busquedaStockModal]
  );

  // ─── Servicios Adicionales en "¿Qué incluye la cotización?" ──────────────
  const handleAgregarServicioAdicional = (nombreRaw) => {
    const limpio = (nombreRaw || '').trim();
    if (!limpio) return;
    setServiciosAdicionales((prev) => {
      if (prev.some((s) => s.toLowerCase() === limpio.toLowerCase())) return prev;
      return [...prev, limpio];
    });
    setServicioCatalogoSel('');
    setServicioPersonalizado('');
  };

  const handleQuitarServicioAdicional = (nombre) => {
    setServiciosAdicionales((prev) => prev.filter((s) => s !== nombre));
  };

  // ─── Guardar Cotización ──────────────────────────────────────────────────
  const guardarCotizacionMut = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      const opcionesValidas = opciones.filter(
        (o) => o.marca.trim() && parseFloat(o.precio_unitario_publico) > 0
      );
      if (opcionesValidas.length === 0) {
        throw new Error('Completa al menos una opción con Marca y Precio Unitario Público mayor a $0.');
      }

      const cant = Math.max(1, parseInt(cantidadRequerida, 10) || 4);
      const medFinal = medidaDetectadaPrincipal || medidaSolicitada.trim() || opcionesValidas[0].medida || '';

      const payload = {
        cliente: clienteId ? parseInt(clienteId, 10) : null,
        vehiculo: vehiculoId ? parseInt(vehiculoId, 10) : null,
        nombre_cliente: nombreCliente.trim() || 'Cliente de Mostrador',
        telefono_cliente: telefonoCliente.trim(),
        vehiculo_referencia: vehiculoReferencia.trim(),
        medida_solicitada: medFinal,
        cantidad_requerida: cant,
        vigencia_dias: Math.max(1, parseInt(vigenciaDias, 10) || 5),
        incluye_montaje: incluyeMontaje,
        incluye_balanceo: incluyeBalanceo,
        incluye_valvula: incluyeValvula,
        incluye_alineacion: incluyeAlineacion,
        servicios_adicionales: serviciosAdicionales,
        notas_cliente: notasCliente.trim(),
        notas_internas: notasInternas.trim(),
        opciones: opcionesValidas.map((o) => {
          const pu = parseFloat(o.precio_unitario_publico) || 0;
          const medOp = detectarMedidaFormateada(o.medida) || o.medida.trim() || medFinal || 'S/M';
          return {
            gama: o.gama,
            origen: o.origen,
            producto: o.origen === 'stock' && o.producto ? parseInt(o.producto, 10) : null,
            proveedor: o.proveedor ? parseInt(o.proveedor, 10) : null,
            proveedor_nombre_libre: o.proveedor_nombre_libre.trim(),
            marca: o.marca.trim(),
            modelo: o.modelo.trim(),
            medida: medOp,
            tiempo_entrega: o.tiempo_entrega.trim() || 'Inmediata',
            costo_proveedor: parseFloat(o.costo_proveedor) || 0,
            tipo_margen: o.tipo_margen,
            valor_margen: parseFloat(o.valor_margen) || 0,
            precio_unitario_publico: pu,
            precio_par: Math.round(pu * 2 * 100) / 100,
            precio_juego_4: Math.round(pu * 4 * 100) / 100,
            precio_cantidad_solicitada: Math.round(pu * cant * 100) / 100,
            recomendada: Boolean(o.recomendada),
          };
        }),
      };

      const res = await fetch('/api/ventas/cotizaciones/', {
        method: 'POST',
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err === 'object'
            ? Object.entries(err)
                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : JSON.stringify(v)}`)
                .join(' | ')
            : 'Error al guardar la cotización'
        );
      }
      return res.json();
    },
    onSuccess: (cot) => {
      setCotizacionActiva({
        ...cot,
        servicios_adicionales: cot.servicios_adicionales || serviciosAdicionales,
      });
      queryClient.invalidateQueries({ queryKey: ['ventas-cotizaciones'] });
    },
    onError: (e) => setErrorMsg(e.message),
  });

  // ─── Descargar PDF Cliente (Sin Costos ni Márgenes) ──────────────────────
  const descargarPDFCotizacion = async (cot) => {
    setDescargandoId(cot.id);
    try {
      const res = await fetch(`/api/ventas/cotizaciones/${cot.id}/pdf/`, { headers: tok() });
      if (!res.ok) throw new Error('No se pudo generar el PDF de la cotización');
      const blob = await res.blob();
      const fileName = `cotizacion_${cot.folio}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setDescargandoId(null);
    }
  };

  // ─── Enviar Comparativa por WhatsApp (Sin datos internos jamás) ──────────
  const enviarWhatsAppCotizacion = (cot) => {
    const telRaw = cot.telefono_cliente || '';
    let telLimpio = telRaw.replace(/\D/g, '');
    if (telLimpio.length === 10) telLimpio = `52${telLimpio}`;

    const cant = cot.cantidad_requerida || 4;
    const incluyeList = [];
    if (cot.incluye_montaje) incluyeList.push('Montaje profesional');
    if (cot.incluye_balanceo) incluyeList.push('Balanceo computarizado');
    if (cot.incluye_valvula) incluyeList.push('Válvula nueva');
    if (cot.incluye_alineacion) incluyeList.push('Alineación');

    const extras =
      Array.isArray(cot.servicios_adicionales) && cot.servicios_adicionales.length > 0
        ? cot.servicios_adicionales
        : cot.id === cotizacionActiva?.id
        ? serviciosAdicionales
        : [];
    extras.forEach((srv) => {
      if (srv && !incluyeList.includes(srv)) incluyeList.push(srv);
    });

    const lineasOpciones = (cot.opciones || []).map((op, i) => {
      const gamaNombre =
        op.gama === 'economica' ? 'Económica' : op.gama === 'premium' ? 'Premium' : 'Calidad Media';
      const rec = op.recomendada ? ' [RECOMENDADA]' : '';
      const pu = fmt(op.precio_unitario_publico);
      const par = fmt(op.precio_par || op.precio_unitario_publico * 2);
      const j4 = fmt(op.precio_juego_4 || op.precio_unitario_publico * 4);
      return (
        `${i + 1}. *${op.marca} ${op.modelo || ''}* (${op.medida}) — _${gamaNombre}_${rec}\n` +
        `   • C/U: *$${pu}* | Par (2): *$${par}* | Juego (4): *$${j4}*\n` +
        `   • Entrega: ${op.tiempo_entrega || 'Inmediata'}`
      );
    });

    const texto = [
      `Hola *${cot.nombre_cliente || 'Cliente'}*, le compartimos su cotización comparativa de *Centro Llantero EmirS* (Folio *${cot.folio}*):`,
      cot.vehiculo_referencia ? `Vehículo: *${cot.vehiculo_referencia}*` : null,
      `Medida solicitada: *${cot.medida_solicitada || 'Varias'}* (${cant} llanta${cant > 1 ? 's' : ''})`,
      '',
      '*OPCIONES DISPONIBLES:*',
      ...lineasOpciones,
      '',
      incluyeList.length > 0 ? `*Incluye:* ${incluyeList.join(', ')}.` : null,
      cot.notas_cliente ? `*Nota:* ${cot.notas_cliente}` : null,
      `_Cotización vigente por ${cot.vigencia_dias || 5} días._`,
    ]
      .filter((x) => x !== null)
      .join('\n');

    const url = telLimpio
      ? `https://wa.me/${telLimpio}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ─── Cambiar Estado de Cotización ────────────────────────────────────────
  const cambiarEstadoMut = useMutation({
    mutationFn: async ({ id, estado }) => {
      const res = await fetch(`/api/ventas/cotizaciones/${id}/cambiar_estado/`, {
        method: 'POST',
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error('Error al cambiar estado');
      return res.json();
    },
    onSuccess: (updated) => {
      if (cotizacionActiva?.id === updated.id) setCotizacionActiva(updated);
      queryClient.invalidateQueries({ queryKey: ['ventas-cotizaciones'] });
    },
  });

  // ─── Cargar Opción al POS ────────────────────────────────────────────────
  const handleEnviarOpcionAlPOS = (op, cantidadCot = cantidadRequerida, clienteCot = clienteId, vehiculoCot = vehiculoId) => {
    const prodId = op.producto || op.producto_obj?.id;
    const prodEncontrado = op.producto_obj || productos.find((p) => p.id === prodId);
    if (!prodEncontrado) {
      setErrorMsg('Esta opción es Sobre Pedido y aún no está vinculada a un producto en stock del inventario.');
      return;
    }
    if (onCargarAlPOS) {
      onCargarAlPOS({
        producto: prodEncontrado,
        cantidad: Math.max(1, parseInt(cantidadCot, 10) || 1),
        precio_unitario: parseFloat(op.precio_unitario_publico) || parseFloat(prodEncontrado.precio_venta) || 0,
        clienteId: clienteCot || '',
        vehiculoId: vehiculoCot || '',
      });
    }
  };

  const historialFiltrado = useMemo(() => {
    if (!busquedaHistorial.trim()) return historial;
    const q = busquedaHistorial.toLowerCase();
    return historial.filter(
      (c) =>
        (c.folio || '').toLowerCase().includes(q) ||
        (c.nombre_cliente || '').toLowerCase().includes(q) ||
        (c.medida_solicitada || '').toLowerCase().includes(q) ||
        (c.vehiculo_referencia || '').toLowerCase().includes(q)
    );
  }, [historial, busquedaHistorial]);

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <i className="ri-error-warning-line text-red-600 font-bold text-lg"></i>
            <span>{errorMsg}</span>
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      )}

      {/* Banner de Cotización Guardada Lista para Enviar */}
      {cotizacionActiva && (
        <div className="bg-emerald-950 text-white border-2 border-emerald-500 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500 text-white shrink-0">
              <i className="ri-checkbox-circle-line text-2xl"></i>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                  Cotización Lista para el Cliente
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-white/15 font-mono font-black text-xs text-white">
                  {cotizacionActiva.folio}
                </span>
              </div>
              <p className="text-sm font-bold mt-1">
                {cotizacionActiva.nombre_cliente} • Medida: {cotizacionActiva.medida_solicitada} ({cotizacionActiva.cantidad_requerida} llantas)
              </p>
              <p className="text-xs text-emerald-200 mt-0.5">
                El PDF y el mensaje de WhatsApp ocultan automáticamente costos de proveedor y márgenes de ganancia.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => descargarPDFCotizacion(cotizacionActiva)}
              disabled={descargandoId === cotizacionActiva.id}
              className="px-4 py-2.5 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <i className="ri-file-pdf-2-line text-base"></i>
              <span>{descargandoId === cotizacionActiva.id ? 'Generando PDF...' : 'Descargar PDF Cliente'}</span>
            </button>
            <button
              type="button"
              onClick={() => enviarWhatsAppCotizacion(cotizacionActiva)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <i className="ri-whatsapp-line text-base"></i>
              <span>Enviar Comparativa por WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setCotizacionActiva(null)}
              className="p-2 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-900"
              title="Cerrar aviso"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>
        </div>
      )}

      {/* ══ SECCIÓN 1: DATOS DEL CLIENTE Y MEDIDA SOLICITADA ════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-50 text-[#df000a]">
              <i className="ri-user-search-line text-lg"></i>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-gray-900">
                1. Datos del Cliente, Vehículo y Medida Solicitada
              </h2>
              <p className="text-xs text-gray-500">
                Selecciona un cliente registrado o escribe sus datos libres para enviarle su comparativa
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Selector cliente registrado */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Cliente Registrado (Opcional)
            </label>
            <select
              value={clienteId}
              onChange={(e) => handleSelectCliente(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]"
            >
              <option value="">— Captura libre / Mostrador —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.telefono})
                </option>
              ))}
            </select>
          </div>

          {/* Nombre del cliente */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Nombre del Cliente *
            </label>
            <input
              type="text"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]"
            />
          </div>

          {/* Teléfono WhatsApp */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Teléfono (WhatsApp)
            </label>
            <div className="relative">
              <i className="ri-whatsapp-line text-emerald-600 absolute left-3 top-2.5"></i>
              <input
                type="tel"
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(e.target.value)}
                placeholder="10 dígitos (ej. 9991234567)"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#df000a]"
              />
            </div>
          </div>

          {/* Vehículo / Placas */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Vehículo / Placas de Referencia
            </label>
            {clienteSeleccionadoObj?.vehiculos?.length > 0 ? (
              <select
                value={vehiculoId}
                onChange={(e) => handleSelectVehiculo(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]"
              >
                <option value="">— Seleccionar vehículo del cliente —</option>
                {clienteSeleccionadoObj.vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.marca} {v.modelo} {v.año} {v.placas ? `(${v.placas})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={vehiculoReferencia}
                onChange={(e) => setVehiculoReferencia(e.target.value)}
                placeholder="Ej. Nissan Versa 2020 (YZA-123)"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#df000a]"
              />
            )}
          </div>

          {/* Medida Solicitada Inteligente */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Medida Solicitada (Soporta escritura rápida ej. 2055516) *
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <i className="ri-focus-3-line text-[#df000a] absolute left-3 top-2.5"></i>
                <input
                  type="text"
                  value={medidaSolicitada}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMedidaSolicitada(val);
                    const det = detectarMedidaFormateada(val) || val;
                    setOpciones((prev) =>
                      prev.map((op) => (!op.medida || op.medida === medidaSolicitada ? { ...op, medida: det } : op))
                    );
                  }}
                  placeholder="Escribe 2055516 o 205/55 R16..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm font-mono font-bold text-gray-900 focus:ring-2 focus:ring-[#df000a]"
                />
              </div>
              {medidaDetectadaPrincipal && medidaSolicitada !== medidaDetectadaPrincipal && (
                <button
                  type="button"
                  onClick={() => setMedidaSolicitada(medidaDetectadaPrincipal)}
                  className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-[#df000a] text-xs font-black whitespace-nowrap hover:bg-red-100 cursor-pointer flex items-center gap-1"
                >
                  <i className="ri-magic-line"></i>
                  <span>Medida detectada: {medidaDetectadaPrincipal}</span>
                </button>
              )}
            </div>
          </div>

          {/* Cantidad Cotizada (Selector Rápido 1, 2, 4 u otra) */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Cantidad Cotizada (Llantas)
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCantidadRequerida(n)}
                  className={`px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                    Number(cantidadRequerida) === n
                      ? 'bg-red-600 text-white border-red-500 shadow-xs'
                      : 'bg-[#1e2438] text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {n} {n === 1 ? 'pza' : 'pzas'}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="40"
                value={cantidadRequerida}
                onChange={(e) => setCantidadRequerida(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-center font-mono font-bold text-sm focus:ring-2 focus:ring-[#df000a]"
                title="Otra cantidad"
              />
            </div>
          </div>

          {/* Vigencia en días */}
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
              Vigencia (Días)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={vigenciaDias}
              onChange={(e) => setVigenciaDias(parseInt(e.target.value, 10) || 5)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-[#df000a]"
            />
          </div>
        </div>

        {/* Checkboxes: ¿Qué incluye la cotización? + Botón Agregar Servicio */}
        <div className="pt-3 border-t border-gray-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-black uppercase text-slate-300 flex items-center gap-1.5 mr-1">
                <i className="ri-tools-line text-[#df000a]"></i>
                ¿Qué incluye la cotización?
              </span>
              {[
                { label: 'Montaje', val: incluyeMontaje, set: setIncluyeMontaje },
                { label: 'Balanceo', val: incluyeBalanceo, set: setIncluyeBalanceo },
                { label: 'Válvula Nueva', val: incluyeValvula, set: setIncluyeValvula },
                { label: 'Alineación', val: incluyeAlineacion, set: setIncluyeAlineacion },
              ].map((item) => (
                <label
                  key={item.label}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer select-none transition-colors ${
                    item.val
                      ? 'bg-red-600/20 border-red-500/40 text-red-300'
                      : 'bg-[#1e2438] border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.val}
                    onChange={(e) => item.set(e.target.checked)}
                    className="accent-[#df000a] w-3.5 h-3.5"
                  />
                  <span>{item.label}</span>
                </label>
              ))}

              {/* Chips de servicios adicionales */}
              {serviciosAdicionales.map((srv) => (
                <span
                  key={srv}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-red-600/20 border-red-500/40 text-red-300 text-xs font-bold"
                >
                  <i className="ri-checkbox-circle-fill text-red-400"></i>
                  <span>{srv}</span>
                  <button
                    type="button"
                    onClick={() => handleQuitarServicioAdicional(srv)}
                    className="text-red-300 hover:text-white ml-0.5 cursor-pointer"
                    title="Quitar servicio de la cotización"
                  >
                    <i className="ri-close-line text-sm"></i>
                  </button>
                </span>
              ))}

              {/* Botón + Agregar servicio */}
              <button
                type="button"
                onClick={() => setMostrarAgregarServicio((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold cursor-pointer transition-colors"
              >
                <i className="ri-add-circle-line text-sm"></i>
                <span>+ Agregar servicio</span>
              </button>
            </div>
          </div>

          {/* Panel desplegable para elegir servicio del catálogo o escribir uno personalizado */}
          {mostrarAgregarServicio && (
            <div className="bg-[#161a29] border border-white/[0.08] rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Elegir del Catálogo de Servicios
                </label>
                <div className="flex gap-2">
                  <select
                    value={servicioCatalogoSel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setServicioCatalogoSel(val);
                      if (val) handleAgregarServicioAdicional(val);
                    }}
                    className="w-full bg-[#1e2438] text-white border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="">— Seleccionar servicio del catálogo —</option>
                    {catalogoServicios.map((s) => (
                      <option key={s.id} value={s.nombre}>
                        {s.nombre} {s.precio ? `($${fmt(s.precio)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  O Escribir Servicio Personalizado
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={servicioPersonalizado}
                    onChange={(e) => setServicioPersonalizado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAgregarServicioAdicional(servicioPersonalizado);
                      }
                    }}
                    placeholder="Ej. Rotación, Inflado con Nitrógeno, Revisión de suspensión..."
                    className="flex-1 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleAgregarServicioAdicional(servicioPersonalizado)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setMostrarAgregarServicio(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                    title="Cerrar"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ SECCIÓN 2: CONSTRUCTOR DE MARCAS Y CALCULADORA DE MARGEN ════════ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30">
              <i className="ri-calculator-line text-lg"></i>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-gray-900">
                2. Opciones de Marcas y Calculadora Confidencial de Utilidad
              </h2>
              <p className="text-xs text-gray-500">
                Combina llantas de tu Stock o Sobre Pedido con Proveedor. Los costos y ganancias son 100% internos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => agregarOpcion('economica')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <i className="ri-add-line"></i> + Opción Económica
            </button>
            <button
              type="button"
              onClick={() => agregarOpcion('media')}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <i className="ri-add-line"></i> + Opción Gama Media
            </button>
            <button
              type="button"
              onClick={() => agregarOpcion('premium')}
              className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <i className="ri-add-line"></i> + Opción Premium
            </button>
          </div>
        </div>

        {/* Lista de Opciones */}
        <div className="space-y-4">
          {opciones.map((op, index) => {
            const costoNum = parseFloat(op.costo_proveedor) || 0;
            const precioUnitNum = parseFloat(op.precio_unitario_publico) || 0;
            const precioParNum = precioUnitNum * 2;
            const precioJuego4Num = precioUnitNum * 4;
            const gananciaUnit = precioUnitNum - costoNum;
            const cant = Math.max(1, parseInt(cantidadRequerida, 10) || 4);
            const gananciaTotal = gananciaUnit * cant;

            return (
              <div
                key={op._uid}
                className={`rounded-2xl border p-4 transition-all space-y-3 bg-[#161a29] ${
                  op.recomendada
                    ? 'border-[#df000a] shadow-sm'
                    : 'border-white/[0.08]'
                }`}
              >
                {/* Barra superior de la opción */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono font-black text-xs">
                      Opción #{index + 1}
                    </span>

                    {/* Selector de Gama */}
                    <select
                      value={op.gama}
                      onChange={(e) => actualizarOpcion(op._uid, { gama: e.target.value })}
                      className="px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer bg-[#1e2438] text-white border-slate-600"
                    >
                      <option value="economica">Gama Económica</option>
                      <option value="media">Gama Media / Calidad</option>
                      <option value="premium">Gama Premium</option>
                    </select>

                    {/* Botón Tomar de Stock vs Sobre Pedido */}
                    <button
                      type="button"
                      onClick={() => {
                        setBusquedaStockModal(medidaEfectiva || op.medida || '');
                        setFilaSelectorStock(op._uid);
                      }}
                      className={`px-3 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        op.origen === 'stock'
                          ? 'bg-red-600 text-white border-red-500'
                          : 'bg-[#1e2438] text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <i className="ri-archive-drawer-line"></i>
                      <span>Tomar de Stock</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        actualizarOpcion(op._uid, {
                          origen: 'sobre_pedido',
                          producto: null,
                          producto_obj: null,
                          tiempo_entrega: op.tiempo_entrega === 'Inmediata (En Stock)' ? '2-3 Horas' : op.tiempo_entrega,
                        })
                      }
                      className={`px-3 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        op.origen === 'sobre_pedido'
                          ? 'bg-red-600 text-white border-red-500'
                          : 'bg-[#1e2438] text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <i className="ri-truck-line"></i>
                      <span>Sobre Pedido con Proveedor</span>
                    </button>

                    {op.origen === 'stock' && op.producto_obj && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                        <i className="ri-check-double-line"></i>
                        Stock actual: {op.producto_obj.stock_actual ?? 0} pzas ({op.producto_obj.codigo})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle Recomendada */}
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer select-none transition-colors ${
                        op.recomendada
                          ? 'bg-red-600 text-white border-red-500'
                          : 'bg-[#1e2438] text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={op.recomendada}
                        onChange={(e) => actualizarOpcion(op._uid, { recomendada: e.target.checked })}
                        className="hidden"
                      />
                      <i className={op.recomendada ? 'ri-star-fill' : 'ri-star-line'}></i>
                      <span>{op.recomendada ? 'Opción Recomendada' : 'Marcar Recomendada'}</span>
                    </label>

                    {/* Cargar directo al POS si es de stock */}
                    {op.origen === 'stock' && op.producto_obj && (
                      <button
                        type="button"
                        onClick={() => handleEnviarOpcionAlPOS(op)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Enviar esta llanta directamente al carrito del POS"
                      >
                        <i className="ri-shopping-cart-2-line"></i>
                        <span>Cargar al POS</span>
                      </button>
                    )}

                    {opciones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarOpcion(op._uid)}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 cursor-pointer"
                        title="Eliminar opción"
                      >
                        <i className="ri-delete-bin-line text-base"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Datos de la Llanta y Proveedor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      value={op.marca}
                      onChange={(e) => actualizarOpcion(op._uid, { marca: e.target.value })}
                      placeholder="Michelin, Bridgestone, Tornel..."
                      className="w-full border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:ring-2 focus:ring-[#df000a]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Modelo / Diseño
                    </label>
                    <input
                      type="text"
                      value={op.modelo}
                      onChange={(e) => actualizarOpcion(op._uid, { modelo: e.target.value })}
                      placeholder="Primacy 4, Turanza, Direccional..."
                      className="w-full border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:ring-2 focus:ring-[#df000a]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Medida
                    </label>
                    <input
                      type="text"
                      value={op.medida || medidaEfectiva}
                      onChange={(e) => actualizarOpcion(op._uid, { medida: e.target.value })}
                      placeholder="205/55 R16"
                      className="w-full border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-red-400 focus:ring-2 focus:ring-[#df000a]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Tiempo de Entrega
                    </label>
                    <select
                      value={op.tiempo_entrega}
                      onChange={(e) => actualizarOpcion(op._uid, { tiempo_entrega: e.target.value })}
                      className="w-full border border-slate-600 bg-[#1e2438] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white focus:ring-2 focus:ring-[#df000a]"
                    >
                      <option value="Inmediata (En Stock)">Inmediata (En Stock)</option>
                      <option value="Inmediata">Inmediata</option>
                      <option value="2-3 Horas">2-3 Horas (Mismo Día)</option>
                      <option value="24-48 Horas">24-48 Horas</option>
                      <option value="3-5 Días Hábiles">3-5 Días Hábiles</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      Proveedor (Dato Interno)
                    </label>
                    <select
                      value={op.proveedor}
                      onChange={(e) => actualizarOpcion(op._uid, { proveedor: e.target.value })}
                      className="w-full border border-slate-600 bg-[#1e2438] rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-2 focus:ring-[#df000a]"
                    >
                      <option value="">— Proveedor general —</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── CALCULADORA EN VIVO (PANEL INTERNO CONFIDENCIAL) ── */}
                <div className="bg-[#1b2032] text-white rounded-xl p-4 border border-amber-500/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <i className="ri-lock-password-line"></i>
                      <span>Calculadora Interna de Margen (Confidencial • No visible para el cliente)</span>
                    </span>

                    {/* Badge Verde de Ganancia en Vivo */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black font-mono">
                      <i className="ri-funds-box-line text-emerald-400"></i>
                      <span>
                        Tu Ganancia: ${fmt(gananciaUnit)} por llanta | ${fmt(gananciaTotal)} en las {cant} llantas
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                    {/* Input Costo Proveedor */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-300 mb-1">
                        Costo Proveedor ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={op.costo_proveedor}
                          onChange={(e) => actualizarOpcion(op._uid, { costo_proveedor: e.target.value })}
                          placeholder="0.00"
                          className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-[#161a29] border border-slate-700 text-white font-mono text-xs font-bold focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {/* Toggle Tipo de Margen: % Porcentaje vs $ Monto Fijo */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-300 mb-1">
                        Tipo de Margen
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-[#161a29] p-1 rounded-lg border border-slate-700">
                        <button
                          type="button"
                          onClick={() => actualizarOpcion(op._uid, { tipo_margen: 'porcentaje' })}
                          className={`py-1 px-2 rounded text-[11px] font-black transition-all cursor-pointer ${
                            op.tipo_margen === 'porcentaje'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          % Porcentaje
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarOpcion(op._uid, { tipo_margen: 'monto_fijo' })}
                          className={`py-1 px-2 rounded text-[11px] font-black transition-all cursor-pointer ${
                            op.tipo_margen === 'monto_fijo'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          $ Monto Fijo
                        </button>
                      </div>
                    </div>

                    {/* Input Valor de Margen */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-300 mb-1">
                        {op.tipo_margen === 'porcentaje' ? 'Margen (%)' : 'Ganancia Fija ($/llanta)'}
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          value={op.valor_margen}
                          onChange={(e) => actualizarOpcion(op._uid, { valor_margen: e.target.value })}
                          placeholder={op.tipo_margen === 'porcentaje' ? '25' : '300'}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#161a29] border border-slate-700 text-amber-300 font-mono text-xs font-bold focus:outline-none focus:border-amber-400"
                        />
                        <span className="text-xs font-bold text-slate-300">
                          {op.tipo_margen === 'porcentaje' ? '%' : 'MXN'}
                        </span>
                      </div>
                    </div>

                    {/* Precio Unitario Público (Editable manualmente + botón redondeo) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase text-emerald-400">
                          P. Unitario Público *
                        </label>
                        <button
                          type="button"
                          onClick={() => redondearPrecioOpcion(op._uid, 50)}
                          className="text-[10px] text-amber-300 hover:underline cursor-pointer"
                          title="Redondear al múltiplo de $50 superior"
                        >
                          Redondear $50
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-emerald-400 text-xs font-mono font-bold">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={op.precio_unitario_publico}
                          onChange={(e) =>
                            actualizarOpcion(op._uid, { precio_unitario_publico: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-full pl-6 pr-2.5 py-1.5 rounded-lg bg-[#161a29] border border-emerald-500/60 text-emerald-300 font-mono text-xs font-black focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>

                    {/* Precio por Par (2 llantas) */}
                    <div className="bg-[#161a29] rounded-lg px-3 py-1.5 border border-slate-700">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        Precio por Par (2)
                      </span>
                      <span className="font-mono font-black text-xs text-white">
                        ${fmt(precioParNum)}
                      </span>
                    </div>

                    {/* Precio por Juego (4 llantas) */}
                    <div className="bg-[#161a29] rounded-lg px-3 py-1.5 border border-slate-700">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        Juego (4 llantas)
                      </span>
                      <span className="font-mono font-black text-xs text-amber-300">
                        ${fmt(precioJuego4Num)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notas y Botón Guardar Cotización */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
              Notas Visibles para el Cliente (Aparecen en PDF y WhatsApp)
            </label>
            <textarea
              rows={2}
              value={notasCliente}
              onChange={(e) => setNotasCliente(e.target.value)}
              placeholder="Ej. Garantía de 1 año contra defectos de fabricación. Precios incluyen IVA."
              className="w-full border border-slate-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#df000a] resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
              Notas Internas Confidenciales (Jamás visibles para el cliente)
            </label>
            <textarea
              rows={2}
              value={notasInternas}
              onChange={(e) => setNotasInternas(e.target.value)}
              placeholder="Ej. Cotizado con proveedor Mayorista Mérida, folio cotización #8821."
              className="w-full border border-amber-500/30 bg-[#161a29] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => guardarCotizacionMut.mutate()}
            disabled={guardarCotizacionMut.isPending}
            className="px-6 py-3 rounded-xl bg-[#df000a] hover:bg-[#b80008] disabled:opacity-50 text-white font-black text-sm shadow-lg shadow-red-900/20 flex items-center gap-2 cursor-pointer transition-all"
          >
            <i className="ri-save-3-line text-lg"></i>
            <span>
              {guardarCotizacionMut.isPending
                ? 'Guardando Cotización...'
                : 'Guardar Cotización y Generar Comparativa'}
            </span>
          </button>
        </div>
      </div>

      {/* ══ SECCIÓN 3: HISTORIAL DE COTIZACIONES Y ACCIONES EN 1 CLIC ═══════ */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <i className="ri-file-list-3-line text-[#df000a] text-lg"></i>
            <h3 className="font-black text-gray-900 text-sm sm:text-base">
              3. Historial de Cotizaciones Emitidas ({historialFiltrado.length})
            </h3>
          </div>
          <div className="relative w-full sm:w-72">
            <i className="ri-search-line text-gray-400 absolute left-3 top-2.5 text-sm"></i>
            <input
              type="text"
              value={busquedaHistorial}
              onChange={(e) => setBusquedaHistorial(e.target.value)}
              placeholder="Buscar folio, cliente, medida..."
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-[#df000a]"
            />
          </div>
        </div>

        {loadingHistorial ? (
          <div className="py-12 text-center text-gray-400 text-sm">Cargando cotizaciones...</div>
        ) : historialFiltrado.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No hay cotizaciones registradas todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[760px]">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Folio / Fecha</th>
                  <th className="px-4 py-3 text-left">Cliente / Vehículo</th>
                  <th className="px-4 py-3 text-left">Medida / Cant.</th>
                  <th className="px-4 py-3 text-left">Opciones Cotizadas</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones en 1 Clic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historialFiltrado.map((cot) => {
                  const estMeta = ESTADO_COT_META[cot.estado] || ESTADO_COT_META.vigente;
                  return (
                    <tr key={cot.id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono font-black text-white">{cot.folio}</div>
                        <div className="text-xs text-slate-400">{cot.fecha_formateada || cot.fecha}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">{cot.nombre_cliente || 'Cliente General'}</div>
                        <div className="text-xs text-slate-400">
                          {cot.telefono_cliente ? `${cot.telefono_cliente} • ` : ''}
                          {cot.vehiculo_referencia || 'Sin vehículo'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded">
                          {cot.medida_solicitada || 'Varias'}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-300 font-semibold">
                          ×{cot.cantidad_requerida} pzas
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {(cot.opciones || []).map((op) => (
                            <div key={op.id} className="flex items-center justify-between gap-2 text-xs bg-[#161a29] px-2.5 py-1 rounded border border-white/[0.08]">
                              <span className="truncate max-w-[200px] text-slate-200">
                                <strong className="text-white">{op.marca}</strong> {op.modelo} —{' '}
                                <span className="font-mono font-bold text-emerald-400">
                                  ${fmt(op.precio_unitario_publico)} c/u
                                </span>
                              </span>
                              {op.producto && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEnviarOpcionAlPOS(
                                      op,
                                      cot.cantidad_requerida,
                                      cot.cliente,
                                      cot.vehiculo
                                    )
                                  }
                                  className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors"
                                  title="Enviar esta opción de stock al carrito del POS"
                                >
                                  <i className="ri-shopping-cart-line mr-0.5"></i> POS
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <select
                          value={cot.estado}
                          onChange={(e) => cambiarEstadoMut.mutate({ id: cot.id, estado: e.target.value })}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${estMeta.cls}`}
                        >
                          <option value="vigente">Vigente</option>
                          <option value="aceptada">Aceptada</option>
                          <option value="vencida">Vencida</option>
                          <option value="cancelada">Cancelada</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => descargarPDFCotizacion(cot)}
                            disabled={descargandoId === cot.id}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Descargar PDF para el Cliente (Sin costos internos)"
                          >
                            <i className="ri-file-pdf-2-line"></i>
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => enviarWhatsAppCotizacion(cot)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Enviar comparativa por WhatsApp"
                          >
                            <i className="ri-whatsapp-line"></i>
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ MODAL SELECTOR DE PRODUCTO EN STOCK ═════════════════════════════ */}
      {filaSelectorStock && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161a29] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-white/10">
            <div className="px-5 py-4 bg-[#1b2032] text-white flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <i className="ri-archive-drawer-line text-lg text-[#df000a]"></i>
                <h3 className="font-bold text-sm sm:text-base">
                  Seleccionar Llanta de Stock para la Cotización
                </h3>
              </div>
              <button
                onClick={() => setFilaSelectorStock(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="p-4 border-b border-white/10 bg-[#141720]">
              <div className="relative">
                <i className="ri-search-line text-slate-400 absolute left-3 top-2.5"></i>
                <input
                  type="text"
                  value={busquedaStockModal}
                  onChange={(e) => setBusquedaStockModal(e.target.value)}
                  placeholder="Buscar por código, medida (ej. 2055516), marca o modelo..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-[#df000a]"
                />
              </div>
              {medidaDetectadaModal && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600/20 border border-red-500/40 text-xs font-bold text-red-300">
                  <i className="ri-focus-3-line"></i>
                  <span>Medida detectada: {medidaDetectadaModal}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
              {productosFiltradosModal.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No se encontraron productos en inventario para esa búsqueda.
                </div>
              ) : (
                productosFiltradosModal.map((p) => {
                  const marcaNom = typeof p.marca === 'string' ? p.marca : p.marca?.nombre || p.marca_nombre || '';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => seleccionarProductoDeStock(filaSelectorStock, p)}
                      className="w-full px-5 py-3 hover:bg-white/[0.04] flex items-center justify-between text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-white">{p.codigo}</span>
                          <span className="font-mono font-bold text-xs text-red-300 bg-red-600/20 border border-red-500/30 px-2 py-0.5 rounded">
                            {p.medida}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              (p.stock_actual ?? 0) > 0
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-red-500/20 text-red-300 border border-red-500/40'
                            }`}
                          >
                            Stock: {p.stock_actual ?? 0}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-200 mt-0.5">
                          {marcaNom} {p.modelo} ({p.descripcion_completa})
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="font-mono font-black text-sm text-emerald-400">
                          ${fmt(p.precio_descuento || p.precio_venta)}
                        </p>
                        <span className="text-[11px] text-slate-400">Seleccionar</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
