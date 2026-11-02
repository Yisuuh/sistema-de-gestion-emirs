"""
Servicios del módulo de Ventas
"""
import re
from django.db import transaction
from .models import SecuenciaFolio


def generar_siguiente_folio_atomico(codigo, model_class, prefijo, digitos=6):
    """
    Genera el siguiente folio correlativo de forma atómica y concurrente segura.
    Bloquea la fila en SecuenciaFolio mediante select_for_update().
    Si es la primera vez que se consulta la secuencia (o su valor es 0),
    auto-inicializa calculando el folio máximo actual existente en model_class.
    Garantiza además que el candidato no colisione con folios preexistentes.
    """
    with transaction.atomic():
        seq, _ = SecuenciaFolio.objects.select_for_update().get_or_create(
            codigo=codigo,
            defaults={
                'prefijo': prefijo,
                'longitud_digitos': digitos,
                'ultimo_numero': 0,
            }
        )

        if seq.ultimo_numero == 0:
            max_num = 0
            folios = (
                model_class.objects
                .exclude(folio__isnull=True)
                .exclude(folio='')
                .values_list('folio', flat=True)
            )
            patron_prefijo = rf"^{re.escape(prefijo)}(\d+)$"
            for f in folios:
                if f:
                    match = re.search(patron_prefijo, str(f).strip())
                    if match:
                        try:
                            num = int(match.group(1))
                            if num > max_num:
                                max_num = num
                        except ValueError:
                            pass
            seq.ultimo_numero = max_num

        while True:
            seq.ultimo_numero += 1
            candidato = f"{prefijo}{seq.ultimo_numero:0{digitos}d}"
            if not model_class.objects.filter(folio=candidato).exists():
                break

        seq.save(update_fields=['ultimo_numero', 'updated_at'])
        return candidato
