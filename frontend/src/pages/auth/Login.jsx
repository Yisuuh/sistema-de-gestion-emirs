import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../../config/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access);
        localStorage.setItem('refreshToken', data.refresh);
        localStorage.setItem('username', username);
        navigate('/dashboard');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Usuario o contraseña incorrectos');
      }
    } catch (err) {
      setError('Error de conexión. Verifica que el servidor esté corriendo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Encabezado del formulario */}
      <div className="mb-8">
        <h2 className="font-display font-bold text-white" style={{ fontSize: '28px', letterSpacing: '0.01em', lineHeight: 1 }}>Bienvenido</h2>
        <p className="text-gray-500 mt-1" style={{ fontSize: '13px' }}>Ingresa tus credenciales para continuar</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-[#1a0000] border border-[#df000a] text-red-300 px-4 py-3 rounded-xl mb-5 text-sm">
          <span className="text-[#df000a] mt-0.5">✕</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Usuario */}
        <div>
          <label className="block font-display font-semibold text-gray-400 uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.13em' }} htmlFor="username">
            Usuario
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="Ingresa tu usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={loading}
            className="w-full bg-[#181818] border border-gray-800 text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600
              focus:outline-none focus:border-[#df000a] focus:ring-1 focus:ring-[#df000a]
              disabled:opacity-50 transition-colors"
          />
        </div>

        {/* Contraseña */}
        <div>
          <label className="block font-display font-semibold text-gray-400 uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.13em' }} htmlFor="password">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full bg-[#181818] border border-gray-800 text-white rounded-xl px-4 py-3 pr-11 text-sm placeholder-gray-600
                focus:outline-none focus:border-[#df000a] focus:ring-1 focus:ring-[#df000a]
                disabled:opacity-50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors text-xs select-none"
              tabIndex={-1}
            >
              {showPassword ? 'OCULTAR' : 'VER'}
            </button>
          </div>
        </div>

        {/* Botón */}
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="relative w-full bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-bold py-3 px-6 rounded-xl transition-colors text-sm tracking-wide mt-2
            focus:outline-none focus:ring-2 focus:ring-[#df000a] focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ingresando...
            </span>
          ) : (
            'Ingresar al Sistema'
          )}
        </button>
      </form>

      {/* Línea decorativa */}
      <div className="flex items-center gap-3 mt-8">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-[#ef8701] text-xs font-bold tracking-widest">EMIRS</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>
    </div>
  );
}
