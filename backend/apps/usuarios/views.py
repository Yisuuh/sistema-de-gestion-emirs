from rest_framework import viewsets, permissions
from .models import Usuario, LogAuditoria
from .serializers import UsuarioSerializer, LogAuditoriaSerializer


class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        if self.request.user.rol == 'admin':
            return Usuario.objects.all()
        return Usuario.objects.filter(id=self.request.user.id)


class LogAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LogAuditoria.objects.all()
    serializer_class = LogAuditoriaSerializer
    permission_classes = [permissions.IsAdminUser]
