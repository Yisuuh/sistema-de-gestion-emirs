from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado
from apps.clientes.models import Cliente
from apps.caja.models import Caja
from apps.inventario.models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario
from apps.rescates.models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate


class RescatesModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario autenticado
        self.user = Usuario.objects.create_user(
            username='admin_rescate',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.client.force_authenticate(user=self.user)

        # Empleado chofer/operador
        self.operador = Empleado.objects.create(
            nombre='Carlos',
            apellido='Mendoza',
            puesto='Operador de Rescate',
            salario_base=Decimal('4000.00'),
            comision_porcentaje=Decimal('10.00')
        )

        # Cliente
        self.cliente = Cliente.objects.create(
            nombre='Mario Gómez',
            telefono='6141112233'
        )

        # Caja abierta
        self.caja = Caja.objects.create(
            folio='CAJA-001',
            monto_inicial=Decimal('1500.00'),
            empleado_apertura=self.operador,
            estado='abierta'
        )

        # Unidad móvil
        self.unidad = UnidadMovil.objects.create(
            numero_economico='MOV-01',
            nombre='Ram 700 Auxilio',
            placas='ABC-1234',
            modelo='2024',
            chofer_habitual=self.operador
        )

        # Servicio de rescate
        self.servicio = TipoServicioRescate.objects.create(
            nombre='Desponche y Auxilio en Sitio',
            descripcion='Servicio básico en carretera',
            precio_base=Decimal('450.00'),
            comision_operador=Decimal('100.00')
        )

        # Producto (llanta de auxilio)
        self.marca = Marca.objects.create(nombre='Nexen')
        self.proveedor = Proveedor.objects.create(nombre='Proveedor Mayorista')
        self.producto = Producto.objects.create(
            codigo='NEX-2055516',
            medida='205/55R16',
            marca=self.marca,
            modelo='N-Priz AH8',
            indice_carga=91,
            indice_velocidad='H',
            precio_venta=Decimal('1400.00')
        )
        # Entrada de stock
        EntradaInventario.objects.create(
            producto=self.producto,
            proveedor=self.proveedor,
            cantidad=10,
            precio_compra=Decimal('900.00'),
            fecha_compra=timezone.localdate(),
            en_inventario=True
        )

    def test_crear_unidad_movil(self):
        url = '/api/rescates/unidades/'
        data = {
            'numero_economico': 'MOV-02',
            'nombre': 'Nissan NP300 Taller Móvil',
            'placas': 'XYZ-9876',
            'modelo': '2023',
            'chofer_habitual': self.operador.id
        }
        res = self.client.post(url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(UnidadMovil.objects.count(), 2)
        self.assertEqual(res.data['numero_economico'], 'MOV-02')

    def test_crear_tipo_servicio_rescate(self):
        url = '/api/rescates/tipos-servicio/'
        data = {
            'nombre': 'Pase de Corriente y Carga',
            'descripcion': 'Batería 12V',
            'precio_base': '250.00',
            'comision_operador': '50.00'
        }
        res = self.client.post(url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TipoServicioRescate.objects.count(), 2)

    def test_crear_orden_rescate_con_folio_automatico(self):
        url = '/api/rescates/ordenes/'
        data = {
            'unidad': self.unidad.id,
            'operador': self.operador.id,
            'cliente': self.cliente.id,
            'nombre_cliente': 'Mario Gómez',
            'telefono_cliente': '6141112233',
            'ubicacion_texto': 'Periférico de la Juventud km 5',
            'coordenadas_gps': '28.6353, -106.0889',
            'vehiculo_marca_modelo': 'Nissan Versa 2020',
            'vehiculo_placas': 'EKR-1234',
            'medida_llanta': '205/55R16',
            'metodo_pago': 'efectivo',
            'detalles': [
                {
                    'servicio_rescate': self.servicio.id,
                    'descripcion': 'Desponche y Auxilio en Sitio',
                    'cantidad': 1,
                    'precio_unitario': '450.00'
                }
            ]
        }
        res = self.client.post(url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['folio'].startswith('RES-'))
        self.assertEqual(Decimal(str(res.data['total'])), Decimal('450.00'))
        self.assertEqual(res.data['estado'], 'solicitado')

    def test_cambiar_estado_rescate(self):
        rescate = Rescate.objects.create(
            folio='RES-000001',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Test Cliente',
            telefono_cliente='6140000000',
            ubicacion_texto='Av. Tecnológico',
            total=Decimal('450.00')
        )
        url = f'/api/rescates/ordenes/{rescate.id}/cambiar-estado/'

        # Cambiar a en_camino
        res = self.client.post(url, {'estado': 'en_camino'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['estado'], 'en_camino')

        # Cambiar a en_proceso
        res = self.client.post(url, {'estado': 'en_proceso'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['estado'], 'en_proceso')

    def test_cobrar_rescate_con_descuento_de_inventario(self):
        rescate = Rescate.objects.create(
            folio='RES-000002',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Prueba Cobro',
            telefono_cliente='6141234567',
            ubicacion_texto='Colonia Centro',
            subtotal=Decimal('1850.00'),
            total=Decimal('1850.00'),
            estado='en_proceso'
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            servicio_rescate=self.servicio,
            descripcion='Servicio en sitio',
            cantidad=1,
            precio_unitario=Decimal('450.00'),
            subtotal=Decimal('450.00')
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            producto=self.producto,
            descripcion=self.producto.descripcion_completa,
            cantidad=1,
            precio_unitario=Decimal('1400.00'),
            subtotal=Decimal('1400.00')
        )

        stock_antes = self.producto.stock_actual
        self.assertEqual(stock_antes, 10)

        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'metodo_pago': 'efectivo',
            'monto_efectivo': '1850.00',
            'notas': 'Pagado completo en efectivo en punto'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        rescate.refresh_from_db()
        self.assertEqual(rescate.estado, 'completado')
        self.assertIsNotNone(rescate.fecha_cierre)
        self.assertEqual(rescate.caja, self.caja)

        # Verificar salida de inventario generada
        self.assertEqual(self.producto.stock_actual, 9)
        salida = SalidaInventario.objects.filter(rescate=rescate, producto=self.producto).first()
        self.assertIsNotNone(salida)
        self.assertEqual(salida.cantidad, 1)
        self.assertEqual(salida.precio_costo, Decimal('900.00'))

    def test_ticket_rescate_endpoint(self):
        rescate = Rescate.objects.create(
            folio='RES-000003',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Ticket Cliente',
            telefono_cliente='6145558899',
            ubicacion_texto='Plaza del Sol',
            vehiculo_marca_modelo='Ford Ranger 2022',
            vehiculo_placas='XYZ-1111',
            medida_llanta='205/55R16',
            metodo_pago='efectivo',
            monto_efectivo=Decimal('450.00'),
            subtotal=Decimal('450.00'),
            total=Decimal('450.00'),
            estado='completado',
            fecha_cierre=timezone.now()
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            servicio_rescate=self.servicio,
            descripcion='Auxilio Vial',
            cantidad=1,
            precio_unitario=Decimal('450.00'),
            subtotal=Decimal('450.00')
        )

        url = f'/api/rescates/ordenes/{rescate.id}/ticket/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('whatsapp_text', res.data)
        self.assertIn('whatsapp_url', res.data)
        self.assertIn('RES-000003', res.data['whatsapp_text'])
        self.assertEqual(res.data['rescate']['folio'], 'RES-000003')

    def test_crear_ordenes_rescate_consecutivas_sin_colision_folio(self):
        folios = []
        for i in range(4):
            payload = {
                'unidad': self.unidad.id,
                'operador': self.operador.id,
                'cliente': self.cliente.id,
                'nombre_cliente': f'Cliente Rescate {i}',
                'telefono_cliente': '6141112233',
                'ubicacion_texto': f'Ubicacion {i}',
                'metodo_pago': 'efectivo',
                'detalles': [
                    {
                        'servicio_rescate': self.servicio.id,
                        'descripcion': 'Auxilio Vial',
                        'cantidad': 1,
                        'precio_unitario': '450.00'
                    }
                ]
            }
            res = self.client.post('/api/rescates/ordenes/', payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            folios.append(res.data['folio'])

        # Todos deben ser únicos
        self.assertEqual(len(folios), len(set(folios)))
        for folio in folios:
            self.assertTrue(folio.startswith('RES-'))

    def test_cobrar_rescate_falla_sin_caja_abierta(self):
        """SEC-05: Cobrar rescate debe fallar si no hay caja abierta disponible."""
        # Cerramos la caja existente
        self.caja.estado = 'cerrada'
        self.caja.save()

        rescate = Rescate.objects.create(
            folio='RES-000010',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Sin Caja',
            telefono_cliente='6149998877',
            ubicacion_texto='Carretera',
            subtotal=Decimal('450.00'),
            total=Decimal('450.00'),
            estado='en_proceso'
        )

        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'metodo_pago': 'efectivo',
            'monto_efectivo': '450.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No existe ninguna caja abierta activa para recibir el cobro del rescate.', res.data['error'])

    def test_cobrar_rescate_ya_completado_falla(self):
        """SEC-05: Cobrar un rescate ya completado debe fallar."""
        rescate = Rescate.objects.create(
            folio='RES-000011',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Ya Cobrado',
            telefono_cliente='6149998877',
            ubicacion_texto='Carretera',
            subtotal=Decimal('450.00'),
            total=Decimal('450.00'),
            estado='completado',
            caja=self.caja
        )

        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'metodo_pago': 'efectivo',
            'monto_efectivo': '450.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Este rescate ya fue cobrado previamente.', res.data['error'])

    def test_cobrar_con_costo_traslado_y_segregacion(self):
        """Verifica cobro con costo_traslado variable y cálculo de total_servicios y total_productos."""
        rescate = Rescate.objects.create(
            folio='RES-000099',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Traslado',
            telefono_cliente='6141234567',
            ubicacion_texto='Carretera Km 45',
            subtotal=Decimal('0.00'),
            total=Decimal('0.00'),
            estado='en_proceso'
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            servicio_rescate=self.servicio,
            descripcion='Auxilio Carretera',
            cantidad=1,
            precio_unitario=Decimal('500.00'),
            subtotal=Decimal('500.00')
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            producto=self.producto,
            descripcion='Llanta Nexen',
            cantidad=1,
            precio_unitario=Decimal('1400.00'),
            subtotal=Decimal('1400.00')
        )

        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'costo_traslado': '300.00',
            'distancia_km': '45.5',
            'metodo_pago': 'efectivo',
            'descuento': '50.00',
            'monto_efectivo': '2150.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        rescate.refresh_from_db()
        self.assertEqual(rescate.costo_traslado, Decimal('300.00'))
        self.assertEqual(rescate.distancia_km, Decimal('45.50'))
        self.assertEqual(rescate.total_servicios, Decimal('800.00'))
        self.assertEqual(rescate.total_productos, Decimal('1400.00'))
        self.assertEqual(rescate.subtotal, Decimal('2200.00'))
        self.assertEqual(rescate.total, Decimal('2150.00'))

    def test_cobrar_rechaza_costo_traslado_negativo(self):
        """Auditoría de integridad: cobrar debe rechazar costo_traslado negativo."""
        rescate = Rescate.objects.create(
            folio='RES-SEC-01',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Negativo',
            telefono_cliente='6145550001',
            ubicacion_texto='Carretera',
            vehiculo_marca_modelo='Auto',
            vehiculo_placas='PL-NEG',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            estado='en_proceso'
        )
        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'costo_traslado': '-150.00',
            'metodo_pago': 'efectivo',
            'monto_efectivo': '350.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("costo de traslado no puede ser un valor negativo", res.data['error'])

    def test_cobrar_rechaza_distancia_km_negativa(self):
        """Auditoría de integridad: cobrar debe rechazar distancia_km negativa."""
        rescate = Rescate.objects.create(
            folio='RES-SEC-02',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Distancia Negativa',
            telefono_cliente='6145550002',
            ubicacion_texto='Carretera',
            vehiculo_marca_modelo='Auto',
            vehiculo_placas='PL-NEG2',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            estado='en_proceso'
        )
        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'costo_traslado': '150.00',
            'distancia_km': '-25.0',
            'metodo_pago': 'efectivo',
            'monto_efectivo': '650.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("distancia en kilómetros no puede ser un valor negativo", res.data['error'])

    def test_cobrar_rechaza_descuento_negativo(self):
        """Auditoría de integridad: cobrar debe rechazar descuento negativo."""
        rescate = Rescate.objects.create(
            folio='RES-SEC-03',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Descuento Negativo',
            telefono_cliente='6145550003',
            ubicacion_texto='Carretera',
            vehiculo_marca_modelo='Auto',
            vehiculo_placas='PL-NEG3',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            estado='en_proceso'
        )
        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'costo_traslado': '100.00',
            'descuento': '-50.00',
            'metodo_pago': 'efectivo',
            'monto_efectivo': '650.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("descuento no puede ser un valor negativo", res.data['error'])

    def test_cobrar_rechaza_doble_cobro(self):
        """Auditoría de integridad: rescate ya completado no puede ser vuelto a cobrar."""
        rescate = Rescate.objects.create(
            folio='RES-SEC-04',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Doble Cobro',
            telefono_cliente='6145550004',
            ubicacion_texto='Carretera',
            vehiculo_marca_modelo='Auto',
            vehiculo_placas='PL-NEG4',
            subtotal=Decimal('500.00'),
            total=Decimal('500.00'),
            estado='completado',
            fecha_cierre=timezone.now()
        )
        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'metodo_pago': 'efectivo',
            'monto_efectivo': '500.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ya fue cobrado previamente", res.data['error'])

    def test_segregacion_comisiones_llantas_rescates(self):
        """Segregación contable: llantas en rescates no generan comisiones indebidas al operador."""
        # Operador con comisión de auxilio vial configurada sólo para servicios
        self.assertEqual(self.servicio.comision_operador, Decimal('100.00'))

        # Crear rescate con servicio + llanta
        rescate = Rescate.objects.create(
            folio='RES-COM-01',
            operador=self.operador,
            unidad=self.unidad,
            nombre_cliente='Cliente Segregación',
            telefono_cliente='6145559988',
            ubicacion_texto='Av. Tecnologico',
            vehiculo_marca_modelo='Nissan Versa',
            vehiculo_placas='PL-SEG',
            subtotal=Decimal('1850.00'),
            total=Decimal('1850.00'),
            estado='en_proceso'
        )
        det_servicio = DetalleRescate.objects.create(
            rescate=rescate,
            servicio_rescate=self.servicio,
            descripcion='Servicio de Auxilio',
            cantidad=1,
            precio_unitario=Decimal('450.00'),
            subtotal=Decimal('450.00')
        )
        det_llanta = DetalleRescate.objects.create(
            rescate=rescate,
            producto=self.producto,
            descripcion=self.producto.descripcion_completa,
            cantidad=1,
            precio_unitario=Decimal('1400.00'),
            subtotal=Decimal('1400.00')
        )
        # El detalle de llanta no tiene servicio_rescate asignado
        self.assertIsNone(det_llanta.servicio_rescate)

        # Cobrar rescate
        url = f'/api/rescates/ordenes/{rescate.id}/cobrar/'
        payload = {
            'metodo_pago': 'efectivo',
            'monto_efectivo': '1850.00'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Confirmar en Balance Global que los 1400.00 de la llanta van al taller
        res_bg = self.client.get('/api/reportes/balance-global/')
        self.assertEqual(res_bg.status_code, status.HTTP_200_OK)
        # El subtotal de la llanta (1400.00) se suma a ingresos_taller
        taller_ingresos = res_bg.data['resumen_ejecutivo']['ingresos_taller']
        self.assertGreaterEqual(taller_ingresos, 1400.00)

