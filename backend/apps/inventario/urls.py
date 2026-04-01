from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MarcaViewSet, ProveedorViewSet, ProductoViewSet,
    EntradaInventarioViewSet, SalidaInventarioViewSet,
    ImportarXMLView,
    AdeudosResumenView, AdeudoProveedorDetalleView,
    PagoProveedorViewSet,
)

router = DefaultRouter()
router.register(r'marcas', MarcaViewSet, basename='marca')
router.register(r'proveedores', ProveedorViewSet, basename='proveedor')
router.register(r'productos', ProductoViewSet, basename='producto')
router.register(r'entradas', EntradaInventarioViewSet, basename='entrada')
router.register(r'salidas', SalidaInventarioViewSet, basename='salida')
router.register(r'pagos-proveedores', PagoProveedorViewSet, basename='pago-proveedor')

urlpatterns = [
    path('', include(router.urls)),
    path('importar-xml/', ImportarXMLView.as_view(), name='importar-xml'),
    path('adeudos/', AdeudosResumenView.as_view(), name='adeudos-resumen'),
    path('adeudos/<int:proveedor_id>/', AdeudoProveedorDetalleView.as_view(), name='adeudo-proveedor'),
]
