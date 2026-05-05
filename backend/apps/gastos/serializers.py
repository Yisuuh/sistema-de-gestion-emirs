from rest_framework import serializers
from .models import CategoriaGasto, Gasto


class CategoriaGastoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaGasto
        fields = '__all__'


class GastoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    responsable_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Gasto
        fields = [
            'id', 'fecha', 'concepto', 'categoria', 'categoria_nombre',
            'monto', 'metodo_pago', 'responsable', 'responsable_nombre',
            'caja', 'evidencia', 'notas', 'created_at',
        ]
        read_only_fields = ['created_at']

    def get_responsable_nombre(self, obj):
        if obj.responsable:
            return f'{obj.responsable.nombre} {obj.responsable.apellido}'.strip()
        return None

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return value
