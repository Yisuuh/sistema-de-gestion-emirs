from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado
from apps.caja.models import Caja, MovimientoCaja, ArqueoCaja
from apps.ventas.models import SecuenciaFolio, Venta
from apps.rescates.models import Rescate, UnidadMovil


class CajaModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario admin y operador
        self.admin_user = Usuario.objects.create_user(
            username='admin_caja',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.operador_user = Usuario.objects.create_user(
            username='operador_caja',
            password='password123',
            rol='operador'
        )

        # Empleado
        self.empleado = Empleado.objects.create(
            nombre='Roberto',
            apellido='López',
            puesto='Cajero',
            salario_base=Decimal('4500.00'),
            comision_porcentaje=Decimal('2.00')
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_apertura_caja_folio_secuencial_sin_colision(self):
        # Abrir primera caja
        res1 = self.client.post('/api/caja/cajas/', {
            'monto_inicial': '1000.00',
            'empleado_apertura': self.empleado.id,
            'notas_apertura': 'Apertura turno matutino'
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        caja1_id = res1.data['id']
        caja1_folio = res1.data['folio']
        self.assertTrue(caja1_folio.startswith('C-'))
        self.assertEqual(res1.data['estado'], 'abierta')

        # Intentar abrir una segunda caja mientras la primera está abierta (debe fallar)
        res_error = self.client.post('/api/caja/cajas/', {
            'monto_inicial': '500.00',
            'empleado_apertura': self.empleado.id
        }, format='json')
        self.assertEqual(res_error.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Ya existe una caja abierta', str(res_error.data))

        # Cerrar primera caja
        caja1 = Caja.objects.get(id=caja1_id)
        caja1.estado = 'cerrada'
        caja1.fecha_cierre = timezone.now()
        caja1.empleado_cierre = self.empleado
        caja1.monto_final = Decimal('2500.00')
        caja1.save()

        # Abrir segunda caja
        res2 = self.client.post('/api/caja/cajas/', {
            'monto_inicial': '1500.00',
            'empleado_apertura': self.empleado.id
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        caja2_folio = res2.data['folio']

        self.assertNotEqual(caja1_folio, caja2_folio)
        self.assertEqual(caja1_folio, 'C-000001')
        self.assertEqual(caja2_folio, 'C-000002')

    def test_cierre_de_caja_y_arqueo(self):
        caja = Caja.objects.create(
            folio='C-000010',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        # Registrar movimiento de ingreso
        MovimientoCaja.objects.create(
            caja=caja,
            tipo='ingreso',
            concepto='Fondo adicional',
            monto=Decimal('500.00'),
            empleado=self.empleado
        )

        # Realizar arqueo
        res_arqueo = self.client.post('/api/caja/arqueos/', {
            'caja': caja.id,
            'empleado': self.empleado.id,
            'billetes_1000': 1,
            'billetes_500': 1,
            'notas': 'Arqueo perfecto'
        }, format='json')
        self.assertEqual(res_arqueo.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res_arqueo.data['total'])), Decimal('1500.00'))

        # Cerrar caja vía endpoint
        res_cierre = self.client.post(f'/api/caja/cajas/{caja.id}/cerrar/', {
            'monto_final': '1500.00',
            'empleado_cierre': self.empleado.id,
            'notas_cierre': 'Turno cerrado con éxito'
        }, format='json')
        self.assertEqual(res_cierre.status_code, status.HTTP_200_OK)

        caja.refresh_from_db()
        self.assertEqual(caja.estado, 'cerrada')
        self.assertEqual(caja.monto_final, Decimal('1500.00'))
        self.assertIsNotNone(caja.fecha_cierre)

    def test_movimiento_caja_validaciones_y_rbac(self):
        caja = Caja.objects.create(
            folio='C-000020',
            monto_inicial=Decimal('2000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        # Crear movimiento como admin
        res_mov = self.client.post('/api/caja/movimientos/', {
            'caja': caja.id,
            'tipo': 'egreso',
            'concepto': 'Compra de insumos limpieza',
            'monto': '150.00',
            'empleado': self.empleado.id
        }, format='json')
        self.assertEqual(res_mov.status_code, status.HTTP_201_CREATED)
        mov_id = res_mov.data['id']

        # Operador intentando modificar o borrar movimiento (debe ser 403)
        self.client.force_authenticate(user=self.operador_user)
        res_put_op = self.client.patch(f'/api/caja/movimientos/{mov_id}/', {
            'monto': '200.00'
        }, format='json')
        self.assertEqual(res_put_op.status_code, status.HTTP_403_FORBIDDEN)

        res_del_op = self.client.delete(f'/api/caja/movimientos/{mov_id}/')
        self.assertEqual(res_del_op.status_code, status.HTTP_403_FORBIDDEN)

        # Admin modificando movimiento en caja abierta (debe ser 200)
        self.client.force_authenticate(user=self.admin_user)
        res_put_adm = self.client.patch(f'/api/caja/movimientos/{mov_id}/', {
            'monto': '180.00'
        }, format='json')
        self.assertEqual(res_put_adm.status_code, status.HTTP_200_OK)

        # Cerrar caja y validar que ya no permite nuevos movimientos ni modificaciones
        caja.estado = 'cerrada'
        caja.save()

        res_new_mov = self.client.post('/api/caja/movimientos/', {
            'caja': caja.id,
            'tipo': 'ingreso',
            'concepto': 'Ingreso extemporáneo',
            'monto': '100.00',
            'empleado': self.empleado.id
        }, format='json')
        self.assertEqual(res_new_mov.status_code, status.HTTP_400_BAD_REQUEST)

        res_edit_cerrada = self.client.patch(f'/api/caja/movimientos/{mov_id}/', {
            'monto': '200.00'
        }, format='json')
        self.assertEqual(res_edit_cerrada.status_code, status.HTTP_400_BAD_REQUEST)

    def test_saldo_esperado_caja_con_cambio_descontado_y_cobro_rescates(self):
        # Crear caja con monto inicial
        caja = Caja.objects.create(
            folio='C-000030',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        # 1. Venta en efectivo (cliente paga 1000, costo 500, cambio 500 -> total en caja = 500)
        Venta.objects.create(
            folio='V-C001',
            caja=caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('1000.00'),
            subtotal=Decimal('500.00'),
            total=Decimal('500.00')
        )

        # 2. Venta mixta (total 1200: 700 en efectivo, 500 en tarjeta)
        Venta.objects.create(
            folio='V-C002',
            caja=caja,
            empleado=self.empleado,
            metodo_pago='mixto',
            tipo_tarjeta='debito',
            monto_efectivo=Decimal('700.00'),
            monto_electronico=Decimal('500.00'),
            subtotal=Decimal('1200.00'),
            total=Decimal('1200.00')
        )

        # 3. Rescates cobrados en esta caja
        unidad = UnidadMovil.objects.create(numero_economico='MOV-T01', nombre='Unidad Test')
        # Rescate 1 en efectivo
        Rescate.objects.create(
            folio='RES-C01',
            caja=caja,
            operador=self.empleado,
            unidad=unidad,
            nombre_cliente='Cliente Rescate Efectivo',
            telefono_cliente='5551112233',
            ubicacion_texto='Carretera Sur km 10',
            metodo_pago='efectivo',
            monto_efectivo=Decimal('450.00'),
            subtotal=Decimal('450.00'),
            total=Decimal('450.00'),
            estado='completado'
        )
        # Rescate 2 mixto (total 600: 400 efectivo, 200 electrónico)
        Rescate.objects.create(
            folio='RES-C02',
            caja=caja,
            operador=self.empleado,
            unidad=unidad,
            nombre_cliente='Cliente Rescate Mixto',
            telefono_cliente='5551112233',
            ubicacion_texto='Av. Principal 45',
            metodo_pago='mixto',
            tipo_tarjeta='credito',
            monto_efectivo=Decimal('400.00'),
            monto_electronico=Decimal('200.00'),
            subtotal=Decimal('600.00'),
            total=Decimal('600.00'),
            estado='completado'
        )
        # Rescate 3 tarjeta (total 300: 300 electrónico)
        Rescate.objects.create(
            folio='RES-C03',
            caja=caja,
            operador=self.empleado,
            unidad=unidad,
            nombre_cliente='Cliente Rescate Tarjeta',
            telefono_cliente='5551112233',
            ubicacion_texto='Plaza Oriente',
            metodo_pago='tarjeta',
            tipo_tarjeta='debito',
            monto_electronico=Decimal('300.00'),
            subtotal=Decimal('300.00'),
            total=Decimal('300.00'),
            estado='completado'
        )

        # 4. Movimientos adicionales de caja
        MovimientoCaja.objects.create(
            caja=caja,
            tipo='ingreso',
            concepto='Fondo adicional',
            monto=Decimal('200.00'),
            empleado=self.empleado
        )
        MovimientoCaja.objects.create(
            caja=caja,
            tipo='egreso',
            concepto='Pago de garrafones de agua',
            monto=Decimal('150.00'),
            empleado=self.empleado
        )

        # Verificaciones matemáticas del modelo:
        # total_ventas_efectivo = 500 (V1) + 700 (V2) + 450 (R1) + 400 (R2) = 2050.00
        self.assertEqual(caja.total_ventas_efectivo, Decimal('2050.00'))
        # total_ventas_electronico = 500 (V2) + 200 (R2) + 300 (R3) = 1000.00
        self.assertEqual(caja.total_ventas_electronico, Decimal('1000.00'))
        # total_ingresos_extra = 200.00
        self.assertEqual(caja.total_ingresos_extra, Decimal('200.00'))
        # total_egresos = 150.00
        self.assertEqual(caja.total_egresos, Decimal('150.00'))
        # saldo_esperado = 1000.00 + 2050.00 + 200.00 - 150.00 = 3100.00
        self.assertEqual(caja.saldo_esperado, Decimal('3100.00'))

        # Verificación a través del endpoint de la API
        res = self.client.get(f'/api/caja/cajas/{caja.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res.data['saldo_esperado'])), Decimal('3100.00'))
        self.assertEqual(Decimal(str(res.data['total_ventas_efectivo'])), Decimal('2050.00'))
        self.assertEqual(Decimal(str(res.data['total_ventas_electronico'])), Decimal('1000.00'))

    def test_reimpresion_ticket_ventas_en_caja_cerrada(self):
        """Verificar que una caja cerrada permite consultar sus ventas completas para reimpresión de tickets"""
        caja = Caja.objects.create(
            folio='C-CERRADA-99',
            monto_inicial=Decimal('1000.00'),
            monto_final=Decimal('2500.00'),
            empleado_apertura=self.empleado,
            empleado_cierre=self.empleado,
            estado='cerrada',
            fecha_cierre=timezone.now()
        )
        venta = Venta.objects.create(
            folio='V-HISTORICA-01',
            caja=caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('1500.00'),
            subtotal=Decimal('1500.00'),
            total=Decimal('1500.00')
        )

        res = self.client.get(f'/api/caja/cajas/{caja.id}/ventas_caja/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('ventas', res.data)
        self.assertEqual(len(res.data['ventas']), 1)
        self.assertEqual(res.data['ventas'][0]['folio'], 'V-HISTORICA-01')
        self.assertEqual(Decimal(str(res.data['ventas'][0]['total'])), Decimal('1500.00'))

    def test_caja_cero_accidental_omitida_del_historial(self):
        """Verificar que una caja abierta por accidente en ceros y cerrada en ceros no aparezca en el historial"""
        caja_accidental = Caja.objects.create(
            folio='C-ACCIDENTAL-01',
            monto_inicial=Decimal('0.00'),
            monto_final=Decimal('0.00'),
            empleado_apertura=self.empleado,
            empleado_cierre=self.empleado,
            estado='cerrada',
            fecha_cierre=timezone.now(),
            notas_cierre='Cierre en ceros (apertura accidental)'
        )

        res = self.client.get('/api/caja/cajas/historial/?periodo=hoy')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        folios = [c['folio'] for c in res.data['cajas']]
        self.assertNotIn('C-ACCIDENTAL-01', folios)

    def test_caja_con_movimientos_no_puede_cerrar_en_cero(self):
        """Verificar que una caja que tiene movimientos o saldo esperado no pueda cerrarse en 0.00"""
        caja = Caja.objects.create(
            folio='C-VENTAS-88',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )
        res = self.client.post(f'/api/caja/cajas/{caja.id}/cerrar/', {
            'monto_final': '0.00',
            'empleado_cierre': self.empleado.id,
            'notas_cierre': 'Intento de cerrar en 0'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No es posible cerrar la caja en $0.00', res.data.get('error', ''))



