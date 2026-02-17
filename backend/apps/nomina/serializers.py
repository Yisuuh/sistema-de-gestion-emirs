"""
Serializers para el módulo de Nómina
"""
from rest_framework import serializers
from .models import Empleado


class EmpleadoSerializer(serializers.ModelSerializer):
    """
    Serializer para empleados
    """
    nombre_completo = serializers.CharField(read_only=True)
    
    class Meta:
        model = Empleado
        fields = [
            'id', 'nombre', 'apellido', 'nombre_completo', 
            'telefono', 'puesto', 'activo', 'fecha_ingreso', 'notas'
        ]
        read_only_fields = ['id']
