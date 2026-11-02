import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ModalTabuladorRines from './ModalTabuladorRines';
import {
  coincideProductoInteligente,
  detectarMedidaFormateada,
  extraerRinDeMedida,
  obtenerCategoriaRin,
  TABULADOR_UTILIDAD_RINES,
  obtenerTabuladorConfigurado,
  calcularPreciosEscalonados,
  calcularOpcionesMSI,
} from '../../lib/medidaUtils';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_COT_META = {
  vigente:   { label: 'Vigente',   cls: 'bg-[#1e2438] text-emerald-300 border-emerald-500/40' },
  aceptada:  { label: 'Aceptada',  cls: 'bg-[#1e2438] text-sky-300 border-sky-500/40' },
  vencida:   { label: 'Vencida',   cls: 'bg-[#1e2438] text-slate-300 border-slate-600' },
  cancelada: { label: 'Cancelada', cls: 'bg-[#1e2438] text-red-300 border-red-500/40' },
};

const crearOpcionVacia = (gama = 'media', medidaDefault = '', recomend = false) => {
  const catRin = obtenerCategoriaRin(medidaDefault);
  const tabConfig = obtenerTabuladorConfigurado();
  const tab = tabConfig[catRin] || tabConfig.rin_16 || TABULADOR_UTILIDAD_RINES.rin_16;
  return {
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
    costo_incluye_iva: false, // Por defecto el proveedor da precio sin IVA
    costo_con_iva: '',
    utiliza_tabulador: true, // Tabulador oficial escalonado activo por defecto
    categoria_rin: catRin,
    margen_unitario_1: tab.m1,
    margen_unitario_2: tab.m2,
    margen_unitario_4: tab.m4,
    tipo_margen: 'porcentaje',
    valor_margen: '25',
    precio_unitario_publico: '',
    precio_par: '',
    precio_juego_4: '',
    precio_cantidad_solicitada: '',
    recomendada: recomend,
    mostrar_msi_panel: false,
  };
};

function calcularPrecioConMargen(costo, tipoMargen, valorMargen) {
  const c = parseFloat(costo) || 0;
  const v = parseFloat(valorMargen) || 0;
  if (c <= 0) return 0;
  if (tipoMargen === 'porcentaje') {
    return Math.round(c * (1 + v / 100) * 100) / 100;
  }
  return Math.round((c + v) * 100) / 100;
}

