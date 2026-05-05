from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmpleadoViewSet, PeriodoNominaViewSet, LineaNominaViewSet

router = DefaultRouter()
router.register(r'empleados', EmpleadoViewSet, basename='empleado')
router.register(r'periodos', PeriodoNominaViewSet, basename='periodo')
router.register(r'lineas', LineaNominaViewSet, basename='linea')

urlpatterns = [
    path('', include(router.urls)),
]

