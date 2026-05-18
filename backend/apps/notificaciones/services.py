"""
Lógica de negocio: renderizado de plantillas y envío de correos.
"""
import logging
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Variables soportadas en plantillas
_VARS = ['nombre', 'vehiculo', 'medida', 'fecha']


def _renderizar(texto: str, contexto: dict) -> str:
    for clave in _VARS:
        texto = texto.replace(f'{{{{{clave}}}}}', str(contexto.get(clave, '')))
    return texto


def enviar_correo_cliente(cliente, plantilla, recordatorio=None) -> bool:
    """
    Envía un correo a un cliente usando la plantilla dada.
    Registra el resultado en EnvioCorreo.
    Devuelve True si fue exitoso.
    """
    from .models import EnvioCorreo

    if not cliente.email:
        return False

    vehiculo = cliente.vehiculos.first()
    contexto = {
        'nombre': cliente.nombre,
        'vehiculo': f'{vehiculo.marca} {vehiculo.modelo} {vehiculo.año}' if vehiculo else '',
        'medida': vehiculo.medida_llantas if vehiculo else '',
        'fecha': timezone.localdate().strftime('%d/%m/%Y'),
    }

    asunto = _renderizar(plantilla.asunto, contexto)
    cuerpo = _renderizar(plantilla.cuerpo_html, contexto)

    estado = 'enviado'
    error_detalle = ''
    try:
        send_mail(
            subject=asunto,
            message='',  # texto plano vacío — solo HTML
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[cliente.email],
            html_message=cuerpo,
            fail_silently=False,
        )
    except Exception as exc:
        logger.error('Error al enviar correo a %s: %s', cliente.email, exc)
        estado = 'fallido'
        error_detalle = str(exc)

    EnvioCorreo.objects.create(
        cliente=cliente,
        recordatorio=recordatorio,
        destinatario_email=cliente.email,
        destinatario_nombre=cliente.nombre,
        asunto=asunto,
        estado=estado,
        error_detalle=error_detalle,
    )

    return estado == 'enviado'


def ejecutar_recordatorios_pendientes() -> dict:
    """
    Busca recordatorios activos cuya proxima_ejecucion ya llegó,
    envía el correo a todos los clientes con email, y reagenda (o finaliza).
    """
    from .models import Recordatorio
    from apps.clientes.models import Cliente

    ahora = timezone.now()
    pendientes = Recordatorio.objects.filter(
        estado='activo',
        proxima_ejecucion__lte=ahora,
    ).select_related('plantilla')

    total_enviados = 0
    total_fallidos = 0
    recordatorios_ejecutados = []

    clientes = list(Cliente.objects.filter(email__gt='').exclude(email=''))

    for rec in pendientes:
        enviados = 0
        fallidos = 0
        for cliente in clientes:
            ok = enviar_correo_cliente(cliente, rec.plantilla, recordatorio=rec)
            if ok:
                enviados += 1
            else:
                fallidos += 1

        # Reagendar o finalizar
        siguiente = rec.calcular_proxima_ejecucion()
        if siguiente:
            rec.proxima_ejecucion = siguiente
            rec.save(update_fields=['proxima_ejecucion'])
        else:
            rec.estado = 'finalizado'
            rec.save(update_fields=['estado'])

        total_enviados += enviados
        total_fallidos += fallidos
        recordatorios_ejecutados.append({
            'id': rec.id,
            'nombre': rec.nombre,
            'enviados': enviados,
            'fallidos': fallidos,
        })

    return {
        'recordatorios_ejecutados': len(recordatorios_ejecutados),
        'total_enviados': total_enviados,
        'total_fallidos': total_fallidos,
        'detalle': recordatorios_ejecutados,
    }
