/**
 * Utilidades de búsqueda y formateo inteligente de medidas de llantas.
 * Permite buscar "2055516", "205 55 16", "205-55-16" y hacer match con "205/55 R16", "205/55R16", etc.
 */

/**
 * Limpia espacios, '/', '-', 'R', 'r', 'Z', 'z' para comparar medidas de forma canónica.
 * Ejemplo: "205/55 R16" -> "2055516"
 */
export function extraerDigitosMedida(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\s/\-RrZz]/g, '')
    .toLowerCase();
}

/**
 * Si el usuario escribe "2055516", "205 55 16", "205-55-16" o "205/55R16",
 * devuelve la medida formateada estándar: "205/55 R16".
 * Si no detecta un patrón de medida válido, devuelve null.
 */
export function detectarMedidaFormateada(query) {
  if (!query) return null;
  const raw = String(query).trim();
  if (!raw) return null;

  // Patrón métrico de 7 dígitos con o sin separadores: ej. 2055516, 205 55 16, 205-55-16, 205/55R16, 205/55 R16C
  const matchMetrico = raw.match(/^(\d{3})[\s/-]*(\d{2})[\s/\-RrZz]*(\d{2})([Cc])?$/);
  if (matchMetrico) {
    const ancho = parseInt(matchMetrico[1], 10);
    const perfil = parseInt(matchMetrico[2], 10);
    const rin = parseInt(matchMetrico[3], 10);
    const sufijo = matchMetrico[4] ? matchMetrico[4].toUpperCase() : '';

    if (ancho >= 115 && ancho <= 405 && perfil >= 20 && perfil <= 95 && rin >= 10 && rin <= 28) {
      return `${matchMetrico[1]}/${matchMetrico[2]} R${matchMetrico[3]}${sufijo}`;
    }
  }

  // Patrón de carga sin perfil explícito: ej. 185R14, 185 R14C, 185-14C
  const matchCarga = raw.match(/^(\d{3})[\s/\-Rr]+(\d{2})([Cc])?$/);
  if (matchCarga) {
    const ancho = parseInt(matchCarga[1], 10);
    const rin = parseInt(matchCarga[2], 10);
    const sufijo = matchCarga[3] ? matchCarga[3].toUpperCase() : '';
    if (ancho >= 135 && ancho <= 315 && rin >= 12 && rin <= 24) {
      return `${matchCarga[1]} R${matchCarga[2]}${sufijo}`;
    }
  }

  return null;
}

/**
 * Retorna true si el producto coincide por código, marca, modelo, descripción,
 * medida normal o medida canónica sin separadores ("2055516" hace match con "205/55 R16", "205/55R16", etc.).
 */
export function coincideProductoInteligente(producto, query) {
  if (!query || !String(query).trim()) return true;
  if (!producto) return false;

  const q = String(query).trim().toLowerCase();
  const codigo = String(producto.codigo || producto.producto_codigo || '').toLowerCase();
  const medida = String(producto.medida || producto.producto_medida || '').toLowerCase();
  const marca = String(
    typeof producto.marca === 'string'
      ? producto.marca
      : producto.marca?.nombre || producto.marca_nombre || ''
  ).toLowerCase();
  const modelo = String(producto.modelo || '').toLowerCase();
  const descripcion = String(
    producto.descripcion_completa || producto.producto_descripcion || producto.descripcion || ''
  ).toLowerCase();

  // Coincidencia directa por texto
  if (
    codigo.includes(q) ||
    medida.includes(q) ||
    marca.includes(q) ||
    modelo.includes(q) ||
    descripcion.includes(q)
  ) {
    return true;
  }

  // Coincidencia canónica de medida sin separadores
  const qCanon = extraerDigitosMedida(q);
  if (qCanon.length >= 3) {
    const medidaCanon = extraerDigitosMedida(medida);
    const descCanon = extraerDigitosMedida(descripcion);
    if (medidaCanon.includes(qCanon) || descCanon.includes(qCanon)) {
      return true;
    }
  }

  // Coincidencia por medida formateada detectada
  const medidaDetectada = detectarMedidaFormateada(query);
  if (medidaDetectada) {
    const detCanon = extraerDigitosMedida(medidaDetectada);
    const medidaCanon = extraerDigitosMedida(medida);
    if (medidaCanon.includes(detCanon)) {
      return true;
    }
  }

  return false;
}

/**
 * Tabulador oficial de utilidades escalonadas por diámetro de Rin y volumen.
 * Margen de ganancia neta en pesos mexicanos según cantidad de llantas compradas:
 * m1: 1 llanta
 * m2: 2 llantas (par) por llanta
 * m4: 4 llantas (juego) por llanta
 */
