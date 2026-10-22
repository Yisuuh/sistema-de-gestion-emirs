from django.db import models


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


