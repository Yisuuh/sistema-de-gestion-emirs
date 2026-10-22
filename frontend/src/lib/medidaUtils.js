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
