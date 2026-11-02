from django.db.models import Q
from django.utils import timezone
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import LogAuditoria, Usuario
from .permissions import IsAdmin, IsAdminOrSelf, IsSelf
from .serializers import LogAuditoriaSerializer, UsuarioSerializer


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Serializer personalizado de JWT que incluye datos de usuario y permisos en token y respuesta.
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['user_id'] = user.id
        token['username'] = user.username
        token['email'] = user.email
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        token['nombre_completo'] = user.get_full_name() or user.username
        token['rol'] = getattr(user, 'rol', 'vendedor')
        token['es_admin'] = (getattr(user, 'rol', None) == 'admin') or user.is_superuser or user.is_staff
        token['tiene_pin'] = bool(getattr(user, 'pin_seguridad', None))
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user

        # Registrar fecha del último acceso
        user.fecha_ultimo_acceso = timezone.now()
        user.save(update_fields=['fecha_ultimo_acceso'])

        nombre_completo = user.get_full_name() or user.username
        es_admin = (getattr(user, 'rol', None) == 'admin') or user.is_superuser or user.is_staff
        tiene_pin = bool(getattr(user, 'pin_seguridad', None))

        user_payload = {
            'id': user.id,
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'nombre_completo': nombre_completo,
            'rol': getattr(user, 'rol', 'vendedor'),
            'telefono': getattr(user, 'telefono', ''),
            'activo': getattr(user, 'activo', True),
            'es_admin': es_admin,
            'tiene_pin': tiene_pin,
        }

        data['user'] = user_payload
        # Campos planos directos en la respuesta para máxima compatibilidad
        data['user_id'] = user.id
        data['username'] = user.username
        data['email'] = user.email
        data['first_name'] = user.first_name
        data['last_name'] = user.last_name
        data['nombre_completo'] = nombre_completo
        data['rol'] = getattr(user, 'rol', 'vendedor')
        data['es_admin'] = es_admin
        data['tiene_pin'] = tiene_pin

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Endpoint de login que emite tokens y datos del usuario.
    """
    serializer_class = CustomTokenObtainPairSerializer


class UsuarioViewSet(viewsets.ModelViewSet):
    """
    ViewSet para la gestión administrativa de usuarios y roles (RBAC).
    """
    queryset = Usuario.objects.all().order_by('username')
    serializer_class = UsuarioSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'telefono']
    ordering_fields = ['username', 'date_joined', 'fecha_ultimo_acceso', 'rol']

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        if self.action == 'cambiar_pin':
            return [permissions.IsAuthenticated(), IsAdminOrSelf()]
        if self.action == 'validar_pin_maestro':
            return [permissions.IsAuthenticated()]
        # Solo admin puede listar, crear, editar o eliminar usuarios
        return [permissions.IsAuthenticated(), IsAdmin()]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Usuario.objects.none()
        if getattr(user, 'rol', None) == 'admin' or user.is_superuser or user.is_staff:
            return Usuario.objects.all().order_by('username')
        return Usuario.objects.filter(id=user.id)

    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        Devuelve la información del usuario autenticado actual.
        """
        serializer = self.get_serializer(request.user)
        data = serializer.data
        data['tiene_pin'] = bool(request.user.pin_seguridad)
        return Response(data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsAdminOrSelf])
    def cambiar_pin(self, request, pk=None):
        """
        Actualiza el PIN de seguridad del usuario.
        """
        user = self.get_object()
        raw_pin = request.data.get('pin') or request.data.get('pin_nuevo')
        if not raw_pin or not str(raw_pin).isdigit() or not (4 <= len(str(raw_pin)) <= 6):
            return Response(
                {'error': 'El PIN debe ser un valor numérico de 4 a 6 dígitos.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.set_pin(str(raw_pin))
        user.save(update_fields=['pin_seguridad'])
        return Response({
            'mensaje': 'PIN de seguridad actualizado correctamente.',
            'tiene_pin': True
        })

    @action(detail=False, methods=['post'])
    def validar_pin_maestro(self, request):
        """
        Valida presencialmente si un PIN maestro corresponde a algún administrador activo.
        """
        pin = request.data.get('pin')
        if not pin:
            return Response({'error': 'El PIN es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        admins = Usuario.objects.filter(activo=True).filter(
            Q(rol='admin') | Q(is_superuser=True) | Q(is_staff=True)
        )
        for admin_user in admins:
            if admin_user.check_pin(pin):
                return Response({
                    'valido': True,
                    'admin_id': admin_user.id,
                    'admin_nombre': admin_user.get_full_name() or admin_user.username
                })

        return Response(
            {'valido': False, 'error': 'PIN de administrador no válido o no configurado.'},
            status=status.HTTP_400_BAD_REQUEST
        )


class LogAuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = LogAuditoria.objects.all()
    serializer_class = LogAuditoriaSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
