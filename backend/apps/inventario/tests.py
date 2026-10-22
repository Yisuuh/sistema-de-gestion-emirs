from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.inventario.models import Proveedor, PagoProveedor, Marca, Producto, EntradaInventario


class InventarioModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario autenticado
        self.admin_user = Usuario.objects.create_user(
            username='admin_inv',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.client.force_authenticate(user=self.admin_user)

        # Proveedor
        self.proveedor = Proveedor.objects.create(
            nombre='Llantas y Rines de México',
            contacto='Lic. Armando Paredes',
            telefono='6141234567',
            email='ventas@llantasyrines.com'
        )

    def test_actualizacion_parcial_patch_pago_proveedor(self):
        """
        Verifica que un PagoProveedor pueda ser actualizado parcialmente (PATCH)
        modificando metodo_pago y numero_factura sin alterar monto ni proveedor.
        """
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('15000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            numero_factura='FAC-ORIG-001',
            referencia='TR-889900',
            notas='Pago inicial acordado',
            registrado_por=self.admin_user
        )

        patch_url = f'/api/inventario/pagos-proveedores/{pago.id}/'
        payload = {
            'metodo_pago': 'efectivo',
            'numero_factura': 'FAC-MOD-999',
            'referencia': 'RECIBO-EFECTIVO-01',
            'notas': 'Se liquidó en caja en efectivo con recibo'
        }

        response = self.client.patch(patch_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        pago.refresh_from_db()
        # Campos modificados
        self.assertEqual(pago.metodo_pago, 'efectivo')
        self.assertEqual(pago.numero_factura, 'FAC-MOD-999')
        self.assertEqual(pago.referencia, 'RECIBO-EFECTIVO-01')
        self.assertEqual(pago.notas, 'Se liquidó en caja en efectivo con recibo')

        # Campos intactos
        self.assertEqual(pago.monto, Decimal('15000.00'))
        self.assertEqual(pago.proveedor, self.proveedor)
        self.assertEqual(pago.registrado_por, self.admin_user)

    def test_creacion_pago_proveedor_via_api(self):
        """
        Verifica el registro de un nuevo pago a proveedor vía POST asignando registrado_por.
        """
        post_url = '/api/inventario/pagos-proveedores/'
        payload = {
            'proveedor': self.proveedor.id,
            'monto': '7500.00',
            'fecha': str(timezone.localdate()),
            'metodo_pago': 'cheque',
            'numero_factura': 'FAC-2026-CHQ',
            'referencia': 'CHQ-5544',
            'notas': 'Cheque nominativo entregado al agente'
        }

        response = self.client.post(post_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PagoProveedor.objects.count(), 1)

        pago = PagoProveedor.objects.get(id=response.data['id'])
        self.assertEqual(pago.monto, Decimal('7500.00'))
        self.assertEqual(pago.metodo_pago, 'cheque')
        self.assertEqual(pago.numero_factura, 'FAC-2026-CHQ')
        self.assertEqual(pago.registrado_por, self.admin_user)

    def test_adeudo_proveedor_calculo(self):
        """
        Verifica el cálculo de adeudo pendiente (entradas pendientes menos pagos realizados).
        """
        marca = Marca.objects.create(nombre='Goodyear')
        producto = Producto.objects.create(
            codigo='GY-100',
            medida='225/60R17',
            marca=marca,
            modelo='Assurance',
            indice_carga=99,
            indice_velocidad='H',
            precio_venta=Decimal('2500.00')
        )

        # Entrada de compra con saldo a pagar (10 piezas * 1500 = 15,000)
        EntradaInventario.objects.create(
            producto=producto,
            proveedor=self.proveedor,
            cantidad=10,
            precio_compra=Decimal('1500.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='FAC-TOTAL-15K',
            created_by=self.admin_user
        )

        # Pago de abono por 5,000
        PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('5000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            numero_factura='FAC-TOTAL-15K',
            registrado_por=self.admin_user
        )

        # Consultar detalle de adeudo del proveedor
        res = self.client.get(f'/api/inventario/adeudos/{self.proveedor.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['proveedor_nombre'], self.proveedor.nombre)
        self.assertEqual(Decimal(str(data['monto_total_deuda'])), Decimal('15000.00'))
        self.assertEqual(Decimal(str(data['monto_pagado'])), Decimal('5000.00'))
        self.assertEqual(Decimal(str(data['saldo_pendiente'])), Decimal('10000.00'))

    def test_operador_denegado_modificar_eliminar_pago_proveedor(self):
        """SEC-01: Operador no puede modificar ni eliminar pagos a proveedores."""
        operador = Usuario.objects.create_user(
            username='operador_inv',
            password='password123',
            rol='operador'
        )
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('3000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            registrado_por=self.admin_user
        )

        self.client.force_authenticate(user=operador)
        patch_res = self.client.patch(f'/api/inventario/pagos-proveedores/{pago.id}/', {'notas': 'hack'})
        self.assertEqual(patch_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Solo los administradores pueden modificar o eliminar pagos a proveedores.', str(patch_res.data))

        del_res = self.client.delete(f'/api/inventario/pagos-proveedores/{pago.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_impedir_modificacion_monto_y_proveedor_en_actualizacion(self):
        """SEC-01: No se permite modificar monto ni proveedor en actualización."""
        otro_proveedor = Proveedor.objects.create(nombre='Segundo Proveedor')
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('4000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            registrado_por=self.admin_user
        )

        # Intento de cambiar monto
        res_monto = self.client.patch(
            f'/api/inventario/pagos-proveedores/{pago.id}/',
            {'monto': '9999.00'},
            format='json'
        )
        self.assertEqual(res_monto.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('monto', res_monto.data)

        # Intento de cambiar proveedor
        res_prov = self.client.patch(
            f'/api/inventario/pagos-proveedores/{pago.id}/',
            {'proveedor': otro_proveedor.id},
            format='json'
        )
        self.assertEqual(res_prov.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('proveedor', res_prov.data)

    def test_validacion_archivo_comprobante_tamano_y_extension(self):
        """SEC-02: Validar tamaño máximo 5MB y extensiones permitidas en comprobante."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        # Archivo > 5 MB
        archivo_pesado = SimpleUploadedFile(
            'comprobante.pdf',
            b'x' * (6 * 1024 * 1024),
            content_type='application/pdf'
        )
        res_pesado = self.client.post(
            '/api/inventario/pagos-proveedores/',
            {
                'proveedor': self.proveedor.id,
                'monto': '1000.00',
                'fecha': str(timezone.localdate()),
                'metodo_pago': 'transferencia',
                'comprobante': archivo_pesado
            },
            format='multipart'
        )
        self.assertEqual(res_pesado.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('comprobante', res_pesado.data)

        # Archivo con extensión no permitida
        archivo_invalido = SimpleUploadedFile(
            'script.exe',
            b'malicious content',
            content_type='application/x-msdownload'
        )
        res_invalido = self.client.post(
            '/api/inventario/pagos-proveedores/',
            {
                'proveedor': self.proveedor.id,
                'monto': '1000.00',
                'fecha': str(timezone.localdate()),
                'metodo_pago': 'transferencia',
                'comprobante': archivo_invalido
            },
            format='multipart'
        )
        self.assertEqual(res_invalido.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('comprobante', res_invalido.data)

    def test_buscador_inteligente_medidas(self):
        """
        Verifica que búsquedas como '2055516', '205 55 16', '205-55-16' o '205/55R16'
        encuentren productos con medida '205/55 R16' o '205/55R16'.
        """
        marca = Marca.objects.create(nombre='Bridgestone')
        p1 = Producto.objects.create(
            codigo='BS-2055516',
            medida='205/55R16',
            marca=marca,
            modelo='Turanza',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2100.00')
        )
        p2 = Producto.objects.create(
            codigo='BS-2055516-B',
            medida='205/55 R16',
            marca=marca,
            modelo='Ecopia',
            indice_carga=91,
            indice_velocidad='H',
            precio_venta=Decimal('1950.00')
        )

        for termino in ['2055516', '205 55 16', '205-55-16', '205/55R16']:
            res = self.client.get(f'/api/inventario/productos/?search={termino}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            items = res.data.get('results', res.data)
            ids = [item['id'] for item in items]
            self.assertIn(p1.id, ids, f"Falló búsqueda para término: {termino}")
            self.assertIn(p2.id, ids, f"Falló búsqueda para término: {termino}")


