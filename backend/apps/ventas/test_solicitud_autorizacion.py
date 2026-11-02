from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import Caja
from apps.nomina.models import Empleado
from apps.ventas.models import SolicitudAutorizacion, Venta

Usuario = get_user_model()


class SolicitudAutorizacionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = Usuario.objects.create_user(
            username='admin_autoriza',
            password='Password123!',
            rol='admin',
            first_name='Don',
            last_name='Emir'
        )
        self.admin.set_pin('4567')
        self.admin.save()

        self.vendedor = Usuario.objects.create_user(
            username='vendedor_autoriza',
            password='Password123!',
            rol='vendedor',
            first_name='Vendedor',
            last_name='Uno'
        )

        self.empleado = Empleado.objects.create(
            nombre='Juan',
            apellido='Pérez',
            puesto='Vendedor',
            salario_base=Decimal('5000.00')
        )

        self.caja = Caja.objects.create(
            folio='CAJA-001',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        self.venta = Venta.objects.create(
            folio='V-000100',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            subtotal=Decimal('1200.00'),
            total=Decimal('1200.00'),
            monto_efectivo=Decimal('1200.00')
        )

    def test_crear_solicitud_autorizacion(self):
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.post('/api/ventas/solicitudes-autorizacion/', {
            'venta': self.venta.id,
            'accion': 'eliminar_venta',
            'motivo': 'Error de cobro en POS'
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertIn('token', data)
        self.assertIn('codigo_otp', data)
        self.assertEqual(len(data['codigo_otp']), 6)
        self.assertEqual(data['estado'], 'pendiente')
        self.assertEqual(data['accion'], 'eliminar_venta')
        self.assertIn('whatsapp_mensaje', data)

    def test_detalle_publico_sin_autenticacion(self):
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta,
            solicitado_por=self.vendedor,
            accion='eliminar_venta',
            motivo='Cliente canceló'
        )

        # Unauthenticated client (mobile WhatsApp click)
        anon_client = APIClient()
        resp = anon_client.get(f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/detalle_publico/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data['venta_folio'], 'V-000100')
        self.assertEqual(data['estado'], 'pendiente')
        # OTP is not exposed before approval
        self.assertNotIn('codigo_otp', data)

    def test_aprobar_remoto_con_pin_admin(self):
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta,
            solicitado_por=self.vendedor,
            accion='editar_venta',
            motivo='Cambio de llanta'
        )

        anon_client = APIClient()
        # Fallo con PIN incorrecto
        resp_bad = anon_client.post(
            f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/aprobar_remoto/',
            {'pin_admin': '0000'}
        )
        self.assertEqual(resp_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Éxito con PIN correcto
        resp_ok = anon_client.post(
            f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/aprobar_remoto/',
            {'pin_admin': '4567'}
        )
        self.assertEqual(resp_ok.status_code, status.HTTP_200_OK)
        data = resp_ok.json()
        self.assertEqual(data['estado'], 'aprobada')
        self.assertEqual(data['codigo_otp'], solicitud.codigo_otp)

        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'aprobada')
        self.assertEqual(solicitud.autorizado_por, self.admin)

    def test_rechazar_remoto(self):
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta,
            solicitado_por=self.vendedor,
            accion='eliminar_venta',
            motivo='Intento erróneo'
        )

        anon_client = APIClient()
        resp = anon_client.post(f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/rechazar_remoto/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'rechazada')

    def test_consumir_otp_valido(self):
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta,
            solicitado_por=self.vendedor,
            accion='eliminar_venta',
            motivo='Prueba OTP',
            estado='aprobada'
        )

        self.client.force_authenticate(user=self.vendedor)
        # OTP incorrecto
        resp_err = self.client.post(
            f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/consumir_otp/',
            {'codigo_otp': '000000'}
        )
        self.assertEqual(resp_err.status_code, status.HTTP_400_BAD_REQUEST)

        # OTP correcto
        resp_ok = self.client.post(
            f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/consumir_otp/',
            {'codigo_otp': solicitud.codigo_otp}
        )
        self.assertEqual(resp_ok.status_code, status.HTTP_200_OK)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'consumida')

    def test_solicitud_expirada_no_se_puede_aprobar(self):
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta,
            solicitado_por=self.vendedor,
            accion='eliminar_venta',
            motivo='Venta expirada',
            expires_at=timezone.now() - timedelta(minutes=1)
        )

        anon_client = APIClient()
        resp = anon_client.post(
            f'/api/ventas/solicitudes-autorizacion/{solicitud.token}/aprobar_remoto/',
            {'pin_admin': '4567'}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'expirada')
