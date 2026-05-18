from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PlantillaCorreoViewSet,
    RecordatorioViewSet,
    EnvioCorreoViewSet,
    EnviarCorreoManualView,
    EjecutarRecordatoriosCronView,
)

router = DefaultRouter()
router.register(r'plantillas', PlantillaCorreoViewSet, basename='plantilla')
router.register(r'recordatorios', RecordatorioViewSet, basename='recordatorio')
router.register(r'historial', EnvioCorreoViewSet, basename='historial')

urlpatterns = [
    path('', include(router.urls)),
    path('enviar-manual/', EnviarCorreoManualView.as_view(), name='enviar-manual'),
    path('cron/', EjecutarRecordatoriosCronView.as_view(), name='cron'),
]
