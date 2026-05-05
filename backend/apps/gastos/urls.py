from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoriaGastoViewSet, GastoViewSet

router = DefaultRouter()
router.register('categorias', CategoriaGastoViewSet, basename='categoria-gasto')
router.register('gastos', GastoViewSet, basename='gasto')

urlpatterns = [
    path('', include(router.urls)),
]
