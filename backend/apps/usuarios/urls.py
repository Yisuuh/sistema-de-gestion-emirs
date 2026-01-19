from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UsuarioViewSet, LogAuditoriaViewSet

router = DefaultRouter()
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'logs', LogAuditoriaViewSet, basename='log')

urlpatterns = [
    path('', include(router.urls)),
]
