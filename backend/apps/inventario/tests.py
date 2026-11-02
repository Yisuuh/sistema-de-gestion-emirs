from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.inventario.models import Proveedor, PagoProveedor, Marca, Producto, EntradaInventario, SalidaInventario


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

    def test_fecha_vencimiento_automatica_y_alertas(self):
        """Verifica el cálculo automático de fecha_vencimiento y las propiedades de alerta."""
        from datetime import timedelta
        prov_credito = Proveedor.objects.create(
            nombre='Proveedor Crédito S.A.',
            dias_credito=15
        )
        marca = Marca.objects.create(nombre='Continental')
        producto = Producto.objects.create(
            codigo='CONT-1',
            medida='195/65R15',
            marca=marca,
            modelo='ContiPremium',
            indice_carga=91,
            indice_velocidad='H',
            precio_venta=Decimal('1800.00')
        )
        hoy = timezone.localdate()
        entrada = EntradaInventario.objects.create(
            producto=producto,
            proveedor=prov_credito,
            cantidad=4,
            precio_compra=Decimal('1200.00'),
            fecha_compra=hoy,
            numero_factura='FAC-AUTO-15'
        )
        self.assertEqual(entrada.fecha_vencimiento, hoy + timedelta(days=15))
        self.assertEqual(entrada.dias_restantes, 15)
        self.assertEqual(entrada.estado_alerta, 'al_dia')

        # Probar factura vencida
        entrada_vencida = EntradaInventario.objects.create(
            producto=producto,
            proveedor=prov_credito,
            cantidad=2,
            precio_compra=Decimal('1200.00'),
            fecha_compra=hoy - timedelta(days=20),
            fecha_vencimiento=hoy - timedelta(days=5),
            numero_factura='FAC-VENCIDA'
        )
        self.assertLess(entrada_vencida.dias_restantes, 0)
        self.assertEqual(entrada_vencida.estado_alerta, 'vencida')

    def test_nuevos_metodos_pago_proveedor(self):
        """Verifica el registro con tarjeta_debito y tarjeta_credito."""
        pago_deb = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('3500.00'),
            fecha=timezone.localdate(),
            metodo_pago='tarjeta_debito',
            referencia='TDD-4455'
        )
        self.assertEqual(pago_deb.metodo_pago, 'tarjeta_debito')

        pago_cred = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('4200.00'),
            fecha=timezone.localdate(),
            metodo_pago='tarjeta_credito',
            referencia='TDC-9988'
        )
        self.assertEqual(pago_cred.metodo_pago, 'tarjeta_credito')

    def test_facturas_vencimiento_endpoint(self):
        """Verifica la acción facturas_vencimiento en EntradaInventarioViewSet."""
        from datetime import timedelta
        hoy = timezone.localdate()
        marca = Marca.objects.create(nombre='Michelin')
        prod = Producto.objects.create(
            codigo='MICH-100',
            medida='225/45R17',
            marca=marca,
            modelo='Primacy',
            indice_carga=94,
            indice_velocidad='W',
            precio_venta=Decimal('2800.00')
        )
        prov = Proveedor.objects.create(nombre='Michelin México', dias_credito=30)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=5,
            precio_compra=Decimal('1800.00'),
            fecha_compra=hoy - timedelta(days=32),
            fecha_vencimiento=hoy - timedelta(days=2),
            numero_factura='FAC-MICH-VENCIDA'
        )

        res = self.client.get('/api/inventario/entradas/facturas_vencimiento/?dias=7')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(len(data) >= 1)

        fac = next((f for f in data if f['numero_factura'] == 'FAC-MICH-VENCIDA'), None)
        self.assertIsNotNone(fac)
        self.assertEqual(fac['proveedor_nombre'], 'Michelin México')
        self.assertEqual(fac['monto_total'], 9000.0)
        self.assertEqual(fac['saldo_pendiente'], 9000.0)
        self.assertEqual(fac['estado_alerta'], 'vencida')
        self.assertLess(fac['dias_restantes'], 0)

        # También verificar alias de ruta en adeudos
        res_alias = self.client.get('/api/inventario/adeudos/facturas-vencimiento/?dias=7')
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)

    def test_parsear_cfdi_condiciones_pago(self):
        """Verifica la extracción de días de crédito y fecha de vencimiento al parsear CFDI."""
        from apps.inventario.views import _parsear_cfdi
        xml_test = b"""<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="A" Folio="101" Fecha="2026-10-01T12:00:00" SubTotal="1000.00" Total="1160.00"
            CondicionesDePago="CREDITO 30 DIAS" MetodoPago="PPD">
            <cfdi:Emisor Nombre="PROVEEDOR XML TEST" Rfc="PXT010101AAA"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="LL-100" Descripcion="205/55R16 91V Nexen N Priz" Cantidad="2" ValorUnitario="500.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""
        parsed = _parsear_cfdi(xml_test)
        self.assertEqual(parsed['numero_factura'], 'A101')
        self.assertEqual(parsed['dias_credito'], 30)
        self.assertEqual(parsed['fecha_vencimiento'], '2026-10-31')
        self.assertEqual(parsed['condiciones_de_pago'], 'CREDITO 30 DIAS')

    def test_facturas_vencimiento_seguridad_autenticacion(self):
        """Auditoría de seguridad: acceso anónimo a facturas_vencimiento debe retornar 401."""
        anon_client = APIClient()
        res = anon_client.get('/api/inventario/entradas/facturas_vencimiento/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_facturas_vencimiento_proteccion_inyeccion_y_no_datos_sensibles(self):
        """Auditoría de seguridad: sanitización de parámetros contra inyección y no exposición de secretos."""
        # Intento de inyección en query param 'dias'
        inyecciones = ["' OR '1'='1", "1; DROP TABLE usuarios;", "-999", "abc"]
        for inj in inyecciones:
            res = self.client.get(f'/api/inventario/entradas/facturas_vencimiento/?dias={inj}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Confirmar que los datos devueltos no contienen campos sensibles
        res_data = self.client.get('/api/inventario/entradas/facturas_vencimiento/').json()
        if res_data:
            primer_registro = res_data[0]
            campos_prohibidos = ['password', 'token', 'secret', 'rfc_curp', 'hash']
            for campo in campos_prohibidos:
                self.assertNotIn(campo, primer_registro)

    def test_agrupacion_adeudos_factura_remision_y_sin_factura(self):
        """
        Verifica que en _calcular_adeudo_proveedor las entradas se agrupen con keys:
        - FAC-<numero_factura>
        - REM-<folio_remision>
        - ENT-<id> para entradas sin factura ni remisión
        y que key y numero_factura estén presentes en facturas e items sin colisiones.
        """
        marca = Marca.objects.create(nombre='Yokohama')
        prod = Producto.objects.create(
            codigo='YOKO-01',
            medida='215/55R17',
            marca=marca,
            modelo='Bluearth',
            indice_carga=94,
            indice_velocidad='V',
            precio_venta=Decimal('2200.00')
        )
        prov = Proveedor.objects.create(nombre='Distribuidora Yokohama')

        # 1. Entrada con Factura
        e1 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=4,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='9876',
            created_by=self.admin_user
        )
        # 2. Entrada con Remisión (sin factura)
        e2 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            folio_remision='5544',
            created_by=self.admin_user
        )
        # 3. Entrada sin Factura ni Remisión
        e3 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=3,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )
        # 4. Segunda entrada sin Factura ni Remisión (debe tener su propia key ENT-<id>)
        e4 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=1,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )

        res = self.client.get(f'/api/inventario/adeudos/{prov.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Debe haber 4 grupos en facturas (ninguno colisionó)
        self.assertEqual(data['total_facturas'], 4)
        facturas = data['facturas']
        keys = [f['key'] for f in facturas]

        self.assertIn('FAC-9876', keys)
        self.assertIn('REM-5544', keys)
        self.assertIn(f'ENT-{e3.id}', keys)
        self.assertIn(f'ENT-{e4.id}', keys)

        fac_num = next(f for f in facturas if f['key'] == 'FAC-9876')
        self.assertEqual(fac_num['numero_factura'], '9876')
        self.assertEqual(fac_num['items'][0]['key'], 'FAC-9876')
        self.assertEqual(fac_num['items'][0]['numero_factura'], '9876')

        fac_rem = next(f for f in facturas if f['key'] == 'REM-5544')
        self.assertEqual(fac_rem['numero_factura'], 'Remisión: 5544')
        self.assertEqual(fac_rem['items'][0]['key'], 'REM-5544')
        self.assertEqual(fac_rem['items'][0]['numero_factura'], 'Remisión: 5544')

        fac_ent = next(f for f in facturas if f['key'] == f'ENT-{e3.id}')
        self.assertEqual(fac_ent['numero_factura'], f'Entrada #{e3.id} (Sin Factura)')
        self.assertEqual(fac_ent['items'][0]['key'], f'ENT-{e3.id}')
        self.assertEqual(fac_ent['items'][0]['numero_factura'], f'Entrada #{e3.id} (Sin Factura)')

    def test_consolidado_filtro_activos(self):
        """
        Verifica el funcionamiento del query param 'activo' ('true', 'false', 'todos')
        en ProductoViewSet.consolidado y la presencia del campo 'activo' en cada item.
        """
        marca = Marca.objects.create(nombre='Toyo')
        prod_activo = Producto.objects.create(
            codigo='TOYO-ACT',
            medida='205/65R15',
            marca=marca,
            modelo='Proxes',
            indice_carga=94,
            indice_velocidad='H',
            precio_venta=Decimal('1800.00'),
            activo=True
        )
        prod_inactivo = Producto.objects.create(
            codigo='TOYO-INACT',
            medida='205/65R15',
            marca=marca,
            modelo='Tranpath',
            indice_carga=94,
            indice_velocidad='H',
            precio_venta=Decimal('1700.00'),
            activo=False
        )

        # 1. Por defecto (activo=true implícito)
        res_default = self.client.get('/api/inventario/productos/consolidado/')
        self.assertEqual(res_default.status_code, status.HTTP_200_OK)
        ids_default = [p['id'] for p in res_default.json()['productos']]
        self.assertIn(prod_activo.id, ids_default)
        self.assertNotIn(prod_inactivo.id, ids_default)

        # 2. Activos explícitos (?activo=true)
        res_act = self.client.get('/api/inventario/productos/consolidado/?activo=true')
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        items_act = res_act.json()['productos']
        self.assertTrue(all(item['activo'] is True for item in items_act))
        self.assertIn(prod_activo.id, [p['id'] for p in items_act])
        self.assertNotIn(prod_inactivo.id, [p['id'] for p in items_act])

        # 3. Inactivos (?activo=false)
        res_inact = self.client.get('/api/inventario/productos/consolidado/?activo=false')
        self.assertEqual(res_inact.status_code, status.HTTP_200_OK)
        items_inact = res_inact.json()['productos']
        self.assertTrue(all(item['activo'] is False for item in items_inact))
        self.assertIn(prod_inactivo.id, [p['id'] for p in items_inact])
        self.assertNotIn(prod_activo.id, [p['id'] for p in items_inact])

        # 4. Todos (?activo=todos)
        res_todos = self.client.get('/api/inventario/productos/consolidado/?activo=todos')
        self.assertEqual(res_todos.status_code, status.HTTP_200_OK)
        ids_todos = [p['id'] for p in res_todos.json()['productos']]
        self.assertIn(prod_activo.id, ids_todos)
        self.assertIn(prod_inactivo.id, ids_todos)

    def test_eliminacion_segura_producto_con_y_sin_historial(self):
        """
        Verifica que un producto con historial de entradas o salidas no pueda ser
        eliminado físicamente (HTTP 400), mientras que uno sin historial sí pueda (HTTP 204).
        """
        marca = Marca.objects.create(nombre='Continental')
        prod_con_entrada = Producto.objects.create(
            codigo='CONTI-01',
            medida='225/50R17',
            marca=marca,
            modelo='ContiPremiumContact',
            indice_carga=98,
            indice_velocidad='W',
            precio_venta=Decimal('3100.00')
        )
        EntradaInventario.objects.create(
            producto=prod_con_entrada,
            proveedor=self.proveedor,
            cantidad=2,
            precio_compra=Decimal('2000.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )

        # Intento de eliminar producto con entradas -> debe fallar con 400
        del_res_entrada = self.client.delete(f'/api/inventario/productos/{prod_con_entrada.id}/')
        self.assertEqual(del_res_entrada.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No se puede eliminar definitivamente un producto con historial de entradas o ventas', del_res_entrada.json()['error'])
        self.assertTrue(Producto.objects.filter(id=prod_con_entrada.id).exists())

        # Producto con salidas -> debe fallar con 400
        prod_con_salida = Producto.objects.create(
            codigo='CONTI-02',
            medida='225/50R17',
            marca=marca,
            modelo='ContiSportContact',
            indice_carga=98,
            indice_velocidad='Y',
            precio_venta=Decimal('3500.00')
        )
        SalidaInventario.objects.create(
            producto=prod_con_salida,
            cantidad=1,
            precio_venta=Decimal('3500.00'),
            precio_costo=Decimal('2200.00'),
            fecha_venta=timezone.localdate()
        )
        del_res_salida = self.client.delete(f'/api/inventario/productos/{prod_con_salida.id}/')
        self.assertEqual(del_res_salida.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No se puede eliminar definitivamente un producto con historial de entradas o ventas', del_res_salida.json()['error'])
        self.assertTrue(Producto.objects.filter(id=prod_con_salida.id).exists())

        # Producto sin historial -> debe eliminarse con 204
        prod_limpio = Producto.objects.create(
            codigo='CONTI-LIMPIO',
            medida='225/50R17',
            marca=marca,
            modelo='ContiEcoContact',
            indice_carga=98,
            indice_velocidad='V',
            precio_venta=Decimal('2900.00')
        )
        del_res_limpio = self.client.delete(f'/api/inventario/productos/{prod_limpio.id}/')
        self.assertEqual(del_res_limpio.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Producto.objects.filter(id=prod_limpio.id).exists())

    def test_cuenta_corriente_vs_cuenta_vencida_y_pagos_factura(self):
        """
        Verifica el desglose de pagos por factura, estados (vencida, vigente, pagada, abono_parcial),
        y el cálculo correcto de cuenta_vencida vs cuenta_corriente a nivel proveedor y resumen global.
        """
        from datetime import timedelta
        hoy = timezone.localdate()

        prov = Proveedor.objects.create(
            nombre='Proveedor Crédito Mixto',
            dias_credito=15
        )
        marca = Marca.objects.create(nombre='Pirelli')
        prod = Producto.objects.create(
            codigo='PIR-TEST-01',
            medida='205/55R16',
            marca=marca,
            modelo='Cinturato',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2000.00')
        )

        # 1. Factura Vencida (hace 20 días venció, deuda 10,000, abono 3,000 -> saldo 7,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=10,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=35),
            fecha_vencimiento=hoy - timedelta(days=20),
            numero_factura='FAC-VENCIDA-1',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('3000.00'),
            fecha=hoy - timedelta(days=25),
            metodo_pago='transferencia',
            numero_factura='FAC-VENCIDA-1',
            registrado_por=self.admin_user
        )

        # 2. Factura Vigente (vence en 10 días, deuda 20,000, sin pagos -> saldo 20,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=20,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=5),
            fecha_vencimiento=hoy + timedelta(days=10),
            numero_factura='FAC-VIGENTE-2',
            created_by=self.admin_user
        )

        # 3. Factura Pagada (deuda 5,000, pago 5,000 -> saldo 0)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=5,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=12),
            fecha_vencimiento=hoy + timedelta(days=3),
            numero_factura='FAC-PAGADA-3',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('5000.00'),
            fecha=hoy - timedelta(days=10),
            metodo_pago='cheque',
            numero_factura='FAC-PAGADA-3',
            registrado_por=self.admin_user
        )

        # 4. Remisión con Abono Parcial y vigente (deuda 6,000, abono 2,000 -> saldo 4,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=6,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=3),
            fecha_vencimiento=hoy + timedelta(days=12),
            folio_remision='REM-7788',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('2000.00'),
            fecha=hoy - timedelta(days=1),
            metodo_pago='transferencia',
            numero_factura='REM-7788',
            registrado_por=self.admin_user
        )

        # Consultar detalle del proveedor
        res_det = self.client.get(f'/api/inventario/adeudos/{prov.id}/')
        self.assertEqual(res_det.status_code, status.HTTP_200_OK)
        det = res_det.json()

        # Totales del proveedor:
        # Deuda total = 10,000 + 20,000 + 5,000 + 6,000 = 41,000
        # Pagos = 3,000 + 5,000 + 2,000 = 10,000
        # Saldo pendiente total = 31,000
        # Vencida = 7,000 (FAC-VENCIDA-1)
        # Corriente = 31,000 - 7,000 = 24,000 (20,000 + 4,000)
        self.assertEqual(det['monto_total_deuda'], 41000.0)
        self.assertEqual(det['monto_pagado'], 10000.0)
        self.assertEqual(det['saldo_pendiente_total'], 31000.0)
        self.assertEqual(det['cuenta_vencida'], 7000.0)
        self.assertEqual(det['cuenta_corriente'], 24000.0)

        # Verificar estados de facturas
        facs_by_key = {f['key']: f for f in det['facturas']}

        f_venc = facs_by_key['FAC-FAC-VENCIDA-1']
        self.assertEqual(f_venc['estado'], 'vencida')
        self.assertEqual(f_venc['monto_pagado'], 3000.0)
        self.assertEqual(f_venc['saldo_pendiente'], 7000.0)
        self.assertLess(f_venc['dias_restantes'], 0)
        self.assertEqual(len(f_venc['pagos']), 1)

        f_vig = facs_by_key['FAC-FAC-VIGENTE-2']
        self.assertEqual(f_vig['estado'], 'vigente')
        self.assertEqual(f_vig['monto_pagado'], 0.0)
        self.assertEqual(f_vig['saldo_pendiente'], 20000.0)
        self.assertGreater(f_vig['dias_restantes'], 0)

        f_pag = facs_by_key['FAC-FAC-PAGADA-3']
        self.assertEqual(f_pag['estado'], 'pagada')
        self.assertEqual(f_pag['monto_pagado'], 5000.0)
        self.assertEqual(f_pag['saldo_pendiente'], 0.0)
        self.assertEqual(len(f_pag['pagos']), 1)

        f_rem = facs_by_key['REM-REM-7788']
        self.assertEqual(f_rem['estado'], 'abono_parcial')
        self.assertEqual(f_rem['monto_pagado'], 2000.0)
        self.assertEqual(f_rem['saldo_pendiente'], 4000.0)
        self.assertGreater(f_rem['dias_restantes'], 0)
        self.assertEqual(len(f_rem['pagos']), 1)

        # Consultar resumen global
        res_glob = self.client.get('/api/inventario/adeudos/')
        self.assertEqual(res_glob.status_code, status.HTTP_200_OK)
        glob = res_glob.json()
        self.assertIn('total_cuenta_corriente_global', glob)
        self.assertIn('total_cuenta_vencida_global', glob)
        self.assertGreaterEqual(glob['total_cuenta_vencida_global'], 7000.0)
        self.assertGreaterEqual(glob['total_cuenta_corriente_global'], 24000.0)

    def test_facturas_vencimiento_orden_estricto(self):
        """
        Verifica que facturas_vencimiento ordene estrictamente:
        1. Vencidas: de mayor retraso (-20) a menor retraso (-5).
        2. Por vencer y al día: en orden ascendente de días restantes (0, luego 2, luego 5).
        """
        from datetime import timedelta
        hoy = timezone.localdate()

        prov = Proveedor.objects.create(nombre='Proveedor Orden Estricto', dias_credito=30)
        marca = Marca.objects.create(nombre='Hankook')
        prod = Producto.objects.create(
            codigo='HK-ORDEN-01',
            medida='225/65R17',
            marca=marca,
            modelo='Dynapro',
            indice_carga=102,
            indice_velocidad='H',
            precio_venta=Decimal('2400.00')
        )

        # Factura vencida hace 20 días
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=50),
            fecha_vencimiento=hoy - timedelta(days=20),
            numero_factura='FAC-RETRASO-20',
            created_by=self.admin_user
        )
        # Factura vencida hace 5 días
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=35),
            fecha_vencimiento=hoy - timedelta(days=5),
            numero_factura='FAC-RETRASO-05',
            created_by=self.admin_user
        )
        # Factura que vence hoy (dias_restantes = 0)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=30),
            fecha_vencimiento=hoy,
            numero_factura='FAC-VENCE-HOY',
            created_by=self.admin_user
        )
        # Factura que vence en 2 días (dias_restantes = 2)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=28),
            fecha_vencimiento=hoy + timedelta(days=2),
            numero_factura='FAC-VENCE-2DIAS',
            created_by=self.admin_user
        )
        # Factura que vence en 6 días (dias_restantes = 6)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=24),
            fecha_vencimiento=hoy + timedelta(days=6),
            numero_factura='FAC-VENCE-6DIAS',
            created_by=self.admin_user
        )

        res = self.client.get('/api/inventario/entradas/facturas_vencimiento/?dias=7')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        facturas = res.json()

        # Filtrar solo las de este proveedor para aislar la prueba
        facturas_test = [f for f in facturas if f['proveedor_nombre'] == 'Proveedor Orden Estricto']
        self.assertEqual(len(facturas_test), 5)

        numeros_orden = [f['numero_factura'] for f in facturas_test]
        esperado = [
            'FAC-RETRASO-20',  # dias_restantes = -20 (mayor retraso primero)
            'FAC-RETRASO-05',  # dias_restantes = -5
            'FAC-VENCE-HOY',   # dias_restantes = 0
            'FAC-VENCE-2DIAS', # dias_restantes = 2
            'FAC-VENCE-6DIAS'  # dias_restantes = 6
        ]
        self.assertEqual(numeros_orden, esperado)

    def test_calcular_precio_venta_sugerido_tabulador_rin(self):
        """
        Verifica el cálculo del precio de venta sugerido con el tabulador de utilidad por Rin:
        - Costo 1099, Rin 16 -> 1865.00
        - Costo 1307, Rin 16 -> 2125.00
        - Pruebas adicionales de Rin (<=15, 17/18, >=19)
        """
        from apps.inventario.views import _calcular_precio_venta_sugerido

        # Caso 1: Costo 1099, Rin 16
        precio_1 = _calcular_precio_venta_sugerido(Decimal('1099.00'), '205/55R16')
        self.assertEqual(precio_1, Decimal('1865.00'))

        # Caso 2: Costo 1307, Rin 16
        precio_2 = _calcular_precio_venta_sugerido(Decimal('1307.00'), '205/55R16')
        self.assertEqual(precio_2, Decimal('2125.00'))

        # Caso 3: Rin 15 (m1=400) con costo 1000
        precio_3 = _calcular_precio_venta_sugerido(Decimal('1000.00'), '195/65R15')
        self.assertEqual(precio_3, Decimal('1685.00'))

        # Caso 4: Rin 17 (m1=700) con costo 2000
        precio_4 = _calcular_precio_venta_sugerido(Decimal('2000.00'), '225/50R17')
        self.assertEqual(precio_4, Decimal('3260.00'))

        # Caso 5: Rin 20 (m1=850) con costo 3000
        precio_5 = _calcular_precio_venta_sugerido(Decimal('3000.00'), '275/40R20')
        self.assertEqual(precio_5, Decimal('4675.00'))

    def test_parsear_cfdi_incluye_precio_venta_sugerido(self):
        """
        Verifica que _parsear_cfdi procese los conceptos e incluya el campo 'precio_venta_sugerido'
        calculado con el tabulador de Rin.
        """
        from apps.inventario.views import _parsear_cfdi

        xml_content = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="FAC" Folio="1001" Fecha="2026-10-30T10:00:00"
            SubTotal="2406.00" Total="2790.96" CondicionesDePago="30 dias" MetodoPago="PPD">
            <cfdi:Emisor Rfc="LAN101010ABC" Nombre="LLANTERA NACIONAL SA DE CV" />
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="LL-1099" Cantidad="2"
                    Descripcion="LLANTA 205/55R16 91V MICHELIN PRIMACY 4"
                    ValorUnitario="1099.00" />
                <cfdi:Concepto NoIdentificacion="LL-1307" Cantidad="4"
                    Descripcion="LLANTA 205/60R16 92H PIRELLI CINTURATO P7"
                    ValorUnitario="1307.00" />
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        datos = _parsear_cfdi(xml_content)
        self.assertEqual(len(datos['items']), 2)
        item1 = datos['items'][0]
        self.assertEqual(item1['codigo'], 'LL-1099')
        self.assertIn('precio_venta_sugerido', item1)
        self.assertEqual(item1['precio_venta_sugerido'], 1865.0)

        item2 = datos['items'][1]
        self.assertEqual(item2['codigo'], 'LL-1307')
        self.assertIn('precio_venta_sugerido', item2)
        self.assertEqual(item2['precio_venta_sugerido'], 2125.0)

    def test_importar_xml_guardar_asigna_precio_tabulador_rin(self):
        """
        Verifica que ImportarXMLView._guardar aplique el precio de venta según el tabulador de Rin,
        y actualice el precio si el producto ya existía.
        """
        from apps.inventario.views import ImportarXMLView

        # Precrear un producto existente con precio viejo
        marca = Marca.objects.create(nombre='MICHELIN')
        prod_existente = Producto.objects.create(
            codigo='LL-1099',
            medida='205/55R16',
            marca=marca,
            modelo='PRIMACY 4',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('1500.00'),
            stock_minimo=2
        )

        datos_factura = {
            'numero_factura': 'FAC-RIN-TEST',
            'fecha_compra': '2026-10-30',
            'fecha_vencimiento': '2026-11-29',
            'dias_credito': 30,
            'proveedor': {
                'nombre': 'PROVEEDOR TABULADOR RIN',
                'rfc': 'PTR999999XYZ'
            },
            'items': [
                {
                    'codigo': 'LL-1099',
                    'descripcion': 'LLANTA 205/55R16 91V MICHELIN PRIMACY 4',
                    'cantidad': 4,
                    'precio_compra': 1099.00,
                    'medida': '205/55R16',
                    'marca_nombre': 'MICHELIN',
                    'modelo': 'PRIMACY 4',
                    'indice_carga': 91,
                    'indice_velocidad': 'V',
                },
                {
                    'codigo': 'LL-1307-NEW',
                    'descripcion': 'LLANTA 205/60R16 92H PIRELLI CINTURATO P7',
                    'cantidad': 2,
                    'precio_compra': 1307.00,
                    'medida': '205/60R16',
                    'marca_nombre': 'PIRELLI',
                    'modelo': 'CINTURATO P7',
                    'indice_carga': 92,
                    'indice_velocidad': 'H',
                }
            ]
        }

        view = ImportarXMLView()
        resultado = view._guardar(datos_factura, self.admin_user)

        # 1. Producto existente debió actualizarse a $1865.00
        prod_existente.refresh_from_db()
        self.assertEqual(prod_existente.precio_venta, Decimal('1865.00'))

        # 2. Producto nuevo debió crearse con $2125.00
        prod_nuevo = Producto.objects.get(codigo='LL-1307-NEW')
        self.assertEqual(prod_nuevo.precio_venta, Decimal('2125.00'))

        # 3. Entradas creadas
        entradas = EntradaInventario.objects.filter(numero_factura='FAC-RIN-TEST')
        self.assertEqual(entradas.count(), 2)

    def test_importar_xml_seguridad_autenticacion_y_rbac(self):
        """
        Auditoría de seguridad:
        1. Acceso anónimo a /api/inventario/importar-xml/ debe retornar 401 Unauthorized.
        2. Usuario con rol operador no debe tener permiso de guardar facturas (403 Forbidden).
        """
        from io import BytesIO

        xml_dummy = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="A" Folio="55" Fecha="2026-10-30T10:00:00" SubTotal="1000.00" Total="1160.00">
            <cfdi:Emisor Nombre="PROV TEST RBAC" Rfc="PRB010101XYZ"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="RBAC-01" Descripcion="205/55R16 91V TEST" Cantidad="2" ValorUnitario="500.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        # 1. Anónimo
        anon_client = APIClient()
        file_obj = BytesIO(xml_dummy)
        file_obj.name = 'factura.xml'
        res_anon = anon_client.post('/api/inventario/importar-xml/', {'xml': file_obj, 'accion': 'preview'}, format='multipart')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Operador autenticado
        operador_user = Usuario.objects.create_user(
            username='operador_inv',
            password='password123',
            rol='operador',
            is_staff=False
        )
        op_client = APIClient()
        op_client.force_authenticate(user=operador_user)

        file_obj.seek(0)
        res_op_guardar = op_client.post('/api/inventario/importar-xml/', {'xml': file_obj, 'accion': 'guardar'}, format='multipart')
        self.assertEqual(res_op_guardar.status_code, status.HTTP_403_FORBIDDEN)

    def test_importar_xml_transaccion_atomica_y_prevencion_valores_negativos(self):
        """
        Auditoría de seguridad:
        1. Comprobar que _guardar y _calcular_precio_venta_sugerido rechacen precios o cantidades negativos/cero.
        2. Comprobar que @transaction.atomic garantice atomicidad total ante fallos.
        """
        from apps.inventario.views import ImportarXMLView, _calcular_precio_venta_sugerido

        # 1. Validación en función de cálculo
        with self.assertRaises(ValueError):
            _calcular_precio_venta_sugerido(Decimal('-500.00'), '205/55R16')
        with self.assertRaises(ValueError):
            _calcular_precio_venta_sugerido(Decimal('0'), '205/55R16')

        # 2. Datos con un segundo item malicioso/anómalo (precio negativo)
        datos_maliciosos = {
            'numero_factura': 'FAC-ATOMIC-FAIL',
            'fecha_compra': '2026-10-30',
            'proveedor': {
                'nombre': 'PROVEEDOR ROBUST TEST',
                'rfc': 'PRT000000AAA'
            },
            'items': [
                {
                    'codigo': 'VALID-01',
                    'descripcion': 'LLANTA 205/55R16 91V VALIDA',
                    'cantidad': 2,
                    'precio_compra': 1000.00,
                    'medida': '205/55R16',
                },
                {
                    'codigo': 'INVALID-02',
                    'descripcion': 'LLANTA CON PRECIO NEGATIVO',
                    'cantidad': 2,
                    'precio_compra': -500.00,
                    'medida': '205/55R16',
                }
            ]
        }

        view = ImportarXMLView()
        with self.assertRaises(ValueError):
            view._guardar(datos_maliciosos, self.admin_user)

        # Verificar que el producto VALID-01 NO fue persistido (reversión atómica de la transacción)
        self.assertFalse(Producto.objects.filter(codigo='VALID-01').exists())
        self.assertFalse(EntradaInventario.objects.filter(numero_factura='FAC-ATOMIC-FAIL').exists())







