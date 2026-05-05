import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Centro Llantero EmirS</h1>
          <p className="text-gray-600 mt-2">Sistema de Gestión</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