export const TABULADOR_UTILIDAD_RINES = {
  rin_13:   { nombre: 'Rin 13', m1: 400, m2: 350, m4: 300 },
  rin_14:   { nombre: 'Rin 14', m1: 400, m2: 350, m4: 300 },
  rin_15:   { nombre: 'Rin 15', m1: 400, m2: 350, m4: 300 },
  rin_16:   { nombre: 'Rin 16', m1: 450, m2: 400, m4: 350 },
  rin_17_18:{ nombre: 'Rin 17 - 18', m1: 700, m2: 650, m4: 600 },
  rin_19_24:{ nombre: 'Rin 19 a 24', m1: 850, m2: 800, m4: 750 },
  rin_17_auto: { nombre: 'Rin 17A', m1: 550, m2: 500, m4: 450 },
};

export const TABULADOR_STORAGE_KEY = 'emirs_tabulador_utilidades';

/**
 * Carga el tabulador configurado desde localStorage o devuelve el TABULADOR_UTILIDAD_RINES por defecto.
 */
export function obtenerTabuladorConfigurado() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const guardado = window.localStorage.getItem(TABULADOR_STORAGE_KEY);
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (parsed && typeof parsed === 'object') {
          return { ...TABULADOR_UTILIDAD_RINES, ...parsed };
        }
      }
    }
  } catch (e) {
    console.warn('Error al leer tabulador de utilidades de localStorage', e);
  }
  return { ...TABULADOR_UTILIDAD_RINES };
}

/**
 * Guarda el tabulador personalizado en localStorage y notifica mediante evento global.
 */
export function guardarTabuladorConfigurado(nuevoTab) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TABULADOR_STORAGE_KEY, JSON.stringify(nuevoTab));
      window.dispatchEvent(
        new CustomEvent('emirs:tabulador_actualizado', { detail: nuevoTab })
      );
    }
  } catch (e) {
    console.error('Error al guardar tabulador de utilidades en localStorage', e);
  }
}

/**
 * Restablece el tabulador a los montos oficiales de EmirS eliminando la configuración de localStorage.
 */
export function restaurarTabuladorOficial() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(TABULADOR_STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent('emirs:tabulador_actualizado', { detail: TABULADOR_UTILIDAD_RINES })
      );
    }
  } catch (e) {
    console.error('Error al restaurar tabulador oficial', e);
  }
  return { ...TABULADOR_UTILIDAD_RINES };
}

/**
 * Redondea un valor hacia arriba al múltiplo de 5 más próximo según la fórmula oficial de EmirS.
 * Math.ceil(Math.floor(v) / 5) * 5
 */
export function redondearMultiplo5(valor) {
  const v = parseFloat(valor) || 0;
  if (v <= 0) return 0;
  return Math.ceil(Math.floor(v) / 5) * 5;
}

/**
 * Factores de sobreprecio y financiamiento oficial para Meses Sin Intereses (BBVA y terminales bancarias).
 * Al incorporar el factor de financiamiento directamente en el costo financiado, el factor MSI es 1.0 (sin recargo adicional).
 */
export const FACTORES_MSI = {
  '3_meses': { meses: 3, factor: 1.0, label: '3 Meses Sin Intereses' },
};

/**
 * Extrae el número de Rin de una medida especificada (ej. "205/55 R16" -> 16, "2055516" -> 16).
 */
export function extraerRinDeMedida(medida) {
  if (!medida) return null;
  const str = String(medida).trim();

  // 1. Coincidencia directa con patrón de letra R/r/Z/z/D seguida de 2 dígitos (ej. R16, R17, ZR18, r15)
  const matchR = str.match(/[RrZzDd]\s*(\d{2})\b/);
  if (matchR) {
    const rin = parseInt(matchR[1], 10);
    if (rin >= 10 && rin <= 30) return rin;
  }

  // 2. Si es una medida formateada reconocida (ej. 2055516 -> 205/55 R16)
  const formateada = detectarMedidaFormateada(str);
  if (formateada) {
    const matchForm = formateada.match(/R(\d{2})/i);
    if (matchForm) return parseInt(matchForm[1], 10);
  }

  // 3. Fallback: extraer últimos 2 dígitos si el string tiene longitud canónica >= 7
  const digitos = extraerDigitosMedida(str);
  if (digitos.length >= 7) {
    const rin = parseInt(digitos.slice(-2), 10);
    if (rin >= 10 && rin <= 30) return rin;
  }

  return null;
}

/**
 * Extrae la categoría de Rin correspondiente según la medida proporcionada.
 * - 13 -> 'rin_13'
 * - 14 -> 'rin_14'
 * - 15 -> 'rin_15'
 * - 16 -> 'rin_16'
 * - 17, 18 -> 'rin_17_18'
 * - 19 a 24 -> 'rin_19_24'
 */
