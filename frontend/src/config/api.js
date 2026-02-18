// URL base de la API.
// En desarrollo usa el proxy de Vite (vacío = relativo al origen).
// En producción el frontend y el backend son el mismo origen (Render),
// por lo que también funciona con ruta relativa.
const API_BASE = import.meta.env.VITE_API_URL || ''

export default API_BASE
