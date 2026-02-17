from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VentaViewSet, DetalleVentaViewSet, ServicioViewSet

router = DefaultRouter()
router.register(r'ventas', VentaViewSet, basename='venta')
router.register(r'detalles', DetalleVentaViewSet, basename='detalle-venta')
router.register(r'servicios', ServicioViewSet, basename='servicio')

urlpatterns = [
    path('', include(router.urls)),
]
