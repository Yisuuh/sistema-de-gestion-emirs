from rest_framework import serializers
from .models import Usuario, LogAuditoria


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'rol', 'telefono', 'activo', 'fecha_ultimo_acceso']
        read_only_fields = ['id', 'fecha_ultimo_acceso']


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)
    
    class Meta:
        model = LogAuditoria
        fields = '__all__'
