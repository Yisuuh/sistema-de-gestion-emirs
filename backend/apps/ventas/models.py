import secrets
import uuid
from datetime import timedelta
from decimal import Decimal
from django.db import models
from django.utils import timezone


def generar_otp_6_digitos():
    return f"{secrets.randbelow(1000000):06d}"



class Venta(models.Model):
    """
    Registro de ventas (POS)
    """
    METODOS_PAGO = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
        ('mixto', 'Mixto'),
    ]
    
    TIPOS_TARJETA = [
        ('debito', 'Tarjeta de Débito'),
        ('credito', 'Tarjeta de Crédito'),
    ]
    
    folio = models.CharField(max_length=20, unique=True, editable=False)
    fecha = models.DateTimeField(auto_now_add=True)
    caja = models.ForeignKey(
        'caja.Caja', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='ventas',
        help_text='Caja en la que se registró la venta'
    )
    empleado = models.ForeignKey('nomina.Empleado', on_delete=models.PROTECT, related_name='ventas')
    cliente = models.ForeignKey('clientes.Cliente', on_delete=models.SET_NULL, null=True, blank=True, related_name='ventas')
    vehiculo = models.ForeignKey('clientes.Vehiculo', on_delete=models.SET_NULL, null=True, blank=True, related_name='ventas')
    kilometraje_actual = models.PositiveIntegerField(null=True, blank=True)
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO)
    tipo_tarjeta = models.CharField(max_length=10, choices=TIPOS_TARJETA, blank=True, null=True)
    num_voucher_efectivo = models.IntegerField(null=True, blank=True)
    num_voucher_tarjeta = models.IntegerField(null=True, blank=True)
    num_voucher_transferencia = models.IntegerField(null=True, blank=True)
    monto_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monto_electronico = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    num_operacion = models.CharField(
        max_length=100, blank=True,
        help_text='Número de operación para pagos con tarjeta'
    )
    num_referencia = models.CharField(
        max_length=100, blank=True,
        help_text='Número de referencia para pagos por transferencia'
    )
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    descuento = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    notas = models.TextField(blank=True)
    # Facturación
    facturada = models.BooleanField(default=False)
    cfdi_uuid = models.CharField(max_length=100, blank=True, help_text='UUID del CFDI emitido')
    factura_pendiente = models.BooleanField(default=False, help_text='Cliente solicitó factura')
    
    # Trazabilidad y auditoría de ediciones/autorizaciones
    fue_editada = models.BooleanField(default=False)
    fecha_edicion = models.DateTimeField(null=True, blank=True)
    editada_por = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ventas_editadas'
    )
    motivo_edicion = models.TextField(blank=True, default='')
    autorizada_por = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ventas_autorizadas'
    )
    total_original = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    diferencia_monetaria = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    class Meta:
        verbose_name = 'Venta'
        verbose_name_plural = 'Ventas'
        ordering = ['-fecha']
    
    def __str__(self):
        return f"{self.folio} - ${self.total} - {self.fecha.strftime('%Y-%m-%d')}"


class DetalleVenta(models.Model):
    """
    Detalle de productos/servicios en una venta
    """
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey('inventario.Producto', on_delete=models.PROTECT, null=True, blank=True)
    servicio = models.ForeignKey('ventas.Servicio', on_delete=models.PROTECT, null=True, blank=True)
    descripcion = models.CharField(max_length=200)
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    
    class Meta:
        verbose_name = 'Detalle de Venta'
        verbose_name_plural = 'Detalles de Venta'
    
    def __str__(self):
        return f"{self.venta.folio} - {self.descripcion}"


class Servicio(models.Model):
    """
    Catálogo de servicios
    """
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    precio = models.DecimalField(max_digits=10, decimal_places=2)
    activo = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Servicio'
        verbose_name_plural = 'Servicios'
        ordering = ['nombre']
    
    def __str__(self):
        return f"{self.nombre} - ${self.precio}"


class SecuenciaFolio(models.Model):
    """
    Control de secuencia atómica de folios por entidad (VENTA, CAJA, RESCATE, etc.)
    """
    codigo = models.CharField(max_length=30, unique=True)  # 'VENTA', 'CAJA', 'RESCATE'
    prefijo = models.CharField(max_length=10)               # 'V-', 'C-', 'RES-'
    longitud_digitos = models.PositiveSmallIntegerField(default=6)
    ultimo_numero = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Secuencia de Folio'
        verbose_name_plural = 'Secuencias de Folios'

    def __str__(self):
        return f"{self.codigo}: {self.prefijo}{self.ultimo_numero:0{self.longitud_digitos}d}"


