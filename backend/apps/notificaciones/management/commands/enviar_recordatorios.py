"""
Comando de management para ejecutar recordatorios pendientes.
Usar con cron:
  0 8 * * * /ruta/venv/bin/python /ruta/manage.py enviar_recordatorios
"""
from django.core.management.base import BaseCommand
from apps.notificaciones.services import ejecutar_recordatorios_pendientes


class Command(BaseCommand):
    help = 'Envía los recordatorios automáticos cuya fecha de ejecución ya llegó.'

    def handle(self, *args, **options):
        resultado = ejecutar_recordatorios_pendientes()
        self.stdout.write(
            self.style.SUCCESS(
                f"Recordatorios ejecutados: {resultado['recordatorios_ejecutados']} | "
                f"Enviados: {resultado['total_enviados']} | "
                f"Fallidos: {resultado['total_fallidos']}"
            )
        )
        for d in resultado['detalle']:
            self.stdout.write(f"  - [{d['id']}] {d['nombre']}: {d['enviados']} enviados, {d['fallidos']} fallidos")
