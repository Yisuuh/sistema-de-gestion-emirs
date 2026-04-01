from rest_framework import serializers
from .models import Cliente, Vehiculo


class VehiculoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehiculo
        fields = ['id', 'cliente', 'marca', 'modelo', 'año', 'placas', 'medida_llantas', 'created_at']
        read_only_fields = ['id', 'created_at']


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
