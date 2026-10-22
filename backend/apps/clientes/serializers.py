import re
import urllib.parse
from django.utils import timezone
from rest_framework import serializers
from .models import Cliente, Vehiculo


class VehiculoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    cliente_telefono = serializers.CharField(source='cliente.telefono', read_only=True)
    estado_alerta = serializers.SerializerMethodField()
    dias_para_servicio = serializers.SerializerMethodField()
    whatsapp_recordatorio_url = serializers.SerializerMethodField()

    class Meta:
        model = Vehiculo
        fields = [
            'id', 'cliente', 'cliente_nombre', 'cliente_telefono',
            'marca', 'modelo', 'año', 'placas', 'color',
            'medida_llantas', 'medida_llanta_delantera', 'medida_llanta_trasera',
            'kilometraje_ultimo', 'fecha_ultimo_servicio', 'fecha_proximo_servicio',
            'notas', 'estado_alerta', 'dias_para_servicio',
            'whatsapp_recordatorio_url', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_dias_para_servicio(self, obj):
        if not obj.fecha_proximo_servicio:
            return None
        hoy = timezone.localdate()
        return (obj.fecha_proximo_servicio - hoy).days

    def get_estado_alerta(self, obj):
        if not obj.fecha_proximo_servicio:
            return 'sin_registro'
        hoy = timezone.localdate()
        dias = (obj.fecha_proximo_servicio - hoy).days
        if dias < 0:
            return 'vencido'
        elif dias <= 15:
            return 'proximo'
        return 'al_dia'

    def get_whatsapp_recordatorio_url(self, obj):
        telefono = getattr(obj.cliente, 'telefono', '') or ''
        telefono_limpio = re.sub(r'\D', '', telefono)
        if len(telefono_limpio) == 10:
            telefono_limpio = f"52{telefono_limpio}"
        placas_str = f" ({obj.placas})" if obj.placas else ""
        cliente_nom = getattr(obj.cliente, 'nombre', 'Cliente')
        mensaje = (
            f"¡Hola {cliente_nom}! 🛞 Le saludamos de *Centro Llantero EmirS*. "
            f"Le recordamos que su vehículo *{obj.marca} {obj.modelo}{placas_str}* "
            f"tiene programado su servicio semestral de *rotación y balanceo* para mantener "
            f"la vida útil de sus llantas y su seguridad en camino. ¿Gustaría agendar su visita?"
        )
        return f"https://wa.me/{telefono_limpio}?text={urllib.parse.quote(mensaje)}"


class ClienteSerializer(serializers.ModelSerializer):
    vehiculos = VehiculoSerializer(many=True, read_only=True)
    total_compras = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = [
            'id', 'nombre', 'telefono', 'email', 'rfc',
            'direccion', 'notas', 'created_at', 'vehiculos', 'total_compras'
        ]
        read_only_fields = ['id', 'created_at']

    def get_total_compras(self, obj):
        return obj.ventas.count()

