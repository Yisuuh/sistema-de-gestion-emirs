from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CajaViewSet, MovimientoCajaViewSet, ArqueoCajaViewSet

router = DefaultRouter()
router.register(r'cajas', CajaViewSet, basename='caja')
router.register(r'movimientos', MovimientoCajaViewSet, basename='movimiento-caja')
router.register(r'arqueos', ArqueoCajaViewSet, basename='arqueo-caja')

urlpatterns = [
    path('', include(router.urls)),
]