function recalcularOpcion(op, cambios, cant = 4, factor = 1.079) {
  const next = { ...op, ...cambios };
  const cantidad = Math.max(1, parseInt(cant, 10) || 1);
  const factorNum = parseFloat(factor) || 1.079;

  if ('medida' in cambios && !('categoria_rin' in cambios)) {
    next.categoria_rin = obtenerCategoriaRin(next.medida);
  }

  const costoBase = parseFloat(next.costo_proveedor) || 0;
  const costoConIva = next.costo_incluye_iva
    ? Math.round(costoBase * 100) / 100
    : Math.round(costoBase * 1.16 * 100) / 100;
  next.costo_con_iva = String(costoConIva);

  if (next.utiliza_tabulador) {
    const catRin = next.categoria_rin || obtenerCategoriaRin(next.medida);
    next.categoria_rin = catRin;
    const escalonados = calcularPreciosEscalonados({
      costo: costoBase,
      costoIncluyeIva: next.costo_incluye_iva,
      categoriaRin: catRin,
      cantidad,
      factorInteres: factorNum,
    });
    next.margen_unitario_1 = escalonados.m1;
    next.margen_unitario_2 = escalonados.m2;
    next.margen_unitario_4 = escalonados.m4;

    if (costoBase > 0) {
      next.precio_unitario_publico = String(escalonados.precioUnitario);
      next.precio_par = String(escalonados.precioPar);
      next.precio_juego_4 = String(escalonados.precioJuego4);
      next.precio_cantidad_solicitada = String(escalonados.precioCantidad);
    }
  } else {
    // Modo Libre / Manual
    if ('precio_unitario_publico' in cambios) {
      const pu = parseFloat(cambios.precio_unitario_publico) || 0;
      next.precio_par = String(Math.round(pu * 2 * 100) / 100);
      next.precio_juego_4 = String(Math.round(pu * 4 * 100) / 100);
      next.precio_cantidad_solicitada = String(Math.round(pu * cantidad * 100) / 100);
    } else if (
      'costo_proveedor' in cambios ||
      'costo_incluye_iva' in cambios ||
      'tipo_margen' in cambios ||
      'valor_margen' in cambios ||
      'utiliza_tabulador' in cambios
    ) {
      const pu = calcularPrecioConMargen(costoConIva, next.tipo_margen, next.valor_margen);
      if (pu > 0) {
        next.precio_unitario_publico = String(pu);
        next.precio_par = String(Math.round(pu * 2 * 100) / 100);
        next.precio_juego_4 = String(Math.round(pu * 4 * 100) / 100);
        next.precio_cantidad_solicitada = String(Math.round(pu * cantidad * 100) / 100);
      }
    }
  }

  return next;
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
  const [factorInteres, setFactorInteres] = useState(1.079); // Factor de interés financiamiento oficial EmirS (por defecto 1.079 = 7.9%)
  const [mostrarMSI, setMostrarMSI] = useState(true); // Checkbox general de Meses Sin Intereses
  const [mostrarModalTabulador, setMostrarModalTabulador] = useState(false);
  const [tabuladorActual, setTabuladorActual] = useState(() => obtenerTabuladorConfigurado());

  // Escucha global por cambios en el tabulador para recalcular en vivo todas las opciones activas
  useEffect(() => {
    const handleActualizarTabulador = (e) => {
      const nuevoTab = e?.detail || obtenerTabuladorConfigurado();
      setTabuladorActual(nuevoTab);
      setOpciones((prev) =>
        prev.map((op) => recalcularOpcion(op, {}, cantidadRequerida, factorInteres))
      );
    };
    window.addEventListener('emirs:tabulador_actualizado', handleActualizarTabulador);
    return () => window.removeEventListener('emirs:tabulador_actualizado', handleActualizarTabulador);
  }, [cantidadRequerida, factorInteres]);

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
    crearOpcionVacia('media', '', false),
    crearOpcionVacia('media', '', true),
    crearOpcionVacia('media', '', false),
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
    queryFn: () => fetch('/api/inventario/productos/?activo=true', { headers: tok() }).then(toArr),
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

  const handleCambiarCantidad = (cant) => {
    const nuevaCant = Math.max(1, parseInt(cant, 10) || 1);
    setCantidadRequerida(nuevaCant);
    setOpciones((prev) => prev.map((op) => recalcularOpcion(op, {}, nuevaCant, factorInteres)));
  };

  const handleCambiarMedida = (val) => {
    setMedidaSolicitada(val);
    const det = detectarMedidaFormateada(val) || val;
    setOpciones((prev) =>
      prev.map((op) => (!op.medida || op.medida === medidaSolicitada ? recalcularOpcion(op, { medida: det }, cantidadRequerida, factorInteres) : op))
    );
  };

  const handleCambiarFactorInteres = (nuevoFactor) => {
    const f = parseFloat(nuevoFactor) || 1.0;
    setFactorInteres(f);
    setOpciones((prev) =>
      prev.map((op) => recalcularOpcion(op, {}, cantidadRequerida, f))
    );
  };

  // ─── Handlers de Opciones y Calculadora en Vivo ──────────────────────────
  const agregarOpcion = (gama = 'media') => {
    const nueva = recalcularOpcion(crearOpcionVacia(gama, medidaEfectiva, false), {}, cantidadRequerida, factorInteres);
    setOpciones((prev) => [...prev, nueva]);
  };

  const eliminarOpcion = (uid) => {
    if (opciones.length <= 1) return;
    setOpciones((prev) => prev.filter((o) => o._uid !== uid));
  };

  const actualizarOpcion = (uid, cambios) => {
    setOpciones((prev) =>
      prev.map((op) => {
        if (op._uid !== uid) return op;
        return recalcularOpcion(op, cambios, cantidadRequerida, factorInteres);
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
        return recalcularOpcion(op, { precio_unitario_publico: String(redondeado), utiliza_tabulador: false }, cantidadRequerida, factorInteres);
      })
    );
  };

  const seleccionarProductoDeStock = (uid, prod) => {
    const costoBase = parseFloat(prod.ultimo_precio_compra || prod.precio_compra || 0);
    const precioVentaLista = parseFloat(prod.precio_descuento || prod.precio_venta || 0);
    const costoEstimado = costoBase > 0 ? costoBase : Math.round(precioVentaLista * 0.75 * 100) / 100;
    const marcaNom = typeof prod.marca === 'string' ? prod.marca : prod.marca?.nombre || prod.marca_nombre || '';
    const medProd = prod.medida || medidaEfectiva;
    const catRin = obtenerCategoriaRin(medProd);

    // Calcular margen implícito si hay precio de lista y costo
    let valorMargenCalc = '25';
    if (costoEstimado > 0 && precioVentaLista > costoEstimado) {
      valorMargenCalc = String(Math.round(((precioVentaLista - costoEstimado) / costoEstimado) * 1000) / 10);
    }

    setOpciones((prev) =>
      prev.map((op) => {
        if (op._uid !== uid) return op;
        const baseOp = {
          ...op,
          origen: 'stock',
          producto: prod.id,
          producto_obj: prod,
          marca: marcaNom,
          modelo: prod.modelo || prod.descripcion_completa || '',
          medida: medProd,
          tiempo_entrega: 'Inmediata (En Stock)',
          costo_proveedor: costoEstimado > 0 ? String(costoEstimado) : '',
          costo_incluye_iva: true,
          categoria_rin: catRin,
          tipo_margen: 'porcentaje',
          valor_margen: valorMargenCalc,
        };
        return recalcularOpcion(baseOp, {}, cantidadRequerida, factorInteres);
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
        throw new Error('Completa al menos una opción con Marca y P. Unitario mayor a $0.');
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
        factor_interes: factorInteres,
        mostrar_msi: mostrarMSI,
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
          const par = parseFloat(o.precio_par) || Math.round(pu * 2 * 100) / 100;
          const j4 = parseFloat(o.precio_juego_4) || Math.round(pu * 4 * 100) / 100;
          const pCant = parseFloat(o.precio_cantidad_solicitada) || Math.round(pu * cant * 100) / 100;
          const medOp = detectarMedidaFormateada(o.medida) || o.medida.trim() || medFinal || 'S/M';
          const cConIva = parseFloat(o.costo_con_iva) || (o.costo_incluye_iva ? (parseFloat(o.costo_proveedor) || 0) : Math.round((parseFloat(o.costo_proveedor) || 0) * 1.16 * 100) / 100);

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
            costo_incluye_iva: Boolean(o.costo_incluye_iva),
            costo_con_iva: cConIva,
            utiliza_tabulador: Boolean(o.utiliza_tabulador),
            categoria_rin: o.categoria_rin || obtenerCategoriaRin(medOp),
            margen_unitario_1: parseFloat(o.margen_unitario_1) || 0,
            margen_unitario_2: parseFloat(o.margen_unitario_2) || 0,
            margen_unitario_4: parseFloat(o.margen_unitario_4) || 0,
            tipo_margen: o.tipo_margen,
            valor_margen: parseFloat(o.valor_margen) || 0,
            precio_unitario_publico: pu,
            precio_par: par,
            precio_juego_4: j4,
            precio_cantidad_solicitada: pCant,
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
    const incluirMSI = typeof cot.mostrar_msi === 'boolean' ? cot.mostrar_msi : mostrarMSI;

    const lineasOpciones = (cot.opciones || []).map((op, i) => {
      const rec = op.recomendada ? ' ⭐ [RECOMENDADA]' : '';
      const pu = fmt(op.precio_unitario_publico);
      const par = fmt(op.precio_par || op.precio_unitario_publico * 2);
      const j4 = fmt(op.precio_juego_4 || op.precio_unitario_publico * 4);

      let msiBloque = '';
      if (incluirMSI) {
        const baseMSI = parseFloat(op.precio_cantidad_solicitada) > 0
          ? parseFloat(op.precio_cantidad_solicitada)
          : (parseFloat(op.precio_unitario_publico) || 0) * cant;
        if (baseMSI > 0) {
          const msiCalc = calcularOpcionesMSI(baseMSI);
          msiBloque =
            `\n   💳 *Financiamiento Meses Sin Intereses (${cant} llantas):*\n` +
            `      • 3 Meses Sin Intereses: *$${fmt(msiCalc['3_meses'].mensualidad)}/mes* (Total $${fmt(msiCalc['3_meses'].total)})`;
        }
      }

      return (
        `${i + 1}. *${op.marca} ${op.modelo || ''}* (${op.medida})${rec}\n` +
        `   💵 *Precios de Contado:*\n` +
        `      • 1 Llanta: *$${pu}*\n` +
        `      • Par (2): *$${par}* (Ahorro por volumen)\n` +
        `      • Juego (4): *$${j4}* (Máximo ahorro)\n` +
        (cant !== 1 && cant !== 2 && cant !== 4 && op.precio_cantidad_solicitada
          ? `      • Total por ${cant} llantas: *$${fmt(op.precio_cantidad_solicitada)}*\n`
          : '') +
        `   ⏱ Entrega: ${op.tiempo_entrega || 'Inmediata'}` +
        msiBloque
      );
    });

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

    const texto = [
      `Hola *${cot.nombre_cliente || 'Cliente'}*, le compartimos su cotización de *Centro Llantero EmirS* (Folio *${cot.folio}*):`,
      cot.vehiculo_referencia ? `🚗 Vehículo: *${cot.vehiculo_referencia}*` : null,
      `📏 Medida solicitada: *${cot.medida_solicitada || 'Varias'}* (${cant} llanta${cant > 1 ? 's' : ''})`,
      '',
      '🏁 *OPCIONES DISPONIBLES:*',
      ...lineasOpciones,
      '',
      '🎁 *BENEFICIOS EXCLUSIVOS:*',
      '✔ *Desde 1 llanta:* Incluye instalación, válvula, balanceo y llenado con nitrógeno.',
      '✔ *En la compra de 2 llantas:* Te regalamos 2 años de nitrógeno y revisión periódica.',
      '✔ *Si te llevas las 4 llantas:* Paga a 3 Meses Sin Intereses con BBVA y llévate 2 años de mantenimiento completo (calibración con nitrógeno, revisiones y reparación de pinchaduras).',
      ...(incluyeList.length > 0 ? ['', `🛠 *Servicios incluidos adicionales:* ${incluyeList.join(', ')}.`] : []),
      cot.notas_cliente ? `📝 *Nota:* ${cot.notas_cliente}` : null,
      '',
      '📋 *CONDICIONES DE COMPRA Y PAGO:*',
      '• *Garantía:* Hasta 5 años (Varía dependiendo de la marca) contra defectos de fábrica.',
      '• *Precios:* Válidos hasta agotar existencias (incluyen IVA).',
      '• *Para confirmar solicitud:* 50% de anticipo o pago total.',
      '• *Métodos de pago:* Efectivo, transferencia o depósito, tarjetas de débito y crédito (excepto Amex).',
      `• *Vigencia:* ${cot.vigencia_dias || 5} días a partir de la emisión.`,
      '',
      '💳 *DATOS PARA TRANSFERENCIA O DEPÓSITO:*',
      '• *Beneficiario:* Emir Amilcar Rosado Mendoza',
      '• *Banco:* Santander',
      '• *Tarjeta:* 5579070041019087',
      '• *CLABE:* 014910605635788786',
      '• *Correo:* emircentrollantero@gmail.com',
      '',
      '📍 *ATENCIÓN, HORARIOS Y UBICACIÓN:*',
      '• *Tel/WhatsApp:* (999) 111 8213 / (999) 371 8502',
      '• *Horarios:* L-V 8:00 AM a 6:45 PM | Sáb 8:00 AM a 4:45 PM | Dom 8:30 AM a 12:45 PM',
      '• *Dirección:* Calle 42 # 282 por 45 Francisco de Montejo',
      '• *Facebook:* Facebook/EmirScentrollantero',
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
                  onChange={(e) => handleCambiarMedida(e.target.value)}
                  placeholder="Escribe 2055516 o 205/55 R16..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm font-mono font-bold text-gray-900 focus:ring-2 focus:ring-[#df000a]"
                />
              </div>
              {medidaDetectadaPrincipal && medidaSolicitada !== medidaDetectadaPrincipal && (
                <button
                  type="button"
                  onClick={() => handleCambiarMedida(medidaDetectadaPrincipal)}
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
                  onClick={() => handleCambiarCantidad(n)}
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
                onChange={(e) => handleCambiarCantidad(e.target.value)}
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

          {/* Interés / Factor de Financiamiento */}
          <div className="sm:col-span-2 lg:col-span-4 bg-[#141720] border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <i className="ri-percent-line text-sm"></i>
              </span>
              <div>
                <span className="text-xs font-black text-white uppercase tracking-wider block">
                  Interés / Factor de Financiamiento
                </span>
                <span className="text-[11px] text-slate-400">
                  Calcula el costo financiado oficial de EmirS (Base con IVA × Factor) para precios de venta y 3 MSI
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { label: '1.079 (Defecto)', val: 1.079 },
                { label: '1.00 (Sin Interés)', val: 1.00 },
                { label: '1.05', val: 1.05 },
                { label: '1.10', val: 1.10 },
              ].map((b) => (
                <button
                  key={b.val}
                  type="button"
                  onClick={() => handleCambiarFactorInteres(b.val)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                    Math.abs(factorInteres - b.val) < 0.001
                      ? 'bg-[#df000a] text-white border-red-500 shadow-sm'
                      : 'bg-[#1e2438] text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {b.label}
                </button>
              ))}

              <div className="flex items-center gap-1 bg-[#1e2438] border border-slate-700 rounded-xl px-2 py-1">
                <span className="text-[11px] font-bold text-slate-400">Libre:</span>
                <input
                  type="number"
                  min="0.5"
                  max="2.0"
                  step="0.001"
                  value={factorInteres}
                  onChange={(e) => handleCambiarFactorInteres(parseFloat(e.target.value) || 1.0)}
                  className="w-16 bg-transparent text-amber-300 font-mono font-bold text-xs text-center focus:outline-none"
                  title="Factor de interés libre (ej. 1.079)"
                />
              </div>

              {/* Botón Tabulador de Rines */}
              <button
                type="button"
                onClick={() => setMostrarModalTabulador(true)}
                className="px-3 py-1.5 rounded-xl bg-[#1b2032] hover:bg-[#232940] text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer transition-all shadow-sm ml-1"
                title="Configurar tabulador de utilidades oficiales por Rin"
              >
                <i className="ri-table-line text-sm text-amber-400"></i>
                <span>Tabulador de Rines</span>
              </button>
            </div>
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

              {/* Checkbox General Meses Sin Intereses */}
              <label
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer select-none transition-colors ${
                  mostrarMSI
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1e2438] border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={mostrarMSI}
                  onChange={(e) => setMostrarMSI(e.target.checked)}
                  className="accent-amber-500 w-3.5 h-3.5"
                />
                <i className="ri-bank-card-line text-amber-400"></i>
                <span>Ofrecer financiamiento a 3 Meses Sin Intereses (3 MSI)</span>
              </label>

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
              onClick={() => agregarOpcion()}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <i className="ri-add-line"></i> + Agregar Llanta / Opción
            </button>
          </div>
        </div>

        {/* Lista de Opciones */}
        <div className="space-y-4">
          {opciones.map((op, index) => {
            const cant = Math.max(1, parseInt(cantidadRequerida, 10) || 4);
            const costoBase = parseFloat(op.costo_proveedor) || 0;
            const costoConIva = op.costo_incluye_iva
              ? costoBase
              : Math.round(costoBase * 1.16 * 100) / 100;

            const precioUnitNum = parseFloat(op.precio_unitario_publico) || 0;
            const precioParNum = parseFloat(op.precio_par) || (precioUnitNum * 2);
            const precioJuego4Num = parseFloat(op.precio_juego_4) || (precioUnitNum * 4);
            const precioCantNum = parseFloat(op.precio_cantidad_solicitada) || (
              cant === 1 ? precioUnitNum : cant === 2 ? precioParNum : cant === 4 ? precioJuego4Num : Math.round(precioUnitNum * cant * 100) / 100
            );

            // Ganancia interna
            let gananciaUnit = 0;
            let gananciaTotal = 0;
            if (op.utiliza_tabulador) {
              const m1 = parseFloat(op.margen_unitario_1) || 0;
              const m2 = parseFloat(op.margen_unitario_2) || 0;
              const m4 = parseFloat(op.margen_unitario_4) || 0;
              gananciaUnit = cant === 1 ? m1 : cant === 2 || cant === 3 ? m2 : m4;
              gananciaTotal = cant * gananciaUnit;
            } else {
              gananciaUnit = precioUnitNum > 0 && costoConIva > 0 ? precioUnitNum - costoConIva : 0;
              gananciaTotal = gananciaUnit * cant;
            }

            const catRinActual = op.categoria_rin || obtenerCategoriaRin(op.medida || medidaEfectiva);
            const tabMeta = tabuladorActual[catRinActual] || tabuladorActual.rin_16 || TABULADOR_UTILIDAD_RINES.rin_16;
            const rinNumDetectado = extraerRinDeMedida(op.medida || medidaEfectiva) || 16;
            const esRin17 = catRinActual === 'rin_17_18' || catRinActual === 'rin_17_auto' || rinNumDetectado === 17;
            const baseMSI = cant === 4 ? precioJuego4Num : precioCantNum > 0 ? precioCantNum : precioJuego4Num;
            const msiOpciones = calcularOpcionesMSI(baseMSI);

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
                <div className="bg-[#1b2032] text-white rounded-xl p-4 border border-amber-500/30 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <i className="ri-lock-password-line"></i>
                        <span>Calculadora Confidencial</span>
                      </span>

                      {/* Selector de Modo: Tabulador Oficial vs Modo Manual */}
                      <div className="inline-flex rounded-lg border border-slate-700 bg-[#161a29] p-0.5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => actualizarOpcion(op._uid, { utiliza_tabulador: true })}
                          className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                            op.utiliza_tabulador
                              ? 'bg-[#df000a] text-white shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <i className="ri-dashboard-3-line mr-1"></i>Tabulador Oficial Rin
                        </button>
                        <button
                          type="button"
                          onClick={() => actualizarOpcion(op._uid, { utiliza_tabulador: false })}
                          className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                            !op.utiliza_tabulador
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <i className="ri-edit-line mr-1"></i>Modo Manual / Libre
                        </button>
                      </div>
                    </div>

                    {/* Badge Verde de Ganancia en Vivo */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-black font-mono">
                      <i className="ri-funds-box-line text-emerald-400"></i>
                      <span>
                        Tu Ganancia: ${fmt(gananciaUnit)}/llanta • ${fmt(gananciaTotal)} en las {cant} llantas
                      </span>
                    </span>
                  </div>

                  {/* Fila de Controles de Costo, IVA y Tabulador / Márgenes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                    {/* Costo Proveedor + Toggle IVA */}
                    <div className="lg:col-span-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase text-slate-300">
                          Costo Proveedor ($)
                        </label>
                        {/* Selector de IVA */}
                        <div className="flex items-center gap-1 text-[10px] font-bold">
                          <span className="text-slate-400">¿IVA?</span>
                          <button
                            type="button"
                            onClick={() => actualizarOpcion(op._uid, { costo_incluye_iva: true })}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              op.costo_incluye_iva
                                ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => actualizarOpcion(op._uid, { costo_incluye_iva: false })}
                            className={`px-1.5 py-0.5 rounded cursor-pointer ${
                              !op.costo_incluye_iva
                                ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            No (+16%)
                          </button>
                        </div>
                      </div>

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

                      {!op.costo_incluye_iva && costoBase > 0 && (
                        <div className="text-[10px] text-amber-300/90 font-mono">
                          Base con IVA (+16%): ${fmt(costoConIva)}
                        </div>
                      )}
                    </div>

                    {/* Lado Central: Tabulador Rin o Ajuste Manual */}
                    {op.utiliza_tabulador ? (
                      <div className="lg:col-span-8 bg-[#161a29] rounded-xl p-2.5 border border-slate-700/80 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                          <span className="font-bold text-slate-300 flex items-center gap-1">
                            <i className="ri-disc-line text-red-400"></i>
                            <span>Rin {rinNumDetectado} • {tabMeta.nombre}</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            1 pza: +${tabMeta.m1} | Par: +${tabMeta.m2} c/u | Juego (4): +${tabMeta.m4} c/u
                          </span>
                        </div>

                        {esRin17 && (
                          <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                            <span className="text-[10px] uppercase font-bold text-amber-400">Variante Rin 17:</span>
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => actualizarOpcion(op._uid, { categoria_rin: 'rin_17_18' })}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                                  catRinActual === 'rin_17_18'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-[#1e2438] text-slate-400 hover:text-white'
                                }`}
                              >
                                Estándar / Camioneta (+{tabuladorActual.rin_17_18?.m1 ?? 700} / +{tabuladorActual.rin_17_18?.m2 ?? 650} / +{tabuladorActual.rin_17_18?.m4 ?? 600})
                              </button>
                              <button
                                type="button"
                                onClick={() => actualizarOpcion(op._uid, { categoria_rin: 'rin_17_auto' })}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                                  catRinActual === 'rin_17_auto'
                                    ? 'bg-amber-500 text-slate-950 font-black'
                                    : 'bg-[#1e2438] text-slate-400 hover:text-white'
                                }`}
                              >
                                Rin 17A Auto (+{tabuladorActual.rin_17_auto?.m1 ?? 550} / +{tabuladorActual.rin_17_auto?.m2 ?? 500} / +{tabuladorActual.rin_17_auto?.m4 ?? 450})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#161a29] rounded-xl p-2.5 border border-slate-700/80 items-end">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-300 mb-1">
                            Tipo de Margen
                          </label>
                          <div className="grid grid-cols-2 gap-1 bg-[#1e2438] p-0.5 rounded-lg border border-slate-700">
                            <button
                              type="button"
                              onClick={() => actualizarOpcion(op._uid, { tipo_margen: 'porcentaje' })}
                              className={`py-0.5 px-1 rounded text-[10px] font-black cursor-pointer ${
                                op.tipo_margen === 'porcentaje'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              % Porcentaje
                            </button>
                            <button
                              type="button"
                              onClick={() => actualizarOpcion(op._uid, { tipo_margen: 'monto_fijo' })}
                              className={`py-0.5 px-1 rounded text-[10px] font-black cursor-pointer ${
                                op.tipo_margen === 'monto_fijo'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              $ Fijo
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-300 mb-1">
                            {op.tipo_margen === 'porcentaje' ? 'Margen (%)' : 'Ganancia ($/llanta)'}
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={op.valor_margen}
                            onChange={(e) => actualizarOpcion(op._uid, { valor_margen: e.target.value })}
                            className="w-full px-2 py-1 rounded-lg bg-[#1e2438] border border-slate-700 text-amber-300 font-mono text-xs font-bold focus:outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold uppercase text-emerald-400">
                              P. Unitario *
                            </label>
                            <button
                              type="button"
                              onClick={() => redondearPrecioOpcion(op._uid, 50)}
                              className="text-[10px] text-amber-300 hover:underline cursor-pointer"
                              title="Redondear al múltiplo de $50"
                            >
                              Redondear $50
                            </button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={op.precio_unitario_publico}
                            onChange={(e) =>
                              actualizarOpcion(op._uid, { precio_unitario_publico: e.target.value })
                            }
                            placeholder="0.00"
                            className="w-full px-2 py-1 rounded-lg bg-[#1e2438] border border-emerald-500/60 text-emerald-300 font-mono text-xs font-black focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Fila de Precios Escalonados para el Cliente */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.08]">
                    {/* 1 Llanta */}
                    <div className="bg-[#161a29] rounded-xl px-3 py-2 border border-slate-700">
                      <span className="block text-[10px] uppercase font-bold text-slate-400">
                        P. Unitario (1 pza)
                      </span>
                      <span className="font-mono font-black text-sm text-white">
                        ${fmt(precioUnitNum)}
                      </span>
                    </div>

                    {/* Par (2 llantas) */}
                    <div className="bg-[#161a29] rounded-xl px-3 py-2 border border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="block text-[10px] uppercase font-bold text-slate-400">
                          Par (2 pzas)
                        </span>
                        {precioParNum > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            ${fmt(precioParNum / 2)} c/u
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-black text-sm text-emerald-300">
                        ${fmt(precioParNum)}
                      </span>
                    </div>

                    {/* Juego (4 llantas) */}
                    <div className="bg-[#161a29] rounded-xl px-3 py-2 border border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="block text-[10px] uppercase font-bold text-amber-400">
                          Juego (4 pzas)
                        </span>
                        {precioJuego4Num > 0 && (
                          <span className="text-[10px] text-amber-300 font-mono">
                            ${fmt(precioJuego4Num / 4)} c/u
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-black text-sm text-amber-300">
                        ${fmt(precioJuego4Num)}
                      </span>
                    </div>

                    {/* Cotización por Cantidad Solicitada */}
                    <div className="bg-[#161a29] rounded-xl px-3 py-2 border border-[#df000a]/50">
                      <span className="block text-[10px] uppercase font-bold text-red-300">
                        Total {cant} llanta{cant > 1 ? 's' : ''}
                      </span>
                      <span className="font-mono font-black text-sm text-white">
                        ${fmt(precioCantNum)}
                      </span>
                    </div>
                  </div>

                  {/* Subcard de Meses Sin Intereses (BBVA / Bancos) */}
                  {mostrarMSI && baseMSI > 0 && (
                    <div className="bg-[#161a29]/90 rounded-xl p-3 border border-amber-500/20 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <i className="ri-bank-card-line text-amber-400"></i>
                          <span>Financiamiento a 3 Meses Sin Intereses ({cant === 4 ? 'Juego de 4' : `${cant} llantas`})</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Tarjetas de Crédito Participantes (BBVA / Bancarias)
                        </span>
                      </div>

                      <div className="bg-[#1b2032] rounded-lg p-3 border border-slate-700/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div>
                          <span className="block text-xs font-bold text-slate-300 uppercase">
                            {msiOpciones['3_meses']?.label || '3 Meses Sin Intereses'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Interés ya incluido en el precio
                          </span>
                        </div>
                        <div className="sm:text-right">
                          <span className="font-mono font-black text-sm sm:text-base text-amber-300">
                            ${fmt(msiOpciones['3_meses']?.mensualidad)} / mes
                          </span>
                          <span className="block text-[11px] text-slate-400 font-mono">
                            Total: ${fmt(msiOpciones['3_meses']?.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
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
                        <div className="space-y-1.5">
                          {(cot.opciones || []).map((op) => {
                            const pu = parseFloat(op.precio_unitario_publico) || 0;
                            const par = parseFloat(op.precio_par) || Math.round(pu * 2 * 100) / 100;
                            const j4 = parseFloat(op.precio_juego_4) || Math.round(pu * 4 * 100) / 100;
                            return (
                              <div
                                key={op.id || op._uid || Math.random()}
                                className="flex items-center justify-between gap-2 text-xs bg-[#161a29] px-2.5 py-1.5 rounded-lg border border-white/[0.08]"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-slate-200">
                                    <strong className="text-white">{op.marca}</strong> {op.modelo}
                                    {op.recomendada && (
                                      <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                        ⭐ Recomendada
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] font-mono">
                                    <span className="text-emerald-400 font-bold" title="1 Llanta (P. Unitario real)">
                                      P. Unit: ${fmt(pu)}
                                    </span>
                                    <span className="text-slate-600">•</span>
                                    <span className="text-sky-300 font-semibold" title="Par (2 piezas)">
                                      Par (2 pzas): ${fmt(par)}
                                    </span>
                                    <span className="text-slate-600">•</span>
                                    <span className="text-amber-300 font-semibold" title="Juego (4 piezas)">
                                      Juego (4 pzas): ${fmt(j4)}
                                    </span>
                                  </div>
                                </div>
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
                                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                                    title="Enviar esta opción de stock al carrito del POS"
                                  >
                                    <i className="ri-shopping-cart-line mr-0.5"></i> POS
                                  </button>
                                )}
                              </div>
                            );
                          })}
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

      {/* Modal Tabulador de Rines */}
      <ModalTabuladorRines
        isOpen={mostrarModalTabulador}
        onClose={() => {
          setMostrarModalTabulador(false);
          setOpciones((prev) =>
            prev.map((op) => recalcularOpcion(op, {}, cantidadRequerida, factorInteres))
          );
        }}
        factorInteres={factorInteres}
        onGuardado={(nuevoTab) => {
          setTabuladorActual(nuevoTab);
          setOpciones((prev) =>
            prev.map((op) => recalcularOpcion(op, {}, cantidadRequerida, factorInteres))
          );
        }}
      />
    </div>
  );
}
