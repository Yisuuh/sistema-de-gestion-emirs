from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UnidadMovilViewSet,
    TipoServicioRescateViewSet,
    RescateViewSet
)

router = DefaultRouter()
router.register(r'unidades', UnidadMovilViewSet, basename='unidad-movil')
router.register(r'tipos-servicio', TipoServicioRescateViewSet, basename='tipo-servicio-rescate')
router.register(r'tipos-servicios', TipoServicioRescateViewSet, basename='tipo-servicio-rescate-alias')
router.register(r'ordenes', RescateViewSet, basename='rescate')
router.register(r'', RescateViewSet, basename='rescate-direct')

urlpatterns = [
    path('', include(router.urls)),
]
