from rest_framework import serializers
from .models import PlantillaCorreo, Recordatorio, EnvioCorreo


class PlantillaCorreoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)

    class Meta:
        model = PlantillaCorreo
        fields = '__all__'


class RecordatorioSerializer(serializers.ModelSerializer):
    plantilla_nombre = serializers.CharField(source='plantilla.nombre', read_only=True)
    frecuencia_display = serializers.CharField(source='get_frecuencia_display', read_only=True)
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = Recordatorio
        fields = '__all__'


class EnvioCorreoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    recordatorio_nombre = serializers.CharField(source='recordatorio.nombre', read_only=True)

    class Meta:
        model = EnvioCorreo
        fields = '__all__'
