from rest_framework import serializers
from .models import Usuario, LogAuditoria


class UsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={'input_type': 'password'},
        help_text="Contraseña para inicio de sesión"
    )
    pin = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={'input_type': 'password'},
        help_text="PIN numérico de 4 a 6 dígitos para autorizaciones rápidas"
    )
    tiene_pin = serializers.BooleanField(read_only=True)
    es_admin = serializers.BooleanField(read_only=True)
    nombre_completo = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Usuario
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'nombre_completo',
            'rol', 'telefono', 'activo', 'password', 'pin', 'fecha_ultimo_acceso',
            'tiene_pin', 'es_admin'
        ]
        read_only_fields = ['id', 'fecha_ultimo_acceso', 'tiene_pin', 'es_admin']

    def get_nombre_completo(self, obj):
        return obj.get_full_name() or obj.username

    def validate_pin(self, value):
        if value:
            val_str = str(value).strip()
            if not val_str.isdigit() or not (4 <= len(val_str) <= 6):
                raise serializers.ValidationError("El PIN debe ser un valor numérico de 4 a 6 dígitos.")
            return val_str
        return value

    def validate(self, attrs):
        # Al crear un usuario nuevo, la contraseña es obligatoria
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'La contraseña es obligatoria al crear un usuario nuevo.'})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        pin = validated_data.pop('pin', None)
        activo = validated_data.get('activo', True)
        validated_data['is_active'] = activo

        user = Usuario(**validated_data)
        if password:
            user.set_password(password)
        if pin:
            user.set_pin(pin)
        if validated_data.get('rol') == 'admin':
            user.is_staff = True
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        pin = validated_data.pop('pin', None)

        if 'activo' in validated_data:
            instance.activo = validated_data['activo']
            instance.is_active = validated_data['activo']

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)
        if pin:
            instance.set_pin(pin)
        if instance.rol == 'admin':
            instance.is_staff = True

        instance.save()
        return instance


class LogAuditoriaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)
    
    class Meta:
        model = LogAuditoria
        fields = '__all__'
