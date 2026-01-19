export default function Dashboard() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Ventas del Día</h3>
          <p className="text-3xl font-bold">$40,013</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Productos en Stock</h3>
          <p className="text-3xl font-bold">248</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Alertas de Stock</h3>
          <p className="text-3xl font-bold text-orange-500">12</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Clientes Atendidos</h3>
          <p className="text-3xl font-bold">23</p>
        </div>
      </div>
    </div>
  )
}
