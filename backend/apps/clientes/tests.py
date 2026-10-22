from datetime import timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado
from apps.clientes.models import Cliente, Vehiculo
from apps.caja.models import Caja
from apps.ventas.models import Servicio
from apps.rescates.models import UnidadMovil, Rescate, DetalleRescate


class ExpedienteClinicoVehiculoTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = Usuario.objects.create_user(
            username='admin_clientes',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.client.force_authenticate(user=self.admin_user)

        self.empleado = Empleado.objects.create(
            nombre='Carlos',
            apellido='Técnico',
            puesto='Mecánico',
            salario_base=Decimal('4000.00'),
            comision_porcentaje=Decimal('5.00')
        )

        self.caja = Caja.objects.create(
            folio='C-000100',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )

        self.cliente = Cliente.objects.create(
            nombre='Roberto Gómez',
            telefono='9991234567',
            email='roberto@example.com'
        )

        self.vehiculo = Vehiculo.objects.create(
            cliente=self.cliente,
            marca='Toyota',
            modelo='Corolla',
            año=2022,
            placas='YZA-123-A',
            color='Blanco Perla',
            medida_llantas='205/55R16',
            kilometraje_ultimo=35000
        )

        self.servicio = Servicio.objects.create(
            nombre='Rotación y Balanceo',
            precio=Decimal('400.00')
        )

    def test_sincronizacion_medidas_vehiculo_en_save(self):
        self.assertEqual(self.vehiculo.medida_llanta_delantera, '205/55R16')

        v2 = Vehiculo.objects.create(
            cliente=self.cliente,
            marca='BMW',
            modelo='330i',
            año=2023,
            placas='BMW-999',
            medida_llanta_delantera='225/45R18',
            medida_llanta_trasera='255/40R18'
        )
        self.assertEqual(v2.medida_llantas, '225/45R18')
        self.assertEqual(v2.medida_llanta_trasera, '255/40R18')

    def test_venta_actualiza_expediente_vehiculo_y_kilometraje(self):
        hoy = timezone.localdate()
        payload = {
            'empleado': self.empleado.id,
            'cliente': self.cliente.id,
            'vehiculo': self.vehiculo.id,
            'kilometraje_actual': 42500,
            'metodo_pago': 'efectivo',
            'monto_efectivo': '400.00',
            'monto_electronico': '0.00',
            'subtotal': '400.00',
            'descuento': '0.00',
            'total': '400.00',
            'detalles': [
                {
                    'servicio': self.servicio.id,
                    'descripcion': 'Rotación y Balanceo',
                    'cantidad': 1,
                    'precio_unitario': '400.00'
                }
            ]
        }
        res = self.client.post('/api/ventas/ventas/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.kilometraje_ultimo, 42500)
        self.assertEqual(self.vehiculo.fecha_ultimo_servicio, hoy)
        self.assertEqual(self.vehiculo.fecha_proximo_servicio, hoy + timedelta(days=180))

    def test_rescate_cobrar_actualiza_fechas_servicio_vehiculo(self):
        hoy = timezone.localdate()
        unidad = UnidadMovil.objects.create(numero_economico='U-01', nombre='Camioneta 1')
        rescate = Rescate.objects.create(
            cliente=self.cliente,
            vehiculo=self.vehiculo,
            unidad=unidad,
            operador=self.empleado,
            nombre_cliente=self.cliente.nombre,
            telefono_cliente=self.cliente.telefono,
            ubicacion_texto='Periférico Norte Km 25',
            vehiculo_marca_modelo='Toyota Corolla',
            vehiculo_placas='YZA-123-A',
            subtotal=Decimal('600.00'),
            total=Decimal('600.00'),
        )
        DetalleRescate.objects.create(
            rescate=rescate,
            descripcion='Desponche a domicilio',
            cantidad=1,
            precio_unitario=Decimal('600.00'),
            subtotal=Decimal('600.00')
        )

        res = self.client.post(
            f'/api/rescates/ordenes/{rescate.id}/cobrar/',
            {'metodo_pago': 'efectivo', 'monto_efectivo': '600.00'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.fecha_ultimo_servicio, hoy)
        self.assertEqual(self.vehiculo.fecha_proximo_servicio, hoy + timedelta(days=180))

    def test_endpoint_expediente_y_alertas_servicio(self):
        hoy = timezone.localdate()
        self.vehiculo.fecha_ultimo_servicio = hoy - timedelta(days=175)
        self.vehiculo.fecha_proximo_servicio = hoy + timedelta(days=5)
        self.vehiculo.save()

        # Verificar alertas_servicio
        res_alertas = self.client.get('/api/clientes/vehiculos/alertas_servicio/')
        self.assertEqual(res_alertas.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_alertas.data), 1)
        self.assertEqual(res_alertas.data[0]['estado_alerta'], 'proximo')
        self.assertEqual(res_alertas.data[0]['dias_para_servicio'], 5)
        self.assertIn('https://wa.me/529991234567', res_alertas.data[0]['whatsapp_recordatorio_url'])

        # Verificar expediente
        res_exp = self.client.get(f'/api/clientes/vehiculos/{self.vehiculo.id}/expediente/')
        self.assertEqual(res_exp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_exp.data['vehiculo']['placas'], 'YZA-123-A')
        self.assertEqual(res_exp.data['cliente']['nombre'], 'Roberto Gómez')
        self.assertIn('historial_ventas', res_exp.data)
        self.assertIn('historial_rescates', res_exp.data)

        # Verificar búsqueda de cliente por placas
        res_busq = self.client.get('/api/clientes/clientes/?search=YZA-123-A')
        self.assertEqual(res_busq.status_code, status.HTTP_200_OK)
        results = res_busq.data.get('results', res_busq.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.cliente.id)

    def test_programar_servicio_y_patch_fechas(self):
        prox_date = str(timezone.localdate() + timedelta(days=90))
        res_prog = self.client.post(
            f'/api/clientes/vehiculos/{self.vehiculo.id}/programar_servicio/',
            {
                'fecha_proximo_servicio': prox_date,
                'kilometraje_ultimo': 48000,
                'notas': 'Programado para revisión de frenos y rotación'
            },
            format='json'
        )
        self.assertEqual(res_prog.status_code, status.HTTP_200_OK, res_prog.data)
        self.assertEqual(res_prog.data['fecha_proximo_servicio'], prox_date)
        self.assertEqual(res_prog.data['kilometraje_ultimo'], 48000)
        self.assertEqual(res_prog.data['estado_alerta'], 'al_dia')

        # También verificar PATCH directo
        nueva_fecha = str(timezone.localdate() + timedelta(days=10))
        res_patch = self.client.patch(
            f'/api/clientes/vehiculos/{self.vehiculo.id}/',
            {'fecha_proximo_servicio': nueva_fecha},
            format='json'
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK, res_patch.data)
        self.assertEqual(res_patch.data['fecha_proximo_servicio'], nueva_fecha)
        self.assertEqual(res_patch.data['estado_alerta'], 'proximo')

