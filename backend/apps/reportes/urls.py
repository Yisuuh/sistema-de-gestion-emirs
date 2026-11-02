from django.urls import path
from .views import (
    ResumenDashboard,
    ResumenVentas,
    ComisionesVendedor,
    ResumenGastos,
    ReportePDF,
    RankingMasVendidos,
    BalanceGlobalView,
    BackupSistemaView,
    ReportePagosProveedoresPDFView,
    ReportePagosProveedoresExcelView,
    ReporteContableExcelView,
)

urlpatterns = [
    path('resumen/', ResumenDashboard.as_view(), name='resumen-dashboard'),
    path('ventas/', ResumenVentas.as_view(), name='resumen-ventas'),
    path('comisiones/', ComisionesVendedor.as_view(), name='comisiones-vendedor'),
    path('gastos/', ResumenGastos.as_view(), name='resumen-gastos'),
    path('balance-global/', BalanceGlobalView.as_view(), name='balance-global'),
    path('pdf/', ReportePDF.as_view(), name='reporte-pdf'),
    path('contable-excel/', ReporteContableExcelView.as_view(), name='reporte-contable-excel'),
    path('pagos-proveedores/pdf/', ReportePagosProveedoresPDFView.as_view(), name='reporte-pagos-proveedores-pdf'),
    path('pagos-proveedores/excel/', ReportePagosProveedoresExcelView.as_view(), name='reporte-pagos-proveedores-excel'),
    path('mas-vendidos/', RankingMasVendidos.as_view(), name='ranking-mas-vendidos'),
    path('backup/', BackupSistemaView.as_view(), name='backup-sistema'),
    path('backup/descargar/', BackupSistemaView.as_view(), name='backup-sistema-descargar'),
]

