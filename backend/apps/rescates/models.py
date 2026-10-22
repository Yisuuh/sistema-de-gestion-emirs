from django.db import models
from decimal import Decimal


class UnidadMovil(models.Model):
    """
    Unidad móvil de rescate (camioneta, moto, grúa, etc.)
    """
    numero_economico = models.CharField(max_length=20, unique=True, verbose_name="Número Económico")
    nombre = models.CharField(max_length=100, help_text="Ej: Unidad 01 - Ram 700")
    placas = models.CharField(max_length=15, blank=True)
    modelo = models.CharField(max_length=100, blank=True)
    chofer_habitual = models.ForeignKey(
        'nomina.Empleado',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='unidades_asignadas',
        verbose_name="Chofer / Operador habitual"
    )
    activo = models.BooleanField(default=True)
    notas = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Unidad Móvil'
        verbose_name_plural = 'Unidades Móviles'
        ordering = ['numero_economico']

    def __str__(self):
        return f"{self.numero_economico} - {self.nombre}"


class TipoServicioRescate(models.Model):
    """
    Catálogo de servicios para rescate y auxilio vial
    (Desponche en sitio, cambio de llanta, pase de corriente, traslado, etc.)
    """
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    precio_base = models.DecimalField(max_digits=10, decimal_places=2)
    comision_operador = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Comisión para el chofer / operador por servicio"
    )
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Tipo de Servicio de Rescate'
        verbose_name_plural = 'Tipos de Servicios de Rescate'
        ordering = ['nombre']

    def __str__(self):
        return f"{self.nombre} (${self.precio_base})"


class Rescate(models.Model):
    """
    Orden de Rescate / Auxilio Vial
    """
    ESTADO_CHOICES = [
        ('solicitado', 'Solicitado'),
        ('en_camino', 'En camino'),
        ('en_proceso', 'En proceso'),
        ('completado', 'Completado'),
        ('cancelado', 'Cancelado'),
    ]

    METODO_PAGO_CHOICES = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
        ('mixto', 'Mixto'),
    ]

    TIPO_TARJETA_CHOICES = [
        ('debito', 'Tarjeta de Débito'),
        ('credito', 'Tarjeta de Crédito'),
    ]

    folio = models.CharField(max_length=20, unique=True, editable=False)
    fecha_solicitud = models.DateTimeField(auto_now_add=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='solicitado')

    unidad = models.ForeignKey(
        UnidadMovil,
        on_delete=models.PROTECT,
        related_name='rescates',
        null=True,
        blank=True
    )
    operador = models.ForeignKey(
        'nomina.Empleado',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rescates_operados'
    )
    cliente = models.ForeignKey(
        'clientes.Cliente',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rescates'
    )
    vehiculo = models.ForeignKey(
        'clientes.Vehiculo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rescates'
    )
    nombre_cliente = models.CharField(max_length=150)
    telefono_cliente = models.CharField(max_length=20)
    ubicacion_texto = models.TextField(help_text="Dirección o punto de referencia del rescate")
    coordenadas_gps = models.CharField(max_length=100, blank=True, help_text="Coordenadas GPS o link Maps")
    
    vehiculo_marca_modelo = models.CharField(max_length=100, blank=True)
    vehiculo_placas = models.CharField(max_length=20, blank=True)
    medida_llanta = models.CharField(max_length=30, blank=True)

    caja = models.ForeignKey(
        'caja.Caja',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rescates'
    )
    metodo_pago = models.CharField(max_length=20, choices=METODO_PAGO_CHOICES, default='efectivo')
    tipo_tarjeta = models.CharField(max_length=10, choices=TIPO_TARJETA_CHOICES, null=True, blank=True)
    monto_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    monto_electronico = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    num_operacion = models.CharField(max_length=100, blank=True)
    num_referencia = models.CharField(max_length=100, blank=True)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    descuento = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    notas = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Rescate Vial'
        verbose_name_plural = 'Rescates Viales'
        ordering = ['-fecha_solicitud']

    def __str__(self):
        return f"{self.folio} - {self.nombre_cliente} ({self.get_estado_display()})"

    def save(self, *args, **kwargs):
        if not self.folio:
            from apps.ventas.services import generar_siguiente_folio_atomico
            self.folio = generar_siguiente_folio_atomico('RESCATE', Rescate, 'RES-', 6)
        super().save(*args, **kwargs)


class DetalleRescate(models.Model):
    """
    Detalle de productos o servicios provistos durante el auxilio vial
    """
    rescate = models.ForeignKey(Rescate, on_delete=models.CASCADE, related_name='detalles')
    servicio_rescate = models.ForeignKey(
        TipoServicioRescate,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='detalles'
    )
    producto = models.ForeignKey(
        'inventario.Producto',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='detalles_rescate'
    )
    descripcion = models.CharField(max_length=200)
    cantidad = models.IntegerField(default=1)
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = 'Detalle de Rescate'
        verbose_name_plural = 'Detalles de Rescate'

    def __str__(self):
        return f"{self.rescate.folio} - {self.descripcion}"
