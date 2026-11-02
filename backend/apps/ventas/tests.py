from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado
from apps.clientes.models import Cliente
from apps.caja.models import Caja
from apps.inventario.models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario
from apps.ventas.models import Venta, DetalleVenta, Servicio
from apps.ventas.serializers import VentaSerializer


class VentasAndFeaturesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Usuarios
        self.admin_user = Usuario.objects.create_user(
            username='admin_test',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.operador_user = Usuario.objects.create_user(
            username='operador_test',
            password='password123',
            rol='operador'
        )
        
        # Empleado
        self.empleado = Empleado.objects.create(
            nombre='Juan',
            apellido='Pérez',
            puesto='Vendedor',
            salario_base=Decimal('5000.00'),
            comision_porcentaje=Decimal('5.00')
        )
        
        # Cliente
        self.cliente = Cliente.objects.create(
            nombre='Cliente Test',
            telefono='5551234567'
        )
        
        # Caja abierta
        self.caja = Caja.objects.create(
            folio='CAJA-001',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )
        
        # Marca, Proveedor, Producto
        self.marca = Marca.objects.create(nombre='Michelin')
        self.proveedor = Proveedor.objects.create(nombre='Proveedor Test')
        self.producto = Producto.objects.create(
            codigo='LLANTA-01',
            medida='205/55R16',
            marca=self.marca,
            modelo='Primacy 4',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2000.00'),
            stock_minimo=2
        )
        
        # Entrada inventario con stock
        self.entrada = EntradaInventario.objects.create(
            producto=self.producto,
            proveedor=self.proveedor,
            cantidad=10,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='',
            factura_pendiente=True,
            folio_remision='REM-100',
            created_by=self.admin_user
        )
        
        # Servicio
        self.servicio = Servicio.objects.create(
            nombre='Alineación y Balanceo',
            precio=Decimal('500.00')
        )

    def test_creacion_venta_con_vouchers_correlativos(self):
        # Venta 1: Efectivo
        data_v1 = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('2000.00'),
            'monto_electronico': Decimal('0.00'),
            'subtotal': Decimal('2000.00'),
            'descuento': Decimal('0.00'),
            'total': Decimal('2000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4 205/55R16',
                    'cantidad': 1,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        s1 = VentaSerializer(data=data_v1)
        self.assertTrue(s1.is_valid(), s1.errors)
        v1 = s1.save()
        self.assertEqual(v1.num_voucher_efectivo, 1)
        self.assertIsNone(v1.num_voucher_tarjeta)

        # Venta 2: Tarjeta debito
        data_v2 = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'tarjeta',
            'tipo_tarjeta': 'debito',
            'num_operacion': 'OP-9988',
            'monto_efectivo': Decimal('0.00'),
            'monto_electronico': Decimal('500.00'),
            'subtotal': Decimal('500.00'),
            'descuento': Decimal('0.00'),
            'total': Decimal('500.00'),
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'descripcion': 'Alineación y Balanceo',
                    'cantidad': 1,
                    'precio_unitario': Decimal('500.00')
                }
            ]
        }
        s2 = VentaSerializer(data=data_v2)
        self.assertTrue(s2.is_valid(), s2.errors)
        v2 = s2.save()
        self.assertEqual(v2.num_voucher_tarjeta, 1)
        self.assertEqual(v2.tipo_tarjeta, 'debito')

        # Venta 3: Mixto
        data_v3 = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'mixto',
            'tipo_tarjeta': 'credito',
            'num_operacion': 'OP-1234',
            'monto_efectivo': Decimal('1000.00'),
            'monto_electronico': Decimal('1000.00'),
            'subtotal': Decimal('2000.00'),
            'descuento': Decimal('0.00'),
            'total': Decimal('2000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4 205/55R16',
                    'cantidad': 1,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        s3 = VentaSerializer(data=data_v3)
        self.assertTrue(s3.is_valid(), s3.errors)
        v3 = s3.save()
        self.assertEqual(v3.num_voucher_efectivo, 2)
        self.assertEqual(v3.num_voucher_tarjeta, 2)

    def test_edicion_venta_y_reversion_inventario(self):
        # Crear venta inicial
        data = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('4000.00'),
            'monto_electronico': Decimal('0.00'),
            'subtotal': Decimal('4000.00'),
            'descuento': Decimal('0.00'),
            'total': Decimal('4000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4 205/55R16',
                    'cantidad': 2,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        serializer = VentaSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        venta = serializer.save()
        self.assertEqual(SalidaInventario.objects.filter(venta=venta).count(), 1)
        self.assertEqual(SalidaInventario.objects.get(venta=venta).cantidad, 2)
        self.assertEqual(self.producto.stock_actual, 8)

        # Actualizar venta con 1 pieza en vez de 2
        update_data = {
            'total': Decimal('2000.00'),
            'subtotal': Decimal('2000.00'),
            'monto_efectivo': Decimal('2000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4 205/55R16',
                    'cantidad': 1,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        serializer_up = VentaSerializer(venta, data=update_data, partial=True)
        self.assertTrue(serializer_up.is_valid(), serializer_up.errors)
        venta_up = serializer_up.save()
        self.assertEqual(SalidaInventario.objects.filter(venta=venta_up).count(), 1)
        self.assertEqual(SalidaInventario.objects.get(venta=venta_up).cantidad, 1)
        self.assertEqual(self.producto.stock_actual, 9)

    def test_borrado_seguro_venta(self):
        # Crear venta
        from apps.usuarios.models import LogAuditoria
        venta = Venta.objects.create(
            folio='V-000001',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('500.00'),
            subtotal=Decimal('500.00'),
            total=Decimal('500.00')
        )
        
        # Intento de borrado por operador -> 403
        self.client.force_authenticate(user=self.operador_user)
        res_op = self.client.delete(f'/api/ventas/ventas/{venta.id}/')
        self.assertEqual(res_op.status_code, 403)

        # Si la caja está cerrada -> 400
        self.caja.estado = 'cerrada'
        self.caja.save()
        self.client.force_authenticate(user=self.admin_user)
        res_cerrada = self.client.delete(f'/api/ventas/ventas/{venta.id}/')
        self.assertEqual(res_cerrada.status_code, 400)

        # Con caja abierta y admin -> 204 y se audita en LogAuditoria
        self.caja.estado = 'abierta'
        self.caja.save()
        res_ok = self.client.delete(f'/api/ventas/ventas/{venta.id}/')
        self.assertEqual(res_ok.status_code, 204)
        self.assertFalse(Venta.objects.filter(id=venta.id).exists())
        self.assertTrue(LogAuditoria.objects.filter(accion='eliminar', registro_id=venta.id).exists())

    def test_edicion_segura_venta_rbac_y_caja(self):
        from apps.usuarios.models import LogAuditoria
        # Crear venta
        venta = Venta.objects.create(
            folio='V-000099',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('500.00'),
            subtotal=Decimal('500.00'),
            total=Decimal('500.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            servicio=self.servicio,
            cantidad=1,
            precio_unitario=Decimal('500.00'),
            subtotal=Decimal('500.00')
        )

        update_payload = {
            'total': '600.00',
            'subtotal': '600.00',
            'monto_efectivo': '600.00',
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'cantidad': 1,
                    'precio_unitario': '600.00'
                }
            ]
        }

        # Intento de edición por operador -> 403
        self.client.force_authenticate(user=self.operador_user)
        res_op = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res_op.status_code, 403)

        # Si la caja está cerrada -> 400
        self.caja.estado = 'cerrada'
        self.caja.save()
        self.client.force_authenticate(user=self.admin_user)
        res_cerrada = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res_cerrada.status_code, 400)

        # Con caja abierta y admin -> 200 y se audita en LogAuditoria
        self.caja.estado = 'abierta'
        self.caja.save()
        res_ok = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res_ok.status_code, 200)
        self.assertTrue(LogAuditoria.objects.filter(accion='editar', registro_id=venta.id).exists())

    def test_movimiento_caja_seguridad_rbac_y_caja(self):
        from apps.caja.models import MovimientoCaja
        mov = MovimientoCaja.objects.create(
            caja=self.caja,
            tipo='ingreso',
            categoria='otros',
            concepto='Fondo extra',
            monto=Decimal('100.00'),
            empleado=self.empleado
        )

        # Operador intentando editar -> 403
        self.client.force_authenticate(user=self.operador_user)
        res_edit_op = self.client.patch(f'/api/caja/movimientos/{mov.id}/', {'monto': '150.00'}, format='json')
        self.assertEqual(res_edit_op.status_code, 403)

        # Operador intentando eliminar -> 403
        res_del_op = self.client.delete(f'/api/caja/movimientos/{mov.id}/')
        self.assertEqual(res_del_op.status_code, 403)

        # Caja cerrada intentando modificar -> 400
        self.caja.estado = 'cerrada'
        self.caja.save()
        self.client.force_authenticate(user=self.admin_user)
        res_edit_cerrada = self.client.patch(f'/api/caja/movimientos/{mov.id}/', {'monto': '150.00'}, format='json')
        self.assertEqual(res_edit_cerrada.status_code, 400)
        res_del_cerrada = self.client.delete(f'/api/caja/movimientos/{mov.id}/')
        self.assertEqual(res_del_cerrada.status_code, 400)

        # Admin con caja abierta -> 200 / 204
        self.caja.estado = 'abierta'
        self.caja.save()
        res_edit_ok = self.client.patch(f'/api/caja/movimientos/{mov.id}/', {'monto': '150.00'}, format='json')
        self.assertEqual(res_edit_ok.status_code, 200)
        res_del_ok = self.client.delete(f'/api/caja/movimientos/{mov.id}/')
        self.assertEqual(res_del_ok.status_code, 204)

    def test_ranking_mas_vendidos(self):
        # Crear venta con detalle para ranking
        venta = Venta.objects.create(
            folio='V-000002',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('2000.00'),
            subtotal=Decimal('2000.00'),
            total=Decimal('2000.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            producto=self.producto,
            descripcion='Michelin Primacy',
            cantidad=3,
            precio_unitario=Decimal('2000.00'),
            subtotal=Decimal('6000.00')
        )
        
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get('/api/reportes/mas-vendidos/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('productos', data)
        self.assertIn('servicios', data)
        self.assertGreaterEqual(len(data['productos']), 1)
        self.assertEqual(data['productos'][0]['cantidad_total'], 3)
        self.assertEqual(len(data['productos'][0]['meses']), 12)

    def test_vincular_factura_inventario(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # Vincular individual
        res = self.client.post(
            f'/api/inventario/entradas/{self.entrada.id}/vincular_factura/',
            {'numero_factura': 'FAC-2026-99', 'fecha_factura': '2026-10-06'},
            format='json'
        )
        self.assertEqual(res.status_code, 200)
        self.entrada.refresh_from_db()
        self.assertEqual(self.entrada.numero_factura, 'FAC-2026-99')
        self.assertFalse(self.entrada.factura_pendiente)

        # Vincular lote
        self.entrada.factura_pendiente = True
        self.entrada.save()
        res_lote = self.client.post(
            '/api/inventario/entradas/vincular_factura_lote/',
            {'entrada_ids': [self.entrada.id], 'numero_factura': 'FAC-LOTE-01'},
            format='json'
        )
        self.assertEqual(res_lote.status_code, 200)
        self.entrada.refresh_from_db()
        self.assertEqual(self.entrada.numero_factura, 'FAC-LOTE-01')
        self.assertFalse(self.entrada.factura_pendiente)

    def test_generacion_siguiente_folio_atomico_y_autoinicializacion(self):
        from apps.ventas.services import generar_siguiente_folio_atomico
        from apps.ventas.models import SecuenciaFolio

        # Generar primer folio desde cero
        folio1 = generar_siguiente_folio_atomico('TEST_SEQ', Venta, 'T-', 6)
        self.assertEqual(folio1, 'T-000001')

        # SecuenciaFolio guardada correctamente
        seq = SecuenciaFolio.objects.get(codigo='TEST_SEQ')
        self.assertEqual(seq.ultimo_numero, 1)

        # Generar segundo folio
        folio2 = generar_siguiente_folio_atomico('TEST_SEQ', Venta, 'T-', 6)
        self.assertEqual(folio2, 'T-000002')
        seq.refresh_from_db()
        self.assertEqual(seq.ultimo_numero, 2)

        # Probar auto-inicialización cuando ya existen registros con folios mayores
        Venta.objects.create(
            folio='V-000500',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('100.00'),
            subtotal=Decimal('100.00'),
            total=Decimal('100.00')
        )
        # También preexistente folio 501 para verificar que salta colisiones
        Venta.objects.create(
            folio='V-000501',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('100.00'),
            subtotal=Decimal('100.00'),
            total=Decimal('100.00')
        )

        # Secuencia VENTA empieza con ultimo_numero = 0 -> debe detectar 501 y generar 502
        SecuenciaFolio.objects.filter(codigo='VENTA').delete()
        folio_venta = generar_siguiente_folio_atomico('VENTA', Venta, 'V-', 6)
        self.assertEqual(folio_venta, 'V-000502')

    def test_creacion_ventas_consecutivas_sin_colision_folio(self):
        # Crear varias ventas consecutivas vía VentaSerializer y validar unicidad
        folios = []
        for i in range(5):
            payload = {
                'empleado': self.empleado.id,
                'cliente': self.cliente.id,
                'metodo_pago': 'efectivo',
                'monto_efectivo': Decimal('500.00'),
                'subtotal': Decimal('500.00'),
                'total': Decimal('500.00'),
                'detalles': [
                    {
                        'servicio': self.servicio.id,
                        'descripcion': f'Servicio consecutivo {i}',
                        'cantidad': 1,
                        'precio_unitario': Decimal('500.00')
                    }
                ]
            }
            serializer = VentaSerializer(data=payload)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            venta = serializer.save()
            folios.append(venta.folio)

        # Todos los folios generados deben ser únicos
        self.assertEqual(len(folios), len(set(folios)))
        # Deben cumplir el formato V-XXXXXX
        for f in folios:
            self.assertTrue(f.startswith('V-'))
            self.assertEqual(len(f), 8)

    def test_rollback_por_stock_insuficiente_preserva_secuencia(self):
        from rest_framework.exceptions import ValidationError
        from apps.ventas.models import SecuenciaFolio

        # Generar una venta exitosa inicial para fijar secuencia
        payload_ok = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('500.00'),
            'subtotal': Decimal('500.00'),
            'total': Decimal('500.00'),
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'descripcion': 'Servicio Inicial',
                    'cantidad': 1,
                    'precio_unitario': Decimal('500.00')
                }
            ]
        }
        s1 = VentaSerializer(data=payload_ok)
        self.assertTrue(s1.is_valid(), s1.errors)
        v1 = s1.save()
        seq = SecuenciaFolio.objects.get(codigo='VENTA')
        num_inicial = seq.ultimo_numero

        # Intentar crear venta con producto solicitando más stock del existente (stock es 10, pedimos 99)
        payload_insuficiente = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('198000.00'),
            'subtotal': Decimal('198000.00'),
            'total': Decimal('198000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Llantas insuficientes',
                    'cantidad': 99,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        s_fail = VentaSerializer(data=payload_insuficiente)
        self.assertTrue(s_fail.is_valid(), s_fail.errors)
        with self.assertRaises(ValidationError):
            s_fail.save()

        # Secuencia debe haberse revertido por rollback de la transacción
        seq.refresh_from_db()
        self.assertEqual(seq.ultimo_numero, num_inicial)

        # La siguiente venta válida debe obtener el folio correlativo exacto sin huecos ni duplicados
        s2 = VentaSerializer(data=payload_ok)
        self.assertTrue(s2.is_valid(), s2.errors)
        v2 = s2.save()
        seq.refresh_from_db()
        self.assertEqual(seq.ultimo_numero, num_inicial + 1)
        self.assertNotEqual(v1.folio, v2.folio)

    def test_creacion_venta_sin_caja_abierta_falla_con_validation_error(self):
        # Cerrar la caja activa
        self.caja.estado = 'cerrada'
        self.caja.save()

        payload = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('500.00'),
            'subtotal': Decimal('500.00'),
            'total': Decimal('500.00'),
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'descripcion': 'Alineación y Balanceo',
                    'cantidad': 1,
                    'precio_unitario': Decimal('500.00')
                }
            ]
        }

        # Validación a nivel de serializer: debe fallar con ValidationError en 'caja'
        serializer = VentaSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('caja', serializer.errors)
        self.assertIn('No existe ninguna caja abierta', str(serializer.errors['caja']))

        # Validación a nivel de endpoint API: debe responder 400 Bad Request
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post('/api/ventas/ventas/', payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('caja', response.data)

    def test_validacion_monto_efectivo_menor_al_total(self):
        """SEC-04: En venta efectivo, monto_efectivo no puede ser menor al total."""
        payload = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'efectivo',
            'monto_efectivo': Decimal('1500.00'),
            'subtotal': Decimal('2000.00'),
            'total': Decimal('2000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4',
                    'cantidad': 1,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        serializer = VentaSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('monto_efectivo', serializer.errors)
        self.assertIn('El monto en efectivo entregado no puede ser menor al total de la venta.', str(serializer.errors['monto_efectivo']))

    def test_validacion_monto_mixto_menor_al_total(self):
        """SEC-04: En venta mixta, monto_efectivo + monto_electronico no puede ser menor al total."""
        payload = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'metodo_pago': 'mixto',
            'tipo_tarjeta': 'debito',
            'num_operacion': 'OP-9900',
            'monto_efectivo': Decimal('500.00'),
            'monto_electronico': Decimal('800.00'),
            'subtotal': Decimal('2000.00'),
            'total': Decimal('2000.00'),
            'detalles': [
                {
                    'producto': self.producto.id,
                    'descripcion': 'Michelin Primacy 4',
                    'cantidad': 1,
                    'precio_unitario': Decimal('2000.00')
                }
            ]
        }
        serializer = VentaSerializer(data=payload)
        self.assertFalse(serializer.is_valid())
        self.assertIn('monto_efectivo', serializer.errors)
        self.assertIn('La suma del monto en efectivo y electrónico no puede ser menor al total de la venta.', str(serializer.errors['monto_efectivo']))

    def test_cotizacion_multimarca_creacion_y_pdf_seguro(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Cliente Cotización',
            'telefono_cliente': '9998887766',
            'vehiculo_referencia': 'Mazda 3 2021',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'vigencia_dias': 5,
            'incluye_montaje': True,
            'incluye_balanceo': True,
            'incluye_valvula': True,
            'incluye_alineacion': False,
            'notas_cliente': 'Garantía de 1 año contra defectos de fabricación.',
            'notas_internas': 'NOTA CONFIDENCIAL INTERNA PROVEEDOR MAYORISTA',
            'opciones': [
                {
                    'gama': 'economica',
                    'origen': 'sobre_pedido',
                    'proveedor_nombre_libre': 'Bodega Mayorista Secreta',
                    'marca': 'Tornel',
                    'modelo': 'Real',
                    'medida': '205/55R16',
                    'tiempo_entrega': 'Mismo día (3 hrs)',
                    'costo_proveedor': '900.00',
                    'tipo_margen': 'porcentaje',
                    'valor_margen': '35.00',
                    'recomendada': False,
                },
                {
                    'gama': 'premium',
                    'origen': 'stock',
                    'producto': self.producto.id,
                    'proveedor': self.proveedor.id,
                    'marca': 'Michelin',
                    'modelo': 'Primacy 4',
                    'medida': '205/55R16',
                    'tiempo_entrega': 'Inmediata',
                    'costo_proveedor': '1200.00',
                    'tipo_margen': 'monto_fijo',
                    'valor_margen': '800.00',
                    'precio_unitario_publico': '2000.00',
                    'recomendada': True,
                }
            ]
        }

        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        cot_id = res.data['id']
        self.assertTrue(res.data['folio'].startswith('COT-'))
        self.assertEqual(len(res.data['opciones']), 2)

        # Verificar cálculo automático de margen porcentaje (900 * 1.35 = 1215.00)
        op_econ = [o for o in res.data['opciones'] if o['gama'] == 'economica'][0]
        self.assertEqual(Decimal(str(op_econ['precio_unitario_publico'])), Decimal('1215.00'))
        self.assertEqual(Decimal(str(op_econ['precio_par'])), Decimal('2430.00'))
        self.assertEqual(Decimal(str(op_econ['precio_juego_4'])), Decimal('4860.00'))
        self.assertEqual(Decimal(str(op_econ['utilidad_unitaria'])), Decimal('315.00'))
        self.assertEqual(Decimal(str(op_econ['utilidad_total'])), Decimal('1260.00'))

        # Verificar generación de PDF para cliente y confidencialidad absoluta
        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertEqual(res_pdf['Content-Type'], 'application/pdf')
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))

        # REGLA DE ORO DE SEGURIDAD: Jamás filtrar costos, márgenes, notas internas ni proveedor en el PDF
        pdf_raw = res_pdf.content.decode('latin-1', errors='ignore')
        self.assertNotIn('NOTA CONFIDENCIAL INTERNA PROVEEDOR MAYORISTA', pdf_raw)
        self.assertNotIn('Bodega Mayorista Secreta', pdf_raw)
        self.assertNotIn('costo_proveedor', pdf_raw)
        self.assertNotIn('costo_con_iva', pdf_raw)
        self.assertNotIn('valor_margen', pdf_raw)
        self.assertNotIn('margen_unitario', pdf_raw)
        self.assertNotIn('notas_internas', pdf_raw)

        # Cambiar estado a aceptada
        res_est = self.client.post(
            f'/api/ventas/cotizaciones/{cot_id}/cambiar_estado/',
            {'estado': 'aceptada'},
            format='json'
        )
        self.assertEqual(res_est.status_code, 200)
        self.assertEqual(res_est.data['estado'], 'aceptada')

    def test_cotizacion_con_servicios_adicionales(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Cliente Servicios Extra',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'incluye_montaje': True,
            'incluye_balanceo': True,
            'incluye_valvula': True,
            'incluye_alineacion': True,
            'servicios_adicionales': ['Nitrógeno en las 4 llantas', 'Rotación gratis a los 10,000 km'],
            'opciones': [
                {
                    'gama': 'media',
                    'origen': 'stock',
                    'marca': 'Michelin',
                    'modelo': 'Primacy 4',
                    'medida': '205/55R16',
                    'costo_proveedor': '1200.00',
                    'precio_unitario_publico': '2000.00',
                }
            ]
        }
        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(
            res.data['servicios_adicionales'],
            ['Nitrógeno en las 4 llantas', 'Rotación gratis a los 10,000 km']
        )
        cot_id = res.data['id']
        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))

    def test_cotizacion_tabulador_iva_y_desglose_msi(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Cliente Tabulador MSI',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'mostrar_msi': True,
            'opciones': [
                {
                    'gama': 'media',
                    'origen': 'stock',
                    'marca': 'Pirelli',
                    'modelo': 'Cinturato P7',
                    'medida': '205/55R16',
                    'costo_proveedor': '1000.00',
                    'costo_incluye_iva': False,
                    'costo_con_iva': '1160.00',
                    'utiliza_tabulador': True,
                    'categoria_rin': 'rin_16',
                    'margen_unitario_1': '450.00',
                    'margen_unitario_2': '400.00',
                    'margen_unitario_4': '350.00',
                    'precio_unitario_publico': '1610.00',
                    'precio_par': '3120.00',
                    'precio_juego_4': '6040.00',
                    'precio_cantidad_solicitada': '6040.00',
                }
            ]
        }
        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['mostrar_msi'])

        op = res.data['opciones'][0]
        self.assertFalse(op['costo_incluye_iva'])
        self.assertEqual(Decimal(str(op['costo_con_iva'])), Decimal('1160.00'))
        self.assertEqual(op['categoria_rin'], 'rin_16')
        self.assertTrue(op['utiliza_tabulador'])
        self.assertEqual(Decimal(str(op['margen_unitario_1'])), Decimal('450.00'))
        self.assertEqual(Decimal(str(op['margen_unitario_2'])), Decimal('400.00'))
        self.assertEqual(Decimal(str(op['margen_unitario_4'])), Decimal('350.00'))

        # Validar cálculo de MSI oficial (únicamente 3 Meses Sin Intereses, precio ya incluye interés)
        self.assertIn('factor_interes', res.data)
        msi = op['desglose_msi']
        self.assertIn('3_meses', msi)
        self.assertNotIn('6_meses', msi)
        self.assertNotIn('9_meses', msi)
        self.assertNotIn('12_meses', msi)

        # Total 6040.00 (sin recargo adicional, factor 1.0) / 3 = 2013.33
        self.assertEqual(Decimal(str(msi['3_meses']['total'])), Decimal('6040.00'))
        self.assertEqual(Decimal(str(msi['3_meses']['mensualidad'])), Decimal('2013.33'))
        self.assertEqual(msi['3_meses']['factor'], 1.0)
        self.assertEqual(msi['3_meses']['label'], '3 Meses Sin Intereses')

        cot_id = res.data['id']
        # Validar PDF con MSI activo
        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))

        # Desactivar MSI y validar PDF
        res_patch = self.client.patch(f'/api/ventas/cotizaciones/{cot_id}/', {'mostrar_msi': False}, format='json')
        self.assertEqual(res_patch.status_code, 200)
        self.assertFalse(res_patch.data['mostrar_msi'])
        res_pdf_no_msi = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf_no_msi.status_code, 200)
        self.assertTrue(res_pdf_no_msi.content.startswith(b'%PDF'))

    def test_cotizacion_msi_defensivo_ceros_y_nulos(self):
        """
        Verifica robustez matemática y defensiva cuando los precios o cantidades son 0 o nulos.
        No debe ocurrir ZeroDivisionError ni fallos de redondeo.
        """
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Cliente Caso Borde Ceros',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 0,
            'mostrar_msi': True,
            'opciones': [
                {
                    'gama': 'economica',
                    'origen': 'stock',
                    'marca': 'Generica',
                    'modelo': 'Basic',
                    'medida': '205/55R16',
                    'costo_proveedor': '0.00',
                    'precio_unitario_publico': '0.00',
                    'precio_par': '0.00',
                    'precio_juego_4': '0.00',
                    'precio_cantidad_solicitada': '0.00',
                }
            ]
        }
        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        op = res.data['opciones'][0]
        msi = op['desglose_msi']
        self.assertIn('3_meses', msi)
        self.assertEqual(msi['3_meses']['total'], 0.0)
        self.assertEqual(msi['3_meses']['mensualidad'], 0.0)
        self.assertEqual(msi['3_meses']['total_solicitado'], 0.0)
        self.assertEqual(msi['3_meses']['mensualidad_solicitada'], 0.0)

        # PDF tampoco debe fallar con valores en 0
        cot_id = res.data['id']
        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))

    def test_cotizacion_pdf_plantilla_institucional_completa(self):
        """
        Valida que el PDF comercial de cotización se genere exitosamente
        con la plantilla institucional que incluye:
        - Condiciones de compra y beneficios exclusivos
        - Condiciones de pago
        - Tabla institucional de datos bancarios Santander
        - Bloque de atención, horarios y ubicación
        """
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Juan Pérez González',
            'telefono_cliente': '9991234567',
            'vehiculo_referencia': 'Toyota Corolla 2021',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'mostrar_msi': True,
            'incluye_alineacion': True,
            'servicios_adicionales': ['Balanceo dinámico computarizado', 'Válvulas cromadas de alta presión'],
            'notas_cliente': 'Precios netos con IVA incluido. Válido hasta agotar existencias.',
            'opciones': [
                {
                    'gama': 'media',
                    'origen': 'stock',
                    'marca': 'Pirelli',
                    'modelo': 'Cinturato P7',
                    'medida': '205/55R16',
                    'costo_proveedor': '1100.00',
                    'precio_unitario_publico': '1650.00',
                    'precio_par': '3300.00',
                    'precio_juego_4': '6600.00',
                    'precio_cantidad_solicitada': '6600.00',
                },
                {
                    'gama': 'premium',
                    'origen': 'stock',
                    'marca': 'Michelin',
                    'modelo': 'Primacy 4',
                    'medida': '205/55R16',
                    'costo_proveedor': '1400.00',
                    'precio_unitario_publico': '2100.00',
                    'precio_par': '4200.00',
                    'precio_juego_4': '8400.00',
                    'precio_cantidad_solicitada': '8400.00',
                    'recomendada': True,
                }
            ]
        }
        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        cot_id = res.data['id']
        folio = res.data['folio']

        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertEqual(res_pdf['Content-Type'], 'application/pdf')
        self.assertIn(f'inline; filename="Cotizacion_{folio}.pdf"', res_pdf['Content-Disposition'])
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))
        # Asegurar tamaño consistente y no vacío
        self.assertGreater(len(res_pdf.content), 5000)

    def test_cotizacion_formula_oficial_default_1_0790_y_precios_unitarios(self):
        """
        Valida que el factor de financiamiento por defecto sea 1.0790 (7.9%),
        que la columna 'P. Unitario' mantenga el precio completo de 1 llanta
        (sin dividir el juego entre 4), y que el desglose a 3 MSI calcule exactamente tot_3 / 3.
        """
        from apps.ventas.models import Cotizacion

        self.client.force_authenticate(user=self.admin_user)
        payload = {
            'cliente': self.cliente.id,
            'nombre_cliente': 'Cliente Formula Oficial 1.0790',
            'medida_solicitada': '205/55R16',
            'cantidad_requerida': 4,
            'mostrar_msi': True,
            'opciones': [
                {
                    'gama': 'media',
                    'origen': 'stock',
                    'marca': 'Yokohama',
                    'modelo': 'BluEarth ES32',
                    'medida': '205/55R16',
                    'costo_proveedor': '1150.00',
                    'precio_unitario_publico': '1865.00',
                    'precio_par': '3615.00',
                    'precio_juego_4': '7015.00',
                    'precio_cantidad_solicitada': '7015.00',
                    'recomendada': True,
                }
            ]
        }
        res = self.client.post('/api/ventas/cotizaciones/', payload, format='json')
        self.assertEqual(res.status_code, 201)

        # 1. Validar factor_interes default 1.0790 tanto en serializer como en BD
        self.assertEqual(Decimal(str(res.data['factor_interes'])), Decimal('1.0790'))
        cot_bd = Cotizacion.objects.get(id=res.data['id'])
        self.assertEqual(cot_bd.factor_interes, Decimal('1.0790'))

        # 2. Validar precios unitarios de 1 llanta completa vs juego
        op_data = res.data['opciones'][0]
        self.assertEqual(Decimal(str(op_data['precio_unitario_publico'])), Decimal('1865.00'))
        self.assertEqual(Decimal(str(op_data['precio_par'])), Decimal('3615.00'))
        self.assertEqual(Decimal(str(op_data['precio_juego_4'])), Decimal('7015.00'))

        # 3. Validar desglose a 3 MSI
        msi = op_data['desglose_msi']
        self.assertIn('3_meses', msi)
        self.assertEqual(Decimal(str(msi['3_meses']['total'])), Decimal('7015.00'))
        self.assertEqual(Decimal(str(msi['3_meses']['mensualidad'])), Decimal('2338.33'))

        # 4. Validar generación de PDF
        res_pdf = self.client.get(f'/api/ventas/cotizaciones/{cot_bd.id}/pdf/')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertEqual(res_pdf['Content-Type'], 'application/pdf')
        self.assertTrue(res_pdf.content.startswith(b'%PDF'))


    def test_vendedor_edicion_con_pin_admin_y_trazabilidad(self):
        """Un vendedor puede editar una venta ingresando el PIN maestro del administrador"""
        self.admin_user.set_pin('1234')
        self.admin_user.save()

        vendedor = Usuario.objects.create_user(
            username='vendedor_pin',
            password='password123',
            rol='vendedor'
        )

        venta = Venta.objects.create(
            folio='V-PIN001',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('500.00'),
            subtotal=Decimal('500.00'),
            total=Decimal('500.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            servicio=self.servicio,
            cantidad=1,
            precio_unitario=Decimal('500.00'),
            subtotal=Decimal('500.00')
        )

        update_payload = {
            'total': '700.00',
            'subtotal': '700.00',
            'monto_efectivo': '700.00',
            'pin_admin': '1234',
            'motivo': 'Ajuste de precio solicitado por cliente',
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'cantidad': 1,
                    'precio_unitario': '700.00'
                }
            ]
        }

        self.client.force_authenticate(user=vendedor)
        res = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['fue_editada'])
        self.assertEqual(Decimal(str(res.data['total_original'])), Decimal('500.00'))
        self.assertEqual(Decimal(str(res.data['diferencia_monetaria'])), Decimal('200.00'))
        self.assertEqual(res.data['autorizada_por_nombre'], self.admin_user.get_full_name() or self.admin_user.username)
        self.assertEqual(res.data['motivo_edicion'], 'Ajuste de precio solicitado por cliente')

        venta.refresh_from_db()
        self.assertTrue(venta.fue_editada)
        self.assertEqual(venta.total, Decimal('700.00'))
        self.assertEqual(venta.total_original, Decimal('500.00'))
        self.assertEqual(venta.diferencia_monetaria, Decimal('200.00'))
        self.assertEqual(venta.autorizada_por, self.admin_user)
        self.assertEqual(venta.editada_por, vendedor)

    def test_vendedor_edicion_con_codigo_otp(self):
        """Un vendedor puede editar una venta usando un código OTP de SolicitudAutorizacion"""
        from apps.ventas.models import SolicitudAutorizacion

        vendedor = Usuario.objects.create_user(
            username='vendedor_otp',
            password='password123',
            rol='vendedor'
        )

        venta = Venta.objects.create(
            folio='V-OTP001',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('500.00'),
            subtotal=Decimal('500.00'),
            total=Decimal('500.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            servicio=self.servicio,
            cantidad=1,
            precio_unitario=Decimal('500.00'),
            subtotal=Decimal('500.00')
        )

        solicitud = SolicitudAutorizacion.objects.create(
            venta=venta,
            accion='editar_venta',
            solicitado_por=vendedor,
            autorizado_por=self.admin_user,
            motivo='Error en captura de servicio',
            codigo_otp='987654',
            estado='aprobada',
            expires_at=timezone.now() + timezone.timedelta(minutes=15)
        )

        update_payload = {
            'total': '650.00',
            'subtotal': '650.00',
            'monto_efectivo': '650.00',
            'codigo_autorizacion': '987654',
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'cantidad': 1,
                    'precio_unitario': '650.00'
                }
            ]
        }

        self.client.force_authenticate(user=vendedor)
        res = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, 200)

        # La solicitud debe marcarse como consumida
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, 'consumida')

        # Si se intenta reutilizar el mismo código OTP -> 403
        res_reuso = self.client.patch(f'/api/ventas/ventas/{venta.id}/', update_payload, format='json')
        self.assertEqual(res_reuso.status_code, 403)

    def test_vendedor_eliminacion_con_pin_admin_y_reversion_inventario(self):
        """Eliminar una venta revierte exactamente las salidas de inventario y descuenta de caja"""
        self.admin_user.set_pin('4321')
        self.admin_user.save()

        vendedor = Usuario.objects.create_user(
            username='vendedor_del',
            password='password123',
            rol='vendedor'
        )

        # Stock inicial es 10 (creado en setUp)
        self.assertEqual(self.producto.stock_actual, 10)

        # Crear venta que consume 2 llantas
        venta = Venta.objects.create(
            folio='V-DEL001',
            caja=self.caja,
            empleado=self.empleado,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('3000.00'),
            subtotal=Decimal('3000.00'),
            total=Decimal('3000.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            producto=self.producto,
            descripcion=self.producto.descripcion_completa,
            cantidad=2,
            precio_unitario=Decimal('1500.00'),
            subtotal=Decimal('3000.00')
        )
        SalidaInventario.objects.create(
            producto=self.producto,
            venta=venta,
            cantidad=2,
            precio_venta=Decimal('1500.00'),
            precio_costo=Decimal('1000.00'),
            fecha_venta=timezone.localdate()
        )

        self.assertEqual(self.producto.stock_actual, 8)
        self.assertEqual(self.caja.total_ventas, Decimal('3000.00'))

        # Eliminar con PIN admin
        self.client.force_authenticate(user=vendedor)
        res = self.client.delete(
            f'/api/ventas/ventas/{venta.id}/',
            data={'pin_admin': '4321', 'motivo': 'Cliente canceló compra'},
            format='json'
        )
        self.assertEqual(res.status_code, 204)

        # Stock vuelve a 10
        self.assertEqual(self.producto.stock_actual, 10)
        # Salida eliminada
        self.assertFalse(SalidaInventario.objects.filter(venta_id=venta.id).exists())
        # Total en caja vuelve a 0
        self.assertEqual(self.caja.total_ventas, Decimal('0.00'))

    def test_reimpresion_ticket_ventas_caja(self):
        """Endpoint ventas_caja devuelve VentaSerializer completo con detalles para ticket térmico"""
        venta = Venta.objects.create(
            folio='V-TICKET001',
            caja=self.caja,
            empleado=self.empleado,
            cliente=self.cliente,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('1200.00'),
            subtotal=Decimal('1200.00'),
            total=Decimal('1200.00')
        )
        DetalleVenta.objects.create(
            venta=venta,
            servicio=self.servicio,
            descripcion='Alineación y balanceo',
            cantidad=1,
            precio_unitario=Decimal('1200.00'),
            subtotal=Decimal('1200.00')
        )

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get(f'/api/caja/cajas/{self.caja.id}/ventas_caja/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('ventas', res.data)
        self.assertEqual(len(res.data['ventas']), 1)
        venta_data = res.data['ventas'][0]
        self.assertEqual(venta_data['folio'], 'V-TICKET001')
        self.assertIn('detalles', venta_data)
        self.assertEqual(len(venta_data['detalles']), 1)
        self.assertEqual(venta_data['detalles'][0]['descripcion'], 'Alineación y balanceo')
        self.assertEqual(venta_data['cliente_nombre'], 'Cliente Test')
        self.assertEqual(venta_data['empleado_nombre'], 'Juan Pérez')

    def test_gastos_metodos_pago_tarjeta_debito_y_credito(self):
        """Gasto acepta tarjeta_debito y tarjeta_credito"""
        from apps.gastos.models import Gasto, CategoriaGasto

        cat = CategoriaGasto.objects.create(nombre='Insumos Taller')

        self.client.force_authenticate(user=self.admin_user)

        res_debito = self.client.post('/api/gastos/gastos/', {
            'concepto': 'Compra herramientas débito',
            'monto': '450.00',
            'categoria': cat.id,
            'metodo_pago': 'tarjeta_debito',
        }, format='json')
        self.assertEqual(res_debito.status_code, 201)
        self.assertEqual(res_debito.data['metodo_pago'], 'tarjeta_debito')

        res_credito = self.client.post('/api/gastos/gastos/', {
            'concepto': 'Refacciones crédito',
            'monto': '1200.00',
            'categoria': cat.id,
            'metodo_pago': 'tarjeta_credito',
        }, format='json')
        self.assertEqual(res_credito.status_code, 201)
        self.assertEqual(res_credito.data['metodo_pago'], 'tarjeta_credito')