export function obtenerCategoriaRin(medida) {
  const rin = extraerRinDeMedida(medida);
  if (!rin) return 'rin_16';
  if (rin <= 13) return 'rin_13';
  if (rin === 14) return 'rin_14';
  if (rin === 15) return 'rin_15';
  if (rin === 16) return 'rin_16';
  if (rin === 17 || rin === 18) return 'rin_17_18';
  if (rin >= 19) return 'rin_19_24';
  return 'rin_16';
}

/**
 * Calcula precios escalonados (unitario, par, juego de 4 y cantidad solicitada Q)
 * con base en el costo, si incluye o no IVA, factor de interés (defecto 1.079) y el tabulador de Rines.
 * Aplica la fórmula oficial exacta de Centro Llantero EmirS / Excel.
 */
export function calcularPreciosEscalonados({
  costo = 0,
  costoIncluyeIva = false,
  categoriaRin = 'rin_16',
  cantidad = 4,
  factorInteres = 1.079,
  tabulador = null,
}) {
  const c = parseFloat(costo) || 0;
  const factor = parseFloat(factorInteres) || 1.079;
  const costoConIva = costoIncluyeIva ? c : c * 1.16;
  const costoFinanciado = costoConIva * factor;

  const tabActual = tabulador || obtenerTabuladorConfigurado();
  const tab =
    tabActual[categoriaRin] ||
    (categoriaRin === 'rin_13_15' ? tabActual.rin_15 : null) ||
    tabActual.rin_16 ||
    TABULADOR_UTILIDAD_RINES.rin_16;

  const m1 = Number(tab.m1) || 0;
  const m2 = Number(tab.m2) || 0;
  const m4 = Number(tab.m4) || 0;

  if (c <= 0) {
    return {
      costoConIva: 0,
      costoFinanciado: 0,
      factorInteres: factor,
      m1,
      m2,
      m4,
      m1Final: Math.round(m1 * factor * 100) / 100,
      m2Final: Math.round(m2 * factor * 100) / 100,
      m4Final: Math.round(m4 * factor * 100) / 100,
      precioUnitario: 0,
      precioPar: 0,
      precioJuego4: 0,
      precioCantidad: 0,
      margenUnitarioEfectivo: m4,
      gananciaTotalCantidad: 0,
    };
  }

  const q = Math.max(1, parseInt(cantidad, 10) || 1);

  // Márgenes finales financiados
  const m1Final = m1 * factor;
  const m2Final = m2 * factor;
  const m4Final = m4 * factor;

  // Fórmula idéntica a Excel del usuario:
  // Math.ceil(Math.floor(...) / 5) * 5
  const precioUnitario = redondearMultiplo5(Math.floor(costoFinanciado + m1Final));
  const precioPar = redondearMultiplo5(Math.floor((costoFinanciado + m2Final) * 2));
  const precioJuego4 = redondearMultiplo5(Math.floor((costoFinanciado + m4Final) * 4));

  let precioCantidad = 0;
  let margenUnitarioEfectivo = m4;

  if (q === 1) {
    precioCantidad = precioUnitario;
    margenUnitarioEfectivo = m1;
  } else if (q === 2) {
    precioCantidad = precioPar;
    margenUnitarioEfectivo = m2;
  } else if (q === 4) {
    precioCantidad = precioJuego4;
    margenUnitarioEfectivo = m4;
  } else {
    precioCantidad = redondearMultiplo5(Math.floor((costoFinanciado + m4Final) * q));
    margenUnitarioEfectivo = q === 3 ? m2 : m4;
  }

  return {
    costoConIva: Math.round(costoConIva * 100) / 100,
    costoFinanciado: Math.round(costoFinanciado * 100) / 100,
    factorInteres: factor,
    m1,
    m2,
    m4,
    m1Final: Math.round(m1Final * 100) / 100,
    m2Final: Math.round(m2Final * 100) / 100,
    m4Final: Math.round(m4Final * 100) / 100,
    precioUnitario,
    precioPar,
    precioJuego4,
    precioCantidad,
    margenUnitarioEfectivo,
    gananciaTotalCantidad: Math.round(margenUnitarioEfectivo * q * 100) / 100,
  };
}

/**
 * Calcula la mensualidad y total para 3 Meses Sin Intereses dado un importe base.
 */
export function calcularOpcionesMSI(montoTotal) {
  const mt = parseFloat(montoTotal) || 0;
  const total = mt > 0 ? Math.round(mt * 100) / 100 : 0;
  const mensualidad = total > 0 ? Math.round((total / 3) * 100) / 100 : 0;
  return {
    '3_meses': {
      meses: 3,
      label: '3 Meses Sin Intereses',
      factor: 1.0,
      total,
      mensualidad,
    },
  };
}