class Cotizacion(models.Model):
    """
    Cotización multimarca (Stock + Sobre pedido) con calculadora de margen interna
    """
    ESTADOS = [
        ('vigente', 'Vigente'),
        ('aceptada', 'Aceptada'),
        ('vencida', 'Vencida'),
        ('cancelada', 'Cancelada'),
    ]

    folio = models.CharField(max_length=20, unique=True, editable=False)
    fecha = models.DateTimeField(auto_now_add=True)
    vigencia_dias = models.PositiveSmallIntegerField(default=5)
    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cotizaciones'
    )
    vehiculo = models.ForeignKey(
        'clientes.Vehiculo', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cotizaciones'
    )
    nombre_cliente = models.CharField(max_length=200, blank=True, default='')
    telefono_cliente = models.CharField(max_length=20, blank=True, default='')
    vehiculo_referencia = models.CharField(max_length=150, blank=True, default='')
    medida_solicitada = models.CharField(max_length=30, blank=True, default='')
    cantidad_requerida = models.PositiveSmallIntegerField(default=4)
    mostrar_msi = models.BooleanField(
        default=True,
        help_text="Indica si se incluye el desglose de Meses Sin Intereses en PDF y WhatsApp"
    )
    factor_interes = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal('1.0790'),
        help_text="Factor de financiamiento bancario aplicado al costo y márgenes (defecto 1.0790 = 7.9%)"
    )
    incluye_montaje = models.BooleanField(default=True)
    incluye_balanceo = models.BooleanField(default=True)
    incluye_valvula = models.BooleanField(default=True)
    incluye_alineacion = models.BooleanField(default=False)
    servicios_adicionales = models.JSONField(
        default=list,
        blank=True,
        help_text="Lista de nombres de servicios adicionales incluidos en la cotización"
    )
    notas_cliente = models.TextField(blank=True, default='')
    notas_internas = models.TextField(blank=True, default='')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='vigente')
    elaborado_por = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cotizaciones'
    )

    class Meta:
        verbose_name = 'Cotización'
        verbose_name_plural = 'Cotizaciones'
        ordering = ['-fecha']

    def save(self, *args, **kwargs):
        if not self.folio:
            from apps.ventas.services import generar_siguiente_folio_atomico
            self.folio = generar_siguiente_folio_atomico('COTIZACION', Cotizacion, 'COT-', 6)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.folio} - {self.nombre_cliente or 'Cliente General'}"


class OpcionCotizacion(models.Model):
    """
    Opción comparativa dentro de una cotización (Económica, Media, Premium)
    """
    GAMAS = [
        ('economica', 'Económica'),
        ('media', 'Media'),
        ('premium', 'Premium'),
    ]

    ORIGENES = [
        ('stock', 'En Stock'),
        ('sobre_pedido', 'Sobre Pedido'),
    ]

    TIPOS_MARGEN = [
        ('porcentaje', 'Porcentaje (%)'),
        ('monto_fijo', 'Monto Fijo ($)'),
    ]

    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='opciones')
    gama = models.CharField(max_length=20, choices=GAMAS, default='media')
    origen = models.CharField(max_length=20, choices=ORIGENES, default='stock')
    producto = models.ForeignKey(
        'inventario.Producto', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='opciones_cotizacion'
    )
    proveedor = models.ForeignKey(
        'inventario.Proveedor', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='opciones_cotizacion'
    )
    proveedor_nombre_libre = models.CharField(max_length=150, blank=True, default='')
    marca = models.CharField(max_length=80)
    modelo = models.CharField(max_length=100, blank=True, default='')
    medida = models.CharField(max_length=30)
    tiempo_entrega = models.CharField(max_length=80, default='Inmediata')
    costo_proveedor = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    costo_incluye_iva = models.BooleanField(
        default=False,
        help_text="Indica si el costo capturado ya incluye el 16% de IVA"
    )
    costo_con_iva = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0.00'),
        help_text="Costo unitario efectivo con IVA incluido"
    )
    utiliza_tabulador = models.BooleanField(
        default=True,
        help_text="Indica si se aplicó el tabulador oficial de utilidades por Rin"
    )
    categoria_rin = models.CharField(
        max_length=25, blank=True, default='',
        help_text="Categoría aplicada: 'rin_13_15', 'rin_16', 'rin_17_auto', 'rin_17_18', 'rin_19_24', 'libre'"
    )
    margen_unitario_1 = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    margen_unitario_2 = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    margen_unitario_4 = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    tipo_margen = models.CharField(max_length=20, choices=TIPOS_MARGEN, default='porcentaje')
    valor_margen = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio_unitario_publico = models.DecimalField(max_digits=10, decimal_places=2)
    precio_par = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio_juego_4 = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio_cantidad_solicitada = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    recomendada = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Opción de Cotización'
        verbose_name_plural = 'Opciones de Cotización'
        ordering = ['precio_unitario_publico']

    def __str__(self):
        return f"{self.cotizacion.folio} - {self.marca} {self.modelo} ({self.medida})"


class SolicitudAutorizacion(models.Model):
    """
    Solicitud de autorización para acciones críticas sobre ventas (eliminar o editar).
    Admite flujo presencial con PIN maestro o remoto vía token seguro y OTP de 15 minutos.
    """
    ACCIONES = [
        ('eliminar_venta', 'Eliminar Venta'),
        ('editar_venta', 'Editar Venta'),
    ]
    ESTADOS = [
        ('pendiente', 'Pendiente'),
        ('aprobada', 'Aprobada'),
        ('rechazada', 'Rechazada'),
        ('expirada', 'Expirada'),
        ('consumida', 'Consumida'),
    ]

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    codigo_otp = models.CharField(max_length=6, help_text="Código numérico de 6 dígitos")
    accion = models.CharField(max_length=30, choices=ACCIONES)
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='solicitudes_autorizacion')
    solicitado_por = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.CASCADE, related_name='solicitudes_creadas'
    )
    autorizado_por = models.ForeignKey(
        'usuarios.Usuario', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solicitudes_autorizadas'
    )
    motivo = models.TextField(help_text="Motivo obligatorio ingresado por el vendedor")
    estado = models.CharField(max_length=20, choices=ESTADOS, default='pendiente')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    ip_solicitud = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = 'Solicitud de Autorización'
        verbose_name_plural = 'Solicitudes de Autorización'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.codigo_otp:
            self.codigo_otp = generar_otp_6_digitos()
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=15)
        super().save(*args, **kwargs)

    @property
    def esta_expirada(self):
        if self.estado == 'pendiente' and self.expires_at and timezone.now() > self.expires_at:
            return True
        return self.estado == 'expirada'

    def __str__(self):
        return f"{self.get_accion_display()} - {self.venta.folio} ({self.estado})"



