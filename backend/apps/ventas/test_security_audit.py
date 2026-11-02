from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.caja.models import Caja
from apps.nomina.models import Empleado
from apps.ventas.models import Cotizacion, OpcionCotizacion, SolicitudAutorizacion, Venta

Usuario = get_user_model()


class SecurityAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin User with PIN
        self.admin = Usuario.objects.create_user(
            username='admin_seguridad',
            password='AdminPassword123!',
            rol='admin',
            first_name='Admin',
            last_name='Principal'
        )
        self.admin.set_pin('9876')
        self.admin.save()

        # Operator / Seller User
        self.vendedor = Usuario.objects.create_user(
            username='vendedor_seguridad',
            password='VendedorPassword123!',
            rol='vendedor',
            first_name='Operador',
            last_name='Caja'
        )

        self.empleado = Empleado.objects.create(
            nombre='Carlos',
            apellido='López',
            puesto='Cajero',
            salario_base=Decimal('6000.00')
        )

        self.caja_abierta = Caja.objects.create(
            folio='CAJA-SEC-01',
            monto_inicial=Decimal('2000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        self.caja_cerrada = Caja.objects.create(
            folio='CAJA-SEC-02',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='cerrada'
        )

        self.venta_abierta = Venta.objects.create(
            folio='V-SEC-001',
            caja=self.caja_abierta,
            empleado=self.empleado,
            metodo_pago='efectivo',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            monto_efectivo=Decimal('500.00')
        )

        self.venta_cerrada = Venta.objects.create(
            folio='V-SEC-002',
            caja=self.caja_cerrada,
            empleado=self.empleado,
            metodo_pago='efectivo',
            subtotal=Decimal('350.00'),
            total=Decimal('350.00'),
            monto_efectivo=Decimal('350.00')
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 1. AUDITORÍA: ReporteContableExcelView
    # ─────────────────────────────────────────────────────────────────────────
    def test_reporte_contable_anonimo_recibe_401(self):
        """Usuarios no autenticados deben recibir 401 Unauthorized."""
        resp = self.client.get('/api/reportes/contable-excel/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reporte_contable_autenticado_recibe_200(self):
        """Usuario autenticado puede descargar el libro de auditoría Excel."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get('/api/reportes/contable-excel/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resp['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        self.assertIn('attachment; filename=', resp['Content-Disposition'])

    def test_reporte_contable_resiste_inyecciones_en_parametros(self):
        """
        Parámetros maliciosos o con intentos de SQL Injection no deben romper la vista
        ni provocar inyecciones (ORM sanitiza y bloques try/except controlan formato).
        """
        self.client.force_authenticate(user=self.admin)
        sql_injections = [
            {'fecha_inicio': "' OR '1'='1", 'fecha_fin': "2026-12-31'--"},
            {'mes': "1; DROP TABLE ventas_venta;--", 'anio': '2026'},
            {'mes': "' UNION SELECT 1,2,3--", 'anio': "'"},
        ]
        for params in sql_injections:
            resp = self.client.get('/api/reportes/contable-excel/', params)
            self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. AUDITORÍA: Flujo de Autorización de Ventas (PIN y OTP)
    # ─────────────────────────────────────────────────────────────────────────
    def test_vendedor_no_puede_eliminar_venta_sin_autorizacion(self):
        """Un vendedor sin PIN admin ni OTP debe ser rechazado con 403."""
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(f'/api/ventas/ventas/{self.venta_abierta.id}/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('autorización', resp.json().get('error', '').lower())
        # Verificar que la venta NO fue eliminada
        self.assertTrue(Venta.objects.filter(id=self.venta_abierta.id).exists())

    def test_vendedor_no_puede_editar_venta_sin_autorizacion(self):
        """Un vendedor sin PIN admin ni OTP no puede modificar una venta (PATCH)."""
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.patch(
            f'/api/ventas/ventas/{self.venta_abierta.id}/',
            {'notas': 'Intento de edición fraudulenta'}
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.venta_abierta.refresh_from_db()
        self.assertNotEqual(self.venta_abierta.notas, 'Intento de edición fraudulenta')

    def test_vendedor_con_pin_invalido_es_rechazado(self):
        """Un PIN incorrecto debe devolver 403 Forbidden."""
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(
            f'/api/ventas/ventas/{self.venta_abierta.id}/?pin_admin=0000&motivo=Prueba'
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('inválido', resp.json().get('error', '').lower())

    def test_vendedor_con_pin_admin_valido_elimina_correctamente(self):
        """Un vendedor con el PIN correcto del administrador puede eliminar la venta."""
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(
            f'/api/ventas/ventas/{self.venta_abierta.id}/?pin_admin=9876&motivo=Error de cobro validado'
        )
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Venta.objects.filter(id=self.venta_abierta.id).exists())

    def test_vendedor_con_otp_aprobado_elimina_y_se_consume(self):
        """
        Un vendedor con OTP generado y aprobado puede eliminar.
        Una vez consumido el OTP, no puede reutilizarse.
        """
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta_abierta,
            solicitado_por=self.vendedor,
            autorizado_por=self.admin,
            accion='editar_venta',
            motivo='Edición autorizada por cliente',
            estado='aprobada',
            expires_at=timezone.now() + timedelta(minutes=15)
        )
        otp = solicitud.codigo_otp

        self.client.force_authenticate(user=self.vendedor)

        # 1er intento con OTP aprobado -> éxito
        resp = self.client.patch(
            f'/api/ventas/ventas/{self.venta_abierta.id}/',
            {
                'notas': 'Edición autorizada con OTP',
                'motivo': 'Ajuste de notas',
                'codigo_autorizacion': otp
            }
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Confirmar que la solicitud pasó a estado 'consumida'
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'consumida')

        # 2do intento reutilizando OTP ya consumido -> 403 Forbidden
        resp_reutilizar = self.client.patch(
            f'/api/ventas/ventas/{self.venta_abierta.id}/',
            {
                'notas': 'Reintento con OTP consumido',
                'motivo': 'Reintento fraudulento',
                'codigo_autorizacion': otp
            }
        )
        self.assertEqual(resp_reutilizar.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('ya utilizado', resp_reutilizar.json().get('error', '').lower())

    def test_vendedor_con_otp_aprobado_elimina_correctamente(self):
        """Un vendedor con OTP aprobado puede eliminar la venta."""
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta_abierta,
            solicitado_por=self.vendedor,
            autorizado_por=self.admin,
            accion='eliminar_venta',
            motivo='Cancelación solicitada por cliente',
            estado='aprobada',
            expires_at=timezone.now() + timedelta(minutes=15)
        )
        otp = solicitud.codigo_otp
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(
            f'/api/ventas/ventas/{self.venta_abierta.id}/?codigo_autorizacion={otp}&motivo=Cancelación'
        )
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Venta.objects.filter(id=self.venta_abierta.id).exists())

    def test_otp_de_otra_venta_no_autoriza_venta_diferente(self):
        """Un OTP generado para venta A no puede ser usado para venta B."""
        solicitud = SolicitudAutorizacion.objects.create(
            venta=self.venta_abierta,
            solicitado_por=self.vendedor,
            autorizado_por=self.admin,
            accion='eliminar_venta',
            motivo='Cancelación',
            estado='aprobada',
            expires_at=timezone.now() + timedelta(minutes=15)
        )

        otra_venta = Venta.objects.create(
            folio='V-SEC-DIFF',
            caja=self.caja_abierta,
            empleado=self.empleado,
            metodo_pago='efectivo',
            subtotal=Decimal('200.00'),
            total=Decimal('200.00'),
            monto_efectivo=Decimal('200.00')
        )

        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(
            f'/api/ventas/ventas/{otra_venta.id}/?codigo_autorizacion={solicitud.codigo_otp}&motivo=Test'
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_se_puede_eliminar_venta_en_caja_cerrada_aun_con_pin(self):
        """Integridad contable: una venta en caja cerrada no puede ser eliminada ni con PIN admin."""
        self.client.force_authenticate(user=self.vendedor)
        resp = self.client.delete(
            f'/api/ventas/ventas/{self.venta_cerrada.id}/?pin_admin=9876&motivo=Eliminar cerrada'
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cerrada', resp.json().get('error', '').lower())
        self.assertTrue(Venta.objects.filter(id=self.venta_cerrada.id).exists())

    # ─────────────────────────────────────────────────────────────────────────
    # 3. AUDITORÍA: Seguridad, Permisos y Confidencialidad en Cotizaciones
    # ─────────────────────────────────────────────────────────────────────────
    def test_cotizacion_anonimo_recibe_401(self):
        """Peticiones no autenticadas a cotizaciones deben ser rechazadas con 401."""
        # Listado
        resp_list = self.client.get('/api/ventas/cotizaciones/')
        self.assertEqual(resp_list.status_code, status.HTTP_401_UNAUTHORIZED)

        # Creación
        resp_create = self.client.post('/api/ventas/cotizaciones/', {'nombre_cliente': 'Hacker'})
        self.assertEqual(resp_create.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cotizacion_factor_interes_negativo_o_anomalo_es_rechazado(self):
        """Valores negativos o anómalos de factor_interes deben ser rechazados con 400 Bad Request."""
        self.client.force_authenticate(user=self.vendedor)
        
        casos_invalidos = [
            Decimal('-1.0800'),
            Decimal('0.0000'),
            Decimal('0.5000'),
            Decimal('5.0000'),
            'inyeccion_texto',
        ]

        payload_base = {
            'nombre_cliente': 'Cliente Prueba Seguridad',
            'telefono_cliente': '9991234567',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'opciones': [
                {
                    'marca': 'Michelin',
                    'modelo': 'Primacy 4',
                    'medida': '205/55R16',
                    'costo_proveedor': '1500.00',
                    'precio_unitario_publico': '2200.00',
                }
            ]
        }

        for factor in casos_invalidos:
            data = dict(payload_base)
            data['factor_interes'] = factor
            resp = self.client.post('/api/ventas/cotizaciones/', data, format='json')
            self.assertEqual(
                resp.status_code,
                status.HTTP_400_BAD_REQUEST,
                f"El factor_interes={factor} debió ser rechazado con 400 pero devolvió {resp.status_code}"
            )

    def test_cotizacion_factor_interes_valido_es_aceptado(self):
        """Un factor_interes normal (ej. 1.0800 = 8%) debe ser aceptado y persistido."""
        self.client.force_authenticate(user=self.vendedor)
        payload = {
            'nombre_cliente': 'Cliente Válido',
            'telefono_cliente': '9991234567',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'factor_interes': '1.0800',
            'mostrar_msi': True,
            'opciones': [
                {
                    'marca': 'Pirelli',
                    'modelo': 'Cinturato P7',
                    'medida': '205/55R16',
                    'costo_proveedor': '1400.00',
                    'precio_unitario_publico': '2100.00',
                }
            ]
        }
        resp = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(resp.data['factor_interes'])), Decimal('1.0800'))

    def test_cotizacion_pdf_confidencialidad_regla_de_oro(self):
        """
        REGLA DE ORO DE SEGURIDAD COMERCIAL:
        El PDF generado jamás debe exponer costo_proveedor, costo_con_iva,
        factor_interes, margen, proveedor ni notas_internas.
        Solo debe incluir precios públicos y desglose comercial de 3 MSI.
        """
        # Crear cotización con datos sensibles internos
        cot = Cotizacion.objects.create(
            folio='COT-SEC-999',
            nombre_cliente='Don Juan Perez',
            telefono_cliente='9999887766',
            medida_solicitada='225/45R17',
            cantidad_requerida=4,
            mostrar_msi=True,
            factor_interes=Decimal('1.0800'),
            notas_cliente='Entrega en sucursal con montaje gratis',
            notas_internas='SECRETO_INTERNO_COSTO_MARGEN_PROVEEDOR_123',
            elaborado_por=self.vendedor
        )
        OpcionCotizacion.objects.create(
            cotizacion=cot,
            marca='Continental',
            modelo='ContiSportContact',
            medida='225/45R17',
            costo_proveedor=Decimal('1234.56'),
            costo_con_iva=Decimal('1432.09'),
            proveedor_nombre_libre='PROVEEDOR_SECRETO_DISTRIBUIDORA_XYZ',
            margen_unitario_1=Decimal('777.00'),
            margen_unitario_2=Decimal('666.00'),
            margen_unitario_4=Decimal('555.00'),
            precio_unitario_publico=Decimal('2800.00'),
            precio_par=Decimal('5600.00'),
            precio_juego_4=Decimal('11200.00'),
            precio_cantidad_solicitada=Decimal('11200.00')
        )

        # 1. Petición anónima al PDF -> 401
        resp_anon = self.client.get(f'/api/ventas/cotizaciones/{cot.id}/pdf/')
        self.assertEqual(resp_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Petición autenticada -> 200 OK con Content-Type application/pdf
        self.client.force_authenticate(user=self.vendedor)
        resp_auth = self.client.get(f'/api/ventas/cotizaciones/{cot.id}/pdf/')
        self.assertEqual(resp_auth.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_auth['Content-Type'], 'application/pdf')
        self.assertIn('Cotizacion_COT-SEC-999.pdf', resp_auth['Content-Disposition'])

        pdf_bytes = resp_auth.content
        self.assertTrue(len(pdf_bytes) > 1000)

        # Decomprimir streams generados por ReportLab (FlateDecode + ASCII85Decode)
        import base64
        import zlib
        idx = 0
        decompressed_parts = []
        while True:
            s_idx = pdf_bytes.find(b'stream', idx)
            if s_idx == -1:
                break
            e_idx = pdf_bytes.find(b'endstream', s_idx)
            if e_idx == -1:
                break
            data_start = s_idx + len(b'stream')
            if pdf_bytes[data_start:data_start+2] == b'\r\n':
                data_start += 2
            elif pdf_bytes[data_start:data_start+1] == b'\n':
                data_start += 1
            chunk = pdf_bytes[data_start:e_idx].rstrip(b'\r\n')
            try:
                a85 = base64.a85decode(chunk.strip(), adobe=True)
                dec = zlib.decompress(a85)
                decompressed_parts.append(dec.decode('latin1', errors='ignore'))
            except Exception:
                try:
                    dec = zlib.decompress(chunk)
                    decompressed_parts.append(dec.decode('latin1', errors='ignore'))
                except Exception:
                    pass
            idx = e_idx + len(b'endstream')

        full_pdf_text = ' '.join(decompressed_parts)
        self.assertTrue(len(full_pdf_text) > 100, "Debe haber texto renderizado en el PDF.")

        # Comprobar que NINGÚN secreto interno aparece en el contenido renderizado del PDF
        self.assertNotIn('SECRETO_INTERNO_COSTO_MARGEN_PROVEEDOR_123', full_pdf_text)
        self.assertNotIn('PROVEEDOR_SECRETO_DISTRIBUIDORA_XYZ', full_pdf_text)
        self.assertNotIn('1234.56', full_pdf_text)
        self.assertNotIn('1432.09', full_pdf_text)
        self.assertNotIn('777.00', full_pdf_text)
        self.assertNotIn('666.00', full_pdf_text)
        self.assertNotIn('555.00', full_pdf_text)
        self.assertNotIn('1.0800', full_pdf_text)

        # Comprobar que SÍ contiene datos públicos comerciales
        self.assertIn('COT-SEC-999', full_pdf_text)
        self.assertIn('Don Juan Perez', full_pdf_text)
        self.assertIn('Continental', full_pdf_text)
        self.assertIn('225/45R17', full_pdf_text)
        self.assertIn('Entrega en sucursal con montaje gratis', full_pdf_text)

