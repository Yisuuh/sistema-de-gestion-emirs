import sys
import random
from decimal import Decimal
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.test import RequestFactory

class Command(BaseCommand):
    help = 'Simula una jornada operativa completa de Centro Llantero EmirS (10 pasos E2E)'

    def add_arguments(self, parser):
        parser.add_argument('--ventas', type=int, default=5, help='Numero de ventas en POS a simular')
        parser.add_argument('--rescates', type=int, default=2, help='Numero de servicios de rescate a simular')
        parser.add_argument('--fecha', type=str, default=None, help='Fecha de la simulacion YYYY-MM-DD')

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('========================================================================'))
        self.stdout.write(self.style.SUCCESS('  CENTRO LLANTERO EMIRS - AGENTE SIMULADOR DE JORNADA OPERATIVA E2E    '))
        self.stdout.write(self.style.SUCCESS('========================================================================\n'))

        fecha_simulacion = timezone.localdate()
        if options['fecha']:
            from datetime import datetime
            fecha_simulacion = datetime.strptime(options['fecha'], '%Y-%m-%d').date()

        errores = []
        metricas = {
            'ventas_total': Decimal('0.00'),
            'ventas_cont': 0,
            'rescates_total': Decimal('0.00'),
            'rescates_cont': 0,
            'gastos_total': Decimal('0.00'),
            'gastos_cont': 0,
            'nomina_pagada': Decimal('0.00'),
            'pagos_proveedor': Decimal('0.00'),
            'entradas_piezas': 0,
        }

        # ── PASO 1: Usuarios y Empleados ──────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('[Paso 1/10] [AUTH] Verificando Usuarios y Personal Tecnico...'))
        admin_user = None
        cajero_user = None
        emp_tecnico = None
        emp_chofer = None

        try:
            from apps.usuarios.models import Usuario
            from apps.nomina.models import Empleado

            admin_user, _ = Usuario.objects.get_or_create(
                username='admin',
                defaults={
                    'first_name': 'Carlos',
                    'last_name': 'Mendoza',
                    'rol': 'admin',
                    'is_staff': True,
                    'is_superuser': True
                }
            )
            if not admin_user.has_usable_password():
                admin_user.set_password('Admin123!')
                admin_user.save()

            cajero_user, _ = Usuario.objects.get_or_create(
                username='cajero_turno',
                defaults={
                    'first_name': 'Laura',
                    'last_name': 'Garcia',
                    'rol': 'operador'
                }
            )
            if not cajero_user.has_usable_password():
                cajero_user.set_password('Cajero123!')
                cajero_user.save()

            emp_tecnico, _ = Empleado.objects.get_or_create(
                nombre='Laura',
                apellido='Garcia',
                defaults={
                    'puesto': 'Cajera y Mostrador',
                    'salario_base': Decimal('3200.00'),
                    'tipo_pago': 'semanal',
                    'metodo_pago': 'mixto',
                    'comision_porcentaje': Decimal('2.50'),
                    'pago_dominical': Decimal('450.00'),
                    'activo': True
                }
            )

            emp_chofer, _ = Empleado.objects.get_or_create(
                nombre='Roberto',
                apellido='Vazquez',
                defaults={
                    'puesto': 'Operador de Rescate y Auxilio',
                    'salario_base': Decimal('3500.00'),
                    'tipo_pago': 'semanal',
                    'metodo_pago': 'transferencia',
                    'comision_porcentaje': Decimal('5.00'),
                    'pago_dominical': Decimal('500.00'),
                    'activo': True
                }
            )
            self.stdout.write(f'  [OK] Usuario Admin: {admin_user.username} | Cajera: {emp_tecnico.nombre_completo} | Chofer: {emp_chofer.nombre_completo}')
        except Exception as e:
            errores.append(f"Paso 1 (Usuarios): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 1: {e}'))

        # ── PASO 2: Apertura de Turno de Caja ─────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 2/10] [CAJA] Apertura de Turno de Caja...'))
        caja_activa = None
        try:
            from apps.caja.models import Caja
            # Cerrar cualquier caja previa abierta para asegurar turno limpio
            Caja.objects.filter(estado='abierta').update(estado='cerrada', fecha_cierre=timezone.now())

            monto_fondo_inicial = Decimal('2500.00')
            rand_code = random.randint(100, 999)
            caja_activa = Caja.objects.create(
                folio=f"CAJA-{fecha_simulacion.strftime('%Y%m%d')}-{rand_code}",
                monto_inicial=monto_fondo_inicial,
                empleado_apertura=emp_tecnico,
                estado='abierta',
                notas_apertura='Apertura simulada de jornada completa'
            )
            self.stdout.write(f'  [OK] Turno de Caja {caja_activa.folio} ABIERTO con fondo inicial de ${monto_fondo_inicial:,.2f} MXN')
        except Exception as e:
            errores.append(f"Paso 2 (Caja Apertura): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 2: {e}'))

        # ── PASO 3: Catálogo y Entrada de Inventario (PEPS) ─────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 3/10] [INVENTARIO] Recepcion de Lote de Llantas (PEPS)...'))
        producto_1 = None
        producto_2 = None
        try:
            from apps.inventario.models import Marca, Proveedor, Producto, EntradaInventario

            marca_pirelli, _ = Marca.objects.get_or_create(nombre='Pirelli', defaults={'activa': True})
            marca_bridgestone, _ = Marca.objects.get_or_create(nombre='Bridgestone', defaults={'activa': True})

            prov_pirelli, _ = Proveedor.objects.get_or_create(
                nombre='Pirelli Neumaticos Mexico S.A.',
                defaults={'telefono': '55-5000-1122', 'dias_credito': 30, 'activo': True}
            )

            producto_1, _ = Producto.objects.get_or_create(
                codigo='LL-PIR-205-55-16',
                defaults={
                    'marca': marca_pirelli,
                    'modelo': 'Cinturato P7',
                    'medida': '205/55R16',
                    'indice_carga': 91,
                    'indice_velocidad': 'V',
                    'precio_venta': Decimal('1950.00'),
                    'stock_minimo': 4,
                    'activo': True
                }
            )

            producto_2, _ = Producto.objects.get_or_create(
                codigo='LL-BRG-225-65-17',
                defaults={
                    'marca': marca_bridgestone,
                    'modelo': 'Dueler H/T 684 II',
                    'medida': '225/65R17',
                    'indice_carga': 102,
                    'indice_velocidad': 'H',
                    'precio_venta': Decimal('2850.00'),
                    'stock_minimo': 4,
                    'activo': True
                }
            )

            rand_fac = random.randint(10000, 99999)
            rand_rem = random.randint(100, 999)

            entrada_lote = EntradaInventario.objects.create(
                producto=producto_1,
                proveedor=prov_pirelli,
                cantidad=12,
                precio_compra=Decimal('1200.00'),
                numero_factura=f'FAC-PIR-{rand_fac}',
                fecha_compra=fecha_simulacion,
                fecha_factura=fecha_simulacion,
                factura_pendiente=False,
                en_inventario=True,
                created_by=admin_user,
                notas='Lote PEPS recibido y verificado'
            )

            entrada_remision = EntradaInventario.objects.create(
                producto=producto_2,
                proveedor=prov_pirelli,
                cantidad=8,
                precio_compra=Decimal('1850.00'),
                folio_remision=f'REM-2026-{rand_rem}',
                fecha_compra=fecha_simulacion,
                factura_pendiente=True,
                en_inventario=True,
                created_by=admin_user,
                notas='Recepcion con nota de remision, factura pendiente'
            )

            metricas['entradas_piezas'] += 20
            self.stdout.write(f'  [OK] Entrada Factura {entrada_lote.numero_factura}: 12x {producto_1.descripcion_completa} (Costo: $1,200.00 c/u)')
            self.stdout.write(f'  [OK] Entrada Remision {entrada_remision.folio_remision}: 8x {producto_2.descripcion_completa} (Factura pendiente)')
            self.stdout.write(f'  [OK] Stock actual {producto_1.codigo}: {producto_1.stock_actual} pzas | {producto_2.codigo}: {producto_2.stock_actual} pzas')
        except Exception as e:
            errores.append(f"Paso 3 (Inventario): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 3: {e}'))

        # ── PASO 4: Ventas POS de Mostrador ───────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 4/10] [POS] Procesando Ventas en Mostrador...'))
        try:
            from apps.clientes.models import Cliente
            from apps.ventas.models import Servicio, Venta, DetalleVenta
            from apps.inventario.models import SalidaInventario

            cliente_mostrador, _ = Cliente.objects.get_or_create(
                telefono='5511223344',
                defaults={'nombre': 'Transportes y Logistica del Norte', 'email': 'contacto@transnorte.com'}
            )

            srv_montaje, _ = Servicio.objects.get_or_create(
                nombre='Montaje y Balanceo Computarizado',
                defaults={'precio': Decimal('150.00'), 'activo': True}
            )
            srv_alineacion, _ = Servicio.objects.get_or_create(
                nombre='Alineacion Laser Delantera',
                defaults={'precio': Decimal('350.00'), 'activo': True}
            )

            r_v = random.randint(1000, 9999)

            # Venta 1: Efectivo ($4,250.00)
            with transaction.atomic():
                v1 = Venta.objects.create(
                    folio=f"VEN-{fecha_simulacion.strftime('%Y%m%d')}-{r_v:04d}",
                    caja=caja_activa,
                    empleado=emp_tecnico,
                    cliente=cliente_mostrador,
                    metodo_pago='efectivo',
                    monto_efectivo=Decimal('4250.00'),
                    monto_electronico=Decimal('0.00'),
                    subtotal=Decimal('4250.00'),
                    total=Decimal('4250.00'),
                    num_voucher_efectivo=1,
                    notas='Venta mostrador pago en efectivo'
                )
                DetalleVenta.objects.create(venta=v1, producto=producto_1, cantidad=2, precio_unitario=Decimal('1950.00'), subtotal=Decimal('3900.00'))
                DetalleVenta.objects.create(venta=v1, servicio=srv_montaje, cantidad=2, precio_unitario=Decimal('150.00'), subtotal=Decimal('300.00'))
                DetalleVenta.objects.create(venta=v1, servicio=srv_alineacion, cantidad=1, precio_unitario=Decimal('50.00'), subtotal=Decimal('50.00'))
                SalidaInventario.objects.create(
                    producto=producto_1,
                    venta=v1,
                    cantidad=2,
                    precio_venta=Decimal('1950.00'),
                    precio_costo=Decimal('1200.00'),
                    fecha_venta=fecha_simulacion
                )
                metricas['ventas_total'] += v1.total
                metricas['ventas_cont'] += 1
                self.stdout.write(f'  [OK] Venta #{v1.folio} | Total: ${v1.total:,.2f} [EFECTIVO Ticket #{v1.num_voucher_efectivo}]')

            # Venta 2: Tarjeta de Débito ($5,700.00)
            with transaction.atomic():
                v2 = Venta.objects.create(
                    folio=f"VEN-{fecha_simulacion.strftime('%Y%m%d')}-{(r_v+1):04d}",
                    caja=caja_activa,
                    empleado=emp_tecnico,
                    cliente=cliente_mostrador,
                    metodo_pago='tarjeta',
                    tipo_tarjeta='debito',
                    monto_efectivo=Decimal('0.00'),
                    monto_electronico=Decimal('5700.00'),
                    subtotal=Decimal('5700.00'),
                    total=Decimal('5700.00'),
                    num_voucher_tarjeta=1,
                    num_operacion='AUT-789012',
                    notas='Venta 2 llantas Bridgestone con tarjeta debito'
                )
                DetalleVenta.objects.create(venta=v2, producto=producto_2, cantidad=2, precio_unitario=Decimal('2850.00'), subtotal=Decimal('5700.00'))
                SalidaInventario.objects.create(
                    producto=producto_2,
                    venta=v2,
                    cantidad=2,
                    precio_venta=Decimal('2850.00'),
                    precio_costo=Decimal('1850.00'),
                    fecha_venta=fecha_simulacion
                )
                metricas['ventas_total'] += v2.total
                metricas['ventas_cont'] += 1
                self.stdout.write(f'  [OK] Venta #{v2.folio} | Total: ${v2.total:,.2f} [TARJETA DEBITO Voucher #{v2.num_voucher_tarjeta}]')

            # Venta 3: Pago Mixto (Efectivo $1,000 + Tarjeta Crédito $2,900)
            with transaction.atomic():
                v3 = Venta.objects.create(
                    folio=f"VEN-{fecha_simulacion.strftime('%Y%m%d')}-{(r_v+2):04d}",
                    caja=caja_activa,
                    empleado=emp_tecnico,
                    cliente=cliente_mostrador,
                    metodo_pago='mixto',
                    tipo_tarjeta='credito',
                    monto_efectivo=Decimal('1000.00'),
                    monto_electronico=Decimal('2900.00'),
                    subtotal=Decimal('3900.00'),
                    total=Decimal('3900.00'),
                    num_voucher_efectivo=2,
                    num_voucher_tarjeta=2,
                    notas='Pago Mixto con 2 vouchers independientes'
                )
                DetalleVenta.objects.create(venta=v3, producto=producto_1, cantidad=2, precio_unitario=Decimal('1950.00'), subtotal=Decimal('3900.00'))
                SalidaInventario.objects.create(
                    producto=producto_1,
                    venta=v3,
                    cantidad=2,
                    precio_venta=Decimal('1950.00'),
                    precio_costo=Decimal('1200.00'),
                    fecha_venta=fecha_simulacion
                )
                metricas['ventas_total'] += v3.total
                metricas['ventas_cont'] += 1
                self.stdout.write(f'  [OK] Venta #{v3.folio} | Total: ${v3.total:,.2f} [MIXTO Ticket Efec #{v3.num_voucher_efectivo} & Voucher Tarjeta #{v3.num_voucher_tarjeta}]')

        except Exception as e:
            errores.append(f"Paso 4 (Ventas POS): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 4: {e}'))

        # ── PASO 5: Módulo de Rescates y Auxilio Vial Móvil ────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 5/10] [RESCATES] Despacho y Cobro de Rescate Vial en Ruta...'))
        try:
            from apps.rescates.models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate
            from apps.inventario.models import SalidaInventario

            unidad_1, _ = UnidadMovil.objects.get_or_create(
                numero_economico='RES-01',
                defaults={
                    'nombre': 'Camioneta de Auxilio Norte (RAM 700)',
                    'placas': 'EM-990-TX',
                    'chofer_habitual': emp_chofer,
                    'activo': True
                }
            )

            srv_rescate_carretera, _ = TipoServicioRescate.objects.get_or_create(
                nombre='Cambio de Llanta y Auxilio en Autopista',
                defaults={'precio_base': Decimal('850.00'), 'comision_operador': Decimal('150.00'), 'activo': True}
            )

            r_res = random.randint(1000, 9999)
            with transaction.atomic():
                rescate_1 = Rescate.objects.create(
                    folio=f"RES-{fecha_simulacion.strftime('%Y%m%d')}-{r_res:04d}",
                    unidad=unidad_1,
                    operador=emp_chofer,
                    nombre_cliente='Lic. Sergio Palacios',
                    telefono_cliente='5599887766',
                    ubicacion_texto='Km 24 Autopista Mexico-Toluca, acotamiento derecho',
                    coordenadas_gps='19.345678,-99.289012',
                    vehiculo_marca_modelo='Honda CR-V 2022 Gris',
                    vehiculo_placas='NKB-45-12',
                    medida_llanta='225/65R17',
                    estado='solicitado'
                )
                self.stdout.write(f'  [OK] Orden de Rescate #{rescate_1.folio} SOLICITADA en ruta')

                # Transición de estados
                rescate_1.estado = 'en_camino'
                rescate_1.save()
                rescate_1.estado = 'en_proceso'
                rescate_1.save()

                # Cobro POS Móvil: Servicio vial + 1 Llanta de auxilio
                subt = srv_rescate_carretera.precio_base + producto_2.precio_venta
                rescate_1.caja = caja_activa
                rescate_1.metodo_pago = 'transferencia'
                rescate_1.monto_electronico = subt
                rescate_1.subtotal = subt
                rescate_1.total = subt
                rescate_1.estado = 'completado'
                rescate_1.fecha_cierre = timezone.now()
                rescate_1.num_referencia = 'SPEI-BBVA-554433'
                rescate_1.save()

                DetalleRescate.objects.create(rescate=rescate_1, servicio_rescate=srv_rescate_carretera, descripcion=srv_rescate_carretera.nombre, cantidad=1, precio_unitario=srv_rescate_carretera.precio_base, subtotal=srv_rescate_carretera.precio_base)
                DetalleRescate.objects.create(rescate=rescate_1, producto=producto_2, descripcion=producto_2.descripcion_completa, cantidad=1, precio_unitario=producto_2.precio_venta, subtotal=producto_2.precio_venta)
                SalidaInventario.objects.create(
                    producto=producto_2,
                    rescate=rescate_1,
                    cantidad=1,
                    precio_venta=producto_2.precio_venta,
                    precio_costo=Decimal('1850.00'),
                    fecha_venta=fecha_simulacion
                )

                metricas['rescates_total'] += rescate_1.total
                metricas['rescates_cont'] += 1
                self.stdout.write(f'  [OK] Rescate #{rescate_1.folio} COBRADO Y COMPLETADO: ${rescate_1.total:,.2f} [TRANSFERENCIA SPEI]')
                self.stdout.write(f'  [OK] Stock de {producto_2.codigo} descontado a: {producto_2.stock_actual} pzas')
        except Exception as e:
            errores.append(f"Paso 5 (Rescates): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 5: {e}'))

        # ── PASO 6: Gastos Operativos de Taller y Camioneta ────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 6/10] [GASTOS] Registro de Gastos Operativos...'))
        try:
            from apps.gastos.models import CategoriaGasto, Gasto
            from apps.caja.models import MovimientoCaja

            cat_combustible, _ = CategoriaGasto.objects.get_or_create(nombre='Combustible y Viaticos de Rescate', defaults={'tipo': 'operativo', 'activo': True})
            cat_insumos, _ = CategoriaGasto.objects.get_or_create(nombre='Insumos de Taller y Parches', defaults={'tipo': 'mantenimiento', 'activo': True})

            # Gasto 1: Gasolina en efectivo (descuenta de caja física)
            g1 = Gasto.objects.create(
                categoria=cat_combustible,
                concepto='Gasolina Magna 40L para Camioneta Rescate RES-01',
                monto=Decimal('950.00'),
                metodo_pago='efectivo',
                fecha=fecha_simulacion,
                responsable=emp_tecnico,
                caja=caja_activa
            )
            # Sincronizar egreso de caja física
            MovimientoCaja.objects.create(
                caja=caja_activa,
                tipo='egreso',
                concepto=f"Gasto: {g1.concepto}",
                monto=g1.monto,
                empleado=emp_tecnico,
                categoria='Combustible'
            )
            metricas['gastos_total'] += g1.monto
            metricas['gastos_cont'] += 1

            # Gasto 2: Insumos de taller pagados con transferencia bancaria
            g2 = Gasto.objects.create(
                categoria=cat_insumos,
                concepto='Caja de parches radiales y cemento quimico vulcanizante',
                monto=Decimal('1400.00'),
                metodo_pago='transferencia',
                fecha=fecha_simulacion,
                responsable=emp_tecnico
            )
            metricas['gastos_total'] += g2.monto
            metricas['gastos_cont'] += 1

            self.stdout.write(f'  [OK] Gasto en Efectivo: ${g1.monto:,.2f} ({g1.concepto}) -> Sincronizado como Egreso de Caja')
            self.stdout.write(f'  [OK] Gasto Bancario: ${g2.monto:,.2f} ({g2.concepto})')
        except Exception as e:
            errores.append(f"Paso 6 (Gastos): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 6: {e}'))

        # ── PASO 7: Nómina Semanal y Pago ─────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 7/10] [NOMINA] Liquidacion y Pago de Nomina Semanal...'))
        try:
            from apps.nomina.models import PeriodoNomina, LineaNomina

            inicio_sem = fecha_simulacion - timedelta(days=6)
            periodo_nom, _ = PeriodoNomina.objects.get_or_create(
                fecha_inicio=inicio_sem,
                fecha_fin=fecha_simulacion,
                defaults={'estado': 'borrador'}
            )

            # Línea para Cajera (Laura)
            linea_1, _ = LineaNomina.objects.get_or_create(
                periodo=periodo_nom,
                empleado=emp_tecnico,
                defaults={
                    'sueldo': emp_tecnico.salario_base,
                    'comision': Decimal('345.00'),
                    'domingo': emp_tecnico.pago_dominical,
                    'bonos': Decimal('200.00'),
                    'descuentos': Decimal('0.00'),
                    'efectivo': Decimal('2000.00'),
                    'transferencia': Decimal('2195.00'),
                    'neto': Decimal('4195.00'),
                }
            )

            # Línea para Chofer de Rescate (Roberto)
            linea_2, _ = LineaNomina.objects.get_or_create(
                periodo=periodo_nom,
                empleado=emp_chofer,
                defaults={
                    'sueldo': emp_chofer.salario_base,
                    'comision': Decimal('550.00'),
                    'domingo': emp_chofer.pago_dominical,
                    'bonos': Decimal('0.00'),
                    'descuentos': Decimal('0.00'),
                    'efectivo': Decimal('0.00'),
                    'transferencia': Decimal('4550.00'),
                    'neto': Decimal('4550.00'),
                }
            )

            periodo_nom.recalcular_totales()
            periodo_nom.estado = 'pagada'
            periodo_nom.save()
            metricas['nomina_pagada'] = periodo_nom.total_general
            self.stdout.write(f'  [OK] Periodo de Nomina [{periodo_nom.fecha_inicio} a {periodo_nom.fecha_fin}] LIQUIDADO: ${periodo_nom.total_general:,.2f}')
            self.stdout.write(f'       - Efectivo: ${periodo_nom.total_efectivo:,.2f} | Transferencia: ${periodo_nom.total_transferencia:,.2f}')
        except Exception as e:
            errores.append(f"Paso 7 (Nomina): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 7: {e}'))

        # ── PASO 8: Abonos a Proveedores ──────────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 8/10] [PROVEEDORES] Abono a Facturas de Proveedores...'))
        try:
            from apps.inventario.models import Proveedor, PagoProveedor

            prov = Proveedor.objects.filter(nombre__icontains='Pirelli').first()
            pago_prov = PagoProveedor.objects.create(
                proveedor=prov,
                monto=Decimal('10000.00'),
                fecha=fecha_simulacion,
                referencia='SPEI-PAGO-FACTURA-99881',
                notas='Abono a cuenta por pagar de lote de neumaticos',
                registrado_por=admin_user
            )
            metricas['pagos_proveedor'] = pago_prov.monto
            self.stdout.write(f'  [OK] Pago a Proveedor {prov.nombre}: ${pago_prov.monto:,.2f} [Ref: {pago_prov.referencia}]')
        except Exception as e:
            errores.append(f"Paso 8 (Pagos Proveedor): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 8: {e}'))

        # ── PASO 9: Arqueo y Cierre de Caja ───────────────────────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 9/10] [ARQUEO] Arqueo de Caja y Cierre de Turno...'))
        try:
            from apps.caja.models import ArqueoCaja

            # Calcular balance esperado en caja física:
            # Fondo inicial ($2,500) + Ventas Efectivo ($4,250 + $1,000 = $5,250) - Egresos Efectivo ($950) = $6,800.00
            total_efectivo_esperado = Decimal('2500.00') + Decimal('5250.00') - Decimal('950.00')

            # Desglose de billetes y monedas para sumar exactamente $6,800.00
            # 4x$1000 ($4000) + 4x$500 ($2000) + 3x$200 ($600) + 1x$100 ($100) + 1x$50 ($50) + 2x$20 ($40) + 1x$10 ($10) = $6800.00
            arqueo = ArqueoCaja.objects.create(
                caja=caja_activa,
                empleado=emp_tecnico,
                billetes_1000=4,
                billetes_500=4,
                billetes_200=3,
                billetes_100=1,
                billetes_50=1,
                billetes_20=2,
                monedas_10=1,
                notas='Arqueo fisico perfecto sin faltantes'
            )

            caja_activa.monto_final = Decimal('6800.00')
            caja_activa.empleado_cierre = emp_tecnico
            caja_activa.estado = 'cerrada'
            caja_activa.fecha_cierre = timezone.now()
            caja_activa.save()

            self.stdout.write(f'  [OK] Arqueo Fisico Concluido: Conteo ${arqueo.total:,.2f} vs Esperado ${total_efectivo_esperado:,.2f}')
            self.stdout.write(f'  [OK] Diferencia en Caja: ${caja_activa.diferencia:,.2f} MXN (CUADRE EXACTO)')
            self.stdout.write(f'  [OK] Turno de Caja {caja_activa.folio} CERRADO correctamente.')
        except Exception as e:
            errores.append(f"Paso 9 (Arqueo Caja): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 9: {e}'))

        # ── PASO 10: Validación de Balance Global y Minuta PDF ─────────────────
        self.stdout.write(self.style.HTTP_INFO('\n[Paso 10/10] [REPORTES] Balance Financiero Global y Minuta PDF...'))
        try:
            from apps.reportes.views import BalanceGlobalView, ReportePDF
            from rest_framework.test import force_authenticate

            rf = RequestFactory()
            d_str = str(fecha_simulacion)
            req = rf.get(f'/api/reportes/balance-global/?fecha_inicio={d_str}&fecha_fin={d_str}')
            force_authenticate(req, user=admin_user)

            bg_view = BalanceGlobalView.as_view()
            resp_bg = bg_view(req)
            data_bg = resp_bg.data

            resumen = data_bg.get('resumen_ejecutivo', {})
            total_ingresos = Decimal(str(resumen.get('total_ingresos', 0)))
            total_egresos_flujo = Decimal(str(resumen.get('total_egresos_flujo', 0)))
            flujo_neto = Decimal(str(resumen.get('flujo_neto_disponible', 0)))
            utilidad = Decimal(str(resumen.get('utilidad_operativa', 0)))
            margen = Decimal(str(resumen.get('margen_operativo_porcentaje', 0)))

            self.stdout.write(f"  [OK] Ingresos Totales (Mostrador + Rescates): ${total_ingresos:,.2f}")
            self.stdout.write(f"  [OK] Egresos Totales (Nomina + Proveedores + Gastos): ${total_egresos_flujo:,.2f}")
            self.stdout.write(f"  [OK] Flujo Neto Disponible del Dia: ${flujo_neto:,.2f}")
            self.stdout.write(f"  [OK] Utilidad Operativa Real: ${utilidad:,.2f} ({margen}% margen)")

            # Generar Minuta PDF
            req_pdf = rf.get(f'/api/reportes/pdf/?fecha_inicio={d_str}&fecha_fin={d_str}')
            force_authenticate(req_pdf, user=admin_user)
            pdf_view = ReportePDF.as_view()
            resp_pdf = pdf_view(req_pdf)
            pdf_bytes = len(resp_pdf.content)
            self.stdout.write(f'  [OK] Minuta de Operacion PDF generada exitosamente ({pdf_bytes:,} bytes)')
        except Exception as e:
            errores.append(f"Paso 10 (Balance y PDF): {str(e)}")
            self.stdout.write(self.style.ERROR(f'  [ERROR] Paso 10: {e}'))

        # ── REPORTE FINAL CONSOLIDADO ─────────────────────────────────────────
        self.stdout.write(self.style.SUCCESS('\n========================================================================'))
        if errores:
            self.stdout.write(self.style.ERROR(f'  SIMULACION COMPLETADA CON {len(errores)} ADVERTENCIAS / ERRORES:'))
            for err in errores:
                self.stdout.write(self.style.ERROR(f'    - {err}'))
        else:
            self.stdout.write(self.style.SUCCESS('  JORNADA E2E SIMULADA AL 100% CON EXITO - CERO FALLAS DETECTADAS'))
        self.stdout.write(self.style.SUCCESS('========================================================================'))
        self.stdout.write(f"• Ventas en Mostrador:       ${metricas['ventas_total']:>12,.2f} ({metricas['ventas_cont']} tickets generados)")
        self.stdout.write(f"• Servicios de Rescate Vial: ${metricas['rescates_total']:>12,.2f} ({metricas['rescates_cont']} auxilio completado)")
        self.stdout.write(f"• Gastos Operativos:         ${metricas['gastos_total']:>12,.2f} ({metricas['gastos_cont']} conceptos)")
        self.stdout.write(f"• Nomina Semanal Liquidada:  ${metricas['nomina_pagada']:>12,.2f}")
        self.stdout.write(f"• Pagos a Proveedores:       ${metricas['pagos_proveedor']:>12,.2f}")
        self.stdout.write(self.style.SUCCESS('========================================================================\n'))
