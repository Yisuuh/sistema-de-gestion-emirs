from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MarcaViewSet, ProveedorViewSet, ProductoViewSet, EntradaInventarioViewSet, SalidaInventarioViewSet

router = DefaultRouter()
router.register(r'marcas', MarcaViewSet, basename='marca')
router.register(r'proveedores', ProveedorViewSet, basename='proveedor')
router.register(r'productos', ProductoViewSet, basename='producto')
router.register(r'entradas', EntradaInventarioViewSet, basename='entrada')
router.register(r'salidas', SalidaInventarioViewSet, basename='salida')

urlpatterns = [
    path('', include(router.urls)),
]
