from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UsuarioViewSet, LogAuditoriaViewSet

router = DefaultRouter()
router.register(r'logs', LogAuditoriaViewSet, basename='log')
router.register(r'usuarios', UsuarioViewSet, basename='usuario-plural')
router.register(r'', UsuarioViewSet, basename='usuario')

urlpatterns = [
    path('', include(router.urls)),
]
