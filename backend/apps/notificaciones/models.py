"""
Modelos para el módulo de Notificaciones y Correos
"""
from django.db import models
from django.utils import timezone


class PlantillaCorreo(models.Model):
    """
    Plantillas reutilizables para envío de correos.
    Soporta variables: {{nombre}}, {{vehiculo}}, {{medida}}, {{fecha}}
    """
    TIPOS = [
        ('recordatorio', 'Recordatorio'),
        ('publicidad', 'Publicidad'),
        ('otro', 'Otro'),
    ]

    nombre = models.CharField(max_length=100, unique=True, help_text='Nombre interno de la plantilla')
    tipo = models.CharField(max_length=20, choices=TIPOS, default='recordatorio')
    asunto = models.CharField(max_length=200)
    cuerpo_html = models.TextField(
        help_text='Cuerpo en HTML. Variables disponibles: {{nombre}}, {{vehiculo}}, {{medida}}, {{fecha}}'
    )
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Plantilla de Correo'
        verbose_name_plural = 'Plantillas de Correo'
        ordering = ['nombre']

    def __str__(self):
        return f'{self.nombre} ({self.get_tipo_display()})'


class Recordatorio(models.Model):
    """
    Recordatorio periódico que se envía automáticamente a todos los clientes
    con email registrado, en la fecha y hora programadas.
    """
    FRECUENCIAS = [
        ('unico', 'Envío único'),
        ('mensual', 'Mensual'),
        ('bimestral', 'Bimestral (cada 2 meses)'),
        ('trimestral', 'Trimestral'),
        ('semestral', 'Semestral'),
        ('anual', 'Anual'),
    ]

    ESTADOS = [
        ('activo', 'Activo'),
        ('pausado', 'Pausado'),
        ('finalizado', 'Finalizado'),
    ]

    nombre = models.CharField(max_length=100, help_text='Nombre descriptivo del recordatorio')
    plantilla = models.ForeignKey(
        PlantillaCorreo, on_delete=models.PROTECT, related_name='recordatorios'
    )
    frecuencia = models.CharField(max_length=20, choices=FRECUENCIAS, default='mensual')
    proxima_ejecucion = models.DateTimeField(help_text='Fecha y hora del próximo envío')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='activo')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Recordatorio Automático'
        verbose_name_plural = 'Recordatorios Automáticos'
        ordering = ['proxima_ejecucion']

    def __str__(self):
        return f'{self.nombre} — {self.get_frecuencia_display()}'

    def calcular_proxima_ejecucion(self):
        """Calcula la siguiente fecha de ejecución según la frecuencia."""
        from dateutil.relativedelta import relativedelta
        ahora = timezone.now()
        meses = {
            'mensual': 1,
            'bimestral': 2,
            'trimestral': 3,
            'semestral': 6,
            'anual': 12,
        }
        if self.frecuencia == 'unico':
            return None
        delta = meses.get(self.frecuencia, 1)
        return ahora + relativedelta(months=delta)


class EnvioCorreo(models.Model):
    """
    Historial de cada correo enviado.
    """
    ESTADOS = [
        ('enviado', 'Enviado'),
        ('fallido', 'Fallido'),
    ]

    cliente = models.ForeignKey(
        'clientes.Cliente', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='correos_enviados'
    )
    recordatorio = models.ForeignKey(
        Recordatorio, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='envios'
    )
    destinatario_email = models.EmailField()
    destinatario_nombre = models.CharField(max_length=200)
    asunto = models.CharField(max_length=200)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='enviado')
    error_detalle = models.TextField(blank=True)
    enviado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Envío de Correo'
        verbose_name_plural = 'Historial de Envíos'
        ordering = ['-enviado_at']

    def __str__(self):
        return f'{self.destinatario_email} — {self.asunto} ({self.estado})'
