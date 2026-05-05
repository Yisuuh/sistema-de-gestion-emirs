from rest_framework import serializers
from .models import Empleado, LineaNomina, PeriodoNomina


class EmpleadoSerializer(serializers.ModelSerializer):
    nombre_completo = serializers.CharField(read_only=True)

    class Meta:
        model = Empleado
        fields = [
            'id', 'nombre', 'apellido', 'nombre_completo',
            'telefono', 'puesto', 'activo', 'fecha_ingreso',
            'salario_base', 'tipo_pago', 'metodo_pago',
            'comision_porcentaje', 'pago_dominical',
            'curp', 'rfc', 'nss', 'banco', 'cuenta_bancaria',
            'notas',
        ]
        read_only_fields = ['id']


class LineaNominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre_completo', read_only=True)
    empleado_puesto = serializers.CharField(source='empleado.puesto', read_only=True)
    empleado_metodo_pago = serializers.CharField(source='empleado.metodo_pago', read_only=True)

    class Meta:
        model = LineaNomina
        fields = [
            'id', 'periodo', 'empleado',
            'empleado_nombre', 'empleado_puesto', 'empleado_metodo_pago',
            'sueldo', 'comision', 'bonos', 'domingo', 'descuentos',
            'efectivo', 'transferencia',
            'total_percepciones', 'neto',
            'observaciones',
        ]
        read_only_fields = ['id', 'total_percepciones', 'neto']

    def validate(self, data):
        sueldo = data.get('sueldo', 0)
        comision = data.get('comision', 0)
        bonos = data.get('bonos', 0)
        domingo = data.get('domingo', 0)
        descuentos = data.get('descuentos', 0)
        # No negatives
        for field, val in [('sueldo', sueldo), ('comision', comision), ('bonos', bonos),
                           ('domingo', domingo), ('descuentos', descuentos)]:
            if val < 0:
                raise serializers.ValidationError({field: 'No se permiten valores negativos.'})
        return data


class PeriodoNominaSerializer(serializers.ModelSerializer):
    estado_display = serializers.CharField(source='get_estado_display', read_only=True)
    lineas_count = serializers.SerializerMethodField()

    class Meta:
        model = PeriodoNomina
        fields = [
            'id', 'fecha_inicio', 'fecha_fin', 'estado', 'estado_display',
            'observaciones',
            'total_efectivo', 'total_transferencia', 'total_general',
            'total_comisiones', 'total_domingos',
            'lineas_count', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'total_efectivo', 'total_transferencia', 'total_general',
            'total_comisiones', 'total_domingos', 'created_at', 'updated_at',
        ]

    def get_lineas_count(self, obj):
        return obj.lineas.count()


class PeriodoNominaDetalleSerializer(PeriodoNominaSerializer):
    lineas = LineaNominaSerializer(many=True, read_only=True)

    class Meta(PeriodoNominaSerializer.Meta):
        fields = PeriodoNominaSerializer.Meta.fields + ['lineas']


