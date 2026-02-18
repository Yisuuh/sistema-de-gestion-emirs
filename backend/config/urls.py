"""
URL configuration for Sistema de Gestión Llantero
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Apps URLs
    path('api/usuarios/', include('apps.usuarios.urls')),
    path('api/inventario/', include('apps.inventario.urls')),
    path('api/ventas/', include('apps.ventas.urls')),
    path('api/caja/', include('apps.caja.urls')),
    path('api/gastos/', include('apps.gastos.urls')),
    path('api/nomina/', include('apps.nomina.urls')),
    path('api/clientes/', include('apps.clientes.urls')),
    path('api/reportes/', include('apps.reportes.urls')),
]

# Servir archivos media en desarrollo
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Cualquier otra ruta entrega el index.html de React (SPA catch-all)
urlpatterns += [
    re_path(r'^.*$', TemplateView.as_view(template_name='index.html')),
]

# Customizar el admin
admin.site.site_header = "Centro Llantero EmirS - Administración"
admin.site.site_title = "Sistema de Gestión"
admin.site.index_title = "Panel de Administración"
