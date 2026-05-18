from django.urls import path
from .views import ResumenDashboard, ResumenVentas, ComisionesVendedor, ResumenGastos, ReportePDF

urlpatterns = [
    path('resumen/', ResumenDashboard.as_view(), name='resumen-dashboard'),
    path('ventas/', ResumenVentas.as_view(), name='resumen-ventas'),
    path('comisiones/', ComisionesVendedor.as_view(), name='comisiones-vendedor'),
    path('gastos/', ResumenGastos.as_view(), name='resumen-gastos'),
    path('pdf/', ReportePDF.as_view(), name='reporte-pdf'),
]
