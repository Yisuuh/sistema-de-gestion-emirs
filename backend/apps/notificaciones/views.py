from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from apps.clientes.models import Cliente
from .models import PlantillaCorreo, Recordatorio, EnvioCorreo
from .serializers import PlantillaCorreoSerializer, RecordatorioSerializer, EnvioCorreoSerializer
from .services import enviar_correo_cliente, ejecutar_recordatorios_pendientes


class PlantillaCorreoViewSet(viewsets.ModelViewSet):
    queryset = PlantillaCorreo.objects.all()
    serializer_class = PlantillaCorreoSerializer
    permission_classes = [IsAuthenticated]


class RecordatorioViewSet(viewsets.ModelViewSet):
    queryset = Recordatorio.objects.select_related('plantilla').all()
    serializer_class = RecordatorioSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def ejecutar_ahora(self, request, pk=None):
        """Fuerza la ejecución inmediata de un recordatorio."""
        rec = self.get_object()
        clientes = list(Cliente.objects.filter(email__gt='').exclude(email=''))
        enviados = fallidos = 0
        for cliente in clientes:
            ok = enviar_correo_cliente(cliente, rec.plantilla, recordatorio=rec)
            if ok:
                enviados += 1
            else:
                fallidos += 1
        return Response({'enviados': enviados, 'fallidos': fallidos})


class EnvioCorreoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EnvioCorreo.objects.select_related('cliente', 'recordatorio').all()
    serializer_class = EnvioCorreoSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['estado', 'recordatorio']


class EnviarCorreoManualView(APIView):
    """
    POST /api/notificaciones/enviar-manual/
    Envía un correo puntual a uno o varios clientes.

    Body JSON:
    {
        "plantilla_id": 1,
        "cliente_ids": [3, 7, 12]   // vacío = todos los clientes con email
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        plantilla_id = request.data.get('plantilla_id')
        cliente_ids = request.data.get('cliente_ids', [])

        try:
            plantilla = PlantillaCorreo.objects.get(pk=plantilla_id, activa=True)
        except PlantillaCorreo.DoesNotExist:
            return Response({'error': 'Plantilla no encontrada o inactiva.'}, status=400)

        qs = Cliente.objects.filter(email__gt='').exclude(email='')
        if cliente_ids:
            qs = qs.filter(pk__in=cliente_ids)

        clientes = list(qs)
        if not clientes:
            return Response({'error': 'No hay clientes con email para enviar.'}, status=400)

        enviados = fallidos = 0
        for cliente in clientes:
            ok = enviar_correo_cliente(cliente, plantilla)
            if ok:
                enviados += 1
            else:
                fallidos += 1

        return Response({
            'total': len(clientes),
            'enviados': enviados,
            'fallidos': fallidos,
        })


class EjecutarRecordatoriosCronView(APIView):
    """
    POST /api/notificaciones/cron/
    Endpoint que el cron del sistema llama periódicamente (ej. cada hora o diario).
    Protegido con clave secreta para no requerir JWT.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        from django.conf import settings
        clave = request.headers.get('X-Cron-Key', '')
        if clave != getattr(settings, 'CRON_SECRET_KEY', ''):
            return Response({'error': 'No autorizado.'}, status=403)
        resultado = ejecutar_recordatorios_pendientes()
        return Response(resultado)
