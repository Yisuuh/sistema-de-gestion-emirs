import urllib.parse
from decimal import Decimal
from django.db import transaction, models
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from .models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate
from .serializers import (
    UnidadMovilSerializer,
    TipoServicioRescateSerializer,
    RescateSerializer,
    RescateListSerializer,
    DetalleRescateSerializer,
)
from apps.inventario.models import SalidaInventario, EntradaInventario
from apps.caja.models import Caja


class UnidadMovilViewSet(viewsets.ModelViewSet):
    """
    CRUD de unidades móviles para auxilio vial
    """
    queryset = UnidadMovil.objects.select_related('chofer_habitual').all()
    serializer_class = UnidadMovilSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['numero_economico', 'nombre', 'placas', 'modelo']
    ordering_fields = ['numero_economico', 'nombre', 'created_at']
    ordering = ['numero_economico']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return queryset

        solo_activos = self.request.query_params.get('activos')
        if solo_activos and solo_activos.lower() == 'true':
            queryset = queryset.filter(activo=True)
        return queryset


class TipoServicioRescateViewSet(viewsets.ModelViewSet):
    """
    Catálogo de servicios de rescate
    """
    queryset = TipoServicioRescate.objects.all()
    serializer_class = TipoServicioRescateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nombre', 'descripcion']
    ordering_fields = ['nombre', 'precio_base']
    ordering = ['nombre']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in ('retrieve', 'update', 'partial_update', 'destroy'):
            return queryset

        solo_activos = self.request.query_params.get('activos')
        if solo_activos and solo_activos.lower() == 'true':
            queryset = queryset.filter(activo=True)
        return queryset


class RescateViewSet(viewsets.ModelViewSet):
    """
    Gestión operativa de rescates viales
    """
    queryset = Rescate.objects.select_related(
        'unidad', 'operador', 'cliente', 'caja'
    ).prefetch_related('detalles', 'detalles__producto', 'detalles__servicio_rescate').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'folio', 'nombre_cliente', 'telefono_cliente',
        'vehiculo_placas', 'vehiculo_marca_modelo', 'ubicacion_texto'
    ]
    ordering_fields = ['fecha_solicitud', 'total', 'folio', 'estado']
    ordering = ['-fecha_solicitud']

    def get_serializer_class(self):
        if self.action == 'list':
            return RescateListSerializer
        return RescateSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        estado = self.request.query_params.get('estado')
        if estado:
            queryset = queryset.filter(estado=estado)

        unidad_id = self.request.query_params.get('unidad')
        if unidad_id:
            queryset = queryset.filter(unidad_id=unidad_id)

        operador_id = self.request.query_params.get('operador')
        if operador_id:
            queryset = queryset.filter(operador_id=operador_id)

        cliente_id = self.request.query_params.get('cliente')
        if cliente_id:
            queryset = queryset.filter(cliente_id=cliente_id)

        caja_id = self.request.query_params.get('caja')
        if caja_id:
            queryset = queryset.filter(caja_id=caja_id)

        metodo_pago = self.request.query_params.get('metodo_pago')
        if metodo_pago:
            queryset = queryset.filter(metodo_pago=metodo_pago)

        fecha_inicio = self.request.query_params.get('fecha_inicio')
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_inicio:
            queryset = queryset.filter(fecha_solicitud__date__gte=fecha_inicio)
        if fecha_fin:
            queryset = queryset.filter(fecha_solicitud__date__lte=fecha_fin)

        return queryset

    @action(detail=True, methods=['post'], url_path='cambiar-estado')
    def cambiar_estado(self, request, pk=None):
        """
        Permite avanzar el rescate entre estados: solicitado -> en_camino -> en_proceso -> cancelado
        """
        rescate = self.get_object()
        nuevo_estado = request.data.get('estado')

        validos = [e[0] for e in Rescate.ESTADO_CHOICES]
        if nuevo_estado not in validos:
            return Response(
                {"error": f"Estado inválido. Opciones: {', '.join(validos)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if rescate.estado == 'completado' and nuevo_estado != 'completado':
            return Response(
                {"error": "No se puede cambiar el estado de un rescate ya completado y cobrado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        rescate.estado = nuevo_estado
        if nuevo_estado == 'completado' and not rescate.fecha_cierre:
            rescate.fecha_cierre = timezone.now()

        rescate.save(update_fields=['estado', 'fecha_cierre', 'updated_at'])
        serializer = RescateSerializer(rescate)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='cobrar')
    def cobrar(self, request, pk=None):
        """
        Cobra y finaliza el rescate:
        1. Valida método y montos de pago
        2. Registra salidas de inventario para productos usados (validando existencias y costo PEPS)
        3. Asocia la caja abierta activa
        4. Fija estado='completado' y fecha_cierre=now()
        """
        rescate = self.get_object()

        if rescate.estado == 'completado':
            return Response(
                {"error": "Este rescate ya fue cobrado previamente."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if rescate.estado == 'cancelado':
            return Response(
                {"error": "No se puede cobrar un rescate cancelado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar caja abierta activa
        caja_id = request.data.get('caja_id') or request.data.get('caja')
        caja_destino = None
        if caja_id:
            try:
                caja_destino = Caja.objects.get(pk=caja_id)
                if caja_destino.estado != 'abierta':
                    return Response(
                        {"error": "No existe ninguna caja abierta activa para recibir el cobro del rescate."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Caja.DoesNotExist:
                return Response(
                    {"error": "No existe ninguna caja abierta activa para recibir el cobro del rescate."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            if rescate.caja and rescate.caja.estado == 'abierta':
                caja_destino = rescate.caja
            else:
                caja_destino = Caja.objects.filter(estado='abierta').first()

        if not caja_destino or caja_destino.estado != 'abierta':
            return Response(
                {"error": "No existe ninguna caja abierta activa para recibir el cobro del rescate."},
                status=status.HTTP_400_BAD_REQUEST
            )

        metodo_pago = request.data.get('metodo_pago', rescate.metodo_pago)
        tipo_tarjeta = request.data.get('tipo_tarjeta', rescate.tipo_tarjeta)
        monto_efectivo = Decimal(str(request.data.get('monto_efectivo', rescate.monto_efectivo or 0)))
        monto_electronico = Decimal(str(request.data.get('monto_electronico', rescate.monto_electronico or 0)))
        num_operacion = request.data.get('num_operacion', rescate.num_operacion)
        num_referencia = request.data.get('num_referencia', rescate.num_referencia)
        descuento = Decimal(str(request.data.get('descuento', rescate.descuento or 0)))
        notas = request.data.get('notas', rescate.notas)

        # Validación de montos según método de pago
        if metodo_pago == 'efectivo' and monto_efectivo <= 0:
            return Response(
                {"error": "El monto en efectivo debe ser mayor a 0 para pago en efectivo."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if metodo_pago in ['tarjeta', 'transferencia'] and monto_electronico <= 0:
            return Response(
                {"error": "El monto electrónico debe ser mayor a 0 para este método de pago."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if metodo_pago == 'mixto' and (monto_efectivo <= 0 or monto_electronico <= 0):
            return Response(
                {"error": "Para pago mixto, se requiere monto en efectivo y monto electrónico mayores a 0."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            rescate.caja = caja_destino

            # Actualizar detalles si vienen en el payload
            detalles_payload = request.data.get('detalles')
            if detalles_payload is not None:
                # Revertir salidas previas si existieran
                SalidaInventario.objects.filter(rescate=rescate).delete()
                rescate.detalles.all().delete()

                total_calc = Decimal('0.00')
                for det in detalles_payload:
                    cant = int(det.get('cantidad', 1) or 1)
                    pu = Decimal(str(det.get('precio_unitario', 0)))
                    subt = Decimal(str(cant)) * pu
                    serv_id = det.get('servicio_rescate') or det.get('servicio') or det.get('servicio_rescate_id') or det.get('servicio_id')
                    prod_id = det.get('producto') or det.get('producto_id')
                    det_obj = DetalleRescate.objects.create(
                        rescate=rescate,
                        servicio_rescate_id=serv_id,
                        producto_id=prod_id,
                        descripcion=det.get('descripcion') or 'Servicio de Rescate',
                        cantidad=cant,
                        precio_unitario=pu,
                        subtotal=subt
                    )
                    total_calc += subt

                rescate.subtotal = total_calc
                rescate.total = max(Decimal('0.00'), total_calc - descuento)

            # Verificar salidas de inventario para productos
            for det in rescate.detalles.all():
                if det.producto:
                    # Verificar si ya tiene salida registrada
                    salida_existente = SalidaInventario.objects.filter(rescate=rescate, producto=det.producto).exists()
                    if not salida_existente:
                        stock_disp = det.producto.stock_actual
                        if stock_disp < det.cantidad:
                            raise ValidationError(
                                f"Stock insuficiente para {det.producto.descripcion_completa}. "
                                f"Disponible: {stock_disp}, Solicitado: {det.cantidad}"
                            )

                        entradas = EntradaInventario.objects.filter(
                            producto=det.producto,
                            en_inventario=True
                        ).order_by('fecha_compra')

                        if entradas.exists():
                            precio_costo = entradas.first().precio_compra
                        else:
                            precio_costo = det.precio_unitario * Decimal('0.70')

                        SalidaInventario.objects.create(
                            producto=det.producto,
                            rescate=rescate,
                            cantidad=det.cantidad,
                            precio_venta=det.precio_unitario,
                            precio_costo=precio_costo,
                            fecha_venta=timezone.localdate()
                        )

            rescate.metodo_pago = metodo_pago
            rescate.tipo_tarjeta = tipo_tarjeta
            rescate.monto_efectivo = monto_efectivo
            rescate.monto_electronico = monto_electronico
            rescate.num_operacion = num_operacion or ''
            rescate.num_referencia = num_referencia or ''
            rescate.descuento = descuento
            rescate.notas = notas or ''
            rescate.estado = 'completado'
            rescate.fecha_cierre = timezone.now()
            rescate.save()

            if rescate.vehiculo:
                from datetime import timedelta
                hoy = timezone.localdate()
                rescate.vehiculo.fecha_ultimo_servicio = hoy
                rescate.vehiculo.fecha_proximo_servicio = hoy + timedelta(days=180)
                rescate.vehiculo.save(update_fields=['fecha_ultimo_servicio', 'fecha_proximo_servicio'])

        rescate.refresh_from_db()
        return Response({
            "mensaje": "Rescate cobrado exitosamente",
            "rescate": RescateSerializer(rescate).data
        })

    @action(detail=True, methods=['get'], url_path='ticket')
    def ticket(self, request, pk=None):
        """
        Retorna datos estructurados para impresión de ticket térmico móvil y formato para WhatsApp
        """
        rescate = self.get_object()

        unidad_str = f"{rescate.unidad.numero_economico} - {rescate.unidad.nombre}" if rescate.unidad else "No asignada"
        operador_str = rescate.operador.nombre_completo if rescate.operador else "No asignado"
        fecha_str = rescate.fecha_solicitud.strftime('%d/%m/%Y %I:%M %p')
        cierre_str = rescate.fecha_cierre.strftime('%d/%m/%Y %I:%M %p') if rescate.fecha_cierre else "En atención"

        detalles_data = []
        lines_wa = [
            f"🚗 *CENTRO LLANTERO EMIRS - AUXILIO VIAL*",
            f"📄 *Folio:* {rescate.folio}",
            f"📅 *Fecha:* {fecha_str}",
            f"👤 *Cliente:* {rescate.nombre_cliente}",
            f"📍 *Ubicación:* {rescate.ubicacion_texto}",
            f"🚙 *Vehículo:* {rescate.vehiculo_marca_modelo} ({rescate.vehiculo_placas})",
            f"🛞 *Medida llanta:* {rescate.medida_llanta or 'N/A'}",
            f"🛠️ *Operador:* {operador_str} ({unidad_str})",
            f"━━━━━━━━━━━━━━━━━━━━",
            f"*CONCEPTOS / SERVICIOS:*"
        ]

        for det in rescate.detalles.all():
            detalles_data.append({
                'id': det.id,
                'descripcion': det.descripcion,
                'cantidad': det.cantidad,
                'precio_unitario': float(det.precio_unitario),
                'subtotal': float(det.subtotal),
            })
            lines_wa.append(f"• {det.cantidad}x {det.descripcion} - ${float(det.subtotal):,.2f}")

        lines_wa.append(f"━━━━━━━━━━━━━━━━━━━━")
        lines_wa.append(f"💵 *Subtotal:* ${float(rescate.subtotal):,.2f}")
        if rescate.descuento > 0:
            lines_wa.append(f"🏷️ *Descuento:* ${float(rescate.descuento):,.2f}")
        lines_wa.append(f"💰 *TOTAL:* ${float(rescate.total):,.2f}")
        lines_wa.append(f"💳 *Pago:* {rescate.get_metodo_pago_display().upper()}")
        if rescate.notas:
            lines_wa.append(f"📝 *Notas:* {rescate.notas}")
        lines_wa.append(f"━━━━━━━━━━━━━━━━━━━━")
        lines_wa.append(f"¡Gracias por su preferencia! 🛞 Centro Llantero EmirS")

        raw_whatsapp_text = "\n".join(lines_wa)
        whatsapp_url = f"https://api.whatsapp.com/send?phone={urllib.parse.quote(rescate.telefono_cliente.replace(' ', '').replace('-', ''))}&text={urllib.parse.quote(raw_whatsapp_text)}"

        payload = {
            'empresa': {
                'nombre': 'Centro Llantero EmirS',
                'lema': 'Venta de llantas y Auxilio Vial Móvil',
                'telefono': '999 371 8502',
                'direccion': 'Calle 42 #282 por 45, Fracc. Francisco de Montejo, Mérida Yuc.'
            },
            'rescate': {
                'id': rescate.id,
                'folio': rescate.folio,
                'fecha_solicitud': fecha_str,
                'fecha_cierre': cierre_str,
                'estado': rescate.estado,
                'estado_display': rescate.get_estado_display(),
                'unidad': unidad_str,
                'operador': operador_str,
                'cliente': rescate.nombre_cliente,
                'telefono': rescate.telefono_cliente,
                'vehiculo': rescate.vehiculo_marca_modelo or 'N/A',
                'placas': rescate.vehiculo_placas or 'N/A',
                'medida_llanta': rescate.medida_llanta or 'N/A',
                'ubicacion': rescate.ubicacion_texto,
                'coordenadas_gps': rescate.coordenadas_gps or '',
                'metodo_pago': rescate.metodo_pago,
                'metodo_pago_display': rescate.get_metodo_pago_display(),
                'tipo_tarjeta': rescate.tipo_tarjeta or '',
                'monto_efectivo': float(rescate.monto_efectivo),
                'monto_electronico': float(rescate.monto_electronico),
                'num_operacion': rescate.num_operacion or '',
                'num_referencia': rescate.num_referencia or '',
                'subtotal': float(rescate.subtotal),
                'descuento': float(rescate.descuento),
                'total': float(rescate.total),
                'notas': rescate.notas or ''
            },
            'detalles': detalles_data,
            'whatsapp_text': raw_whatsapp_text,
            'whatsapp_url': whatsapp_url
        }

        return Response(payload)

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """
        Genera el comprobante oficial de auxilio vial / ticket de rescate en formato PDF
        """
        from django.http import HttpResponse
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image
        )
        import io, os

        rescate = self.get_object()
        buf = io.BytesIO()

        # Ticket formato estándar térmico 80mm
        doc = SimpleDocTemplate(
            buf,
            pagesize=(80 * mm, 240 * mm),
            leftMargin=4 * mm,
            rightMargin=4 * mm,
            topMargin=5 * mm,
            bottomMargin=5 * mm,
        )

        styles = getSampleStyleSheet()
        normal = styles['Normal']

        title_style = ParagraphStyle(
            'TicketTitle',
            parent=normal,
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=13,
            alignment=1,
            textColor=colors.HexColor('#df000a')
        )
        subtitle_style = ParagraphStyle(
            'TicketSubtitle',
            parent=normal,
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            alignment=1,
            textColor=colors.HexColor('#111827')
        )
        text_center = ParagraphStyle(
            'TicketCenter',
            parent=normal,
            fontName='Helvetica',
            fontSize=7,
            leading=9,
            alignment=1,
            textColor=colors.HexColor('#4b5563')
        )
        folio_style = ParagraphStyle(
            'TicketFolio',
            parent=normal,
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=12,
            alignment=1,
            textColor=colors.HexColor('#111827')
        )
        item_desc = ParagraphStyle(
            'ItemDesc',
            parent=normal,
            fontName='Helvetica',
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor('#111827')
        )
        item_num = ParagraphStyle(
            'ItemNum',
            parent=normal,
            fontName='Helvetica-Bold',
            fontSize=7,
            leading=8.5,
            alignment=2,
            textColor=colors.HexColor('#111827')
        )

        story = []

        # Logo opcional si existe
        logo_path = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', '..', '..', 'frontend', 'public', 'images', 'logo_hd.png'
        ))
        if os.path.exists(logo_path):
            try:
                story.append(Image(logo_path, width=38*mm, height=13*mm))
                story.append(Spacer(1, 2*mm))
            except Exception:
                pass

        story.append(Paragraph("CENTRO LLANTERO EMIRS", title_style))
        story.append(Paragraph("Servicio de Rescate & Auxilio Vial 24/7", subtitle_style))
        story.append(Paragraph("Calle 42 #282 por 45, Fracc. Fco. de Montejo", text_center))
        story.append(Paragraph("Mérida, Yuc. | Tel: 999 371 8502", text_center))
        story.append(Spacer(1, 2*mm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#df000a'), spaceAfter=2*mm))

        story.append(Paragraph("<b>COMPROBANTE DE AUXILIO VIAL</b>", subtitle_style))
        story.append(Paragraph(f"<b>{rescate.folio}</b>", folio_style))
        fecha_str = rescate.fecha_solicitud.strftime('%d/%m/%Y %I:%M %p')
        story.append(Paragraph(fecha_str, text_center))
        story.append(Spacer(1, 2*mm))

        # Datos del cliente y despacho
        info_data = [
            [Paragraph("<b>Cliente:</b>", item_desc), Paragraph(rescate.nombre_cliente or "Cliente General", item_desc)],
            [Paragraph("<b>Teléfono:</b>", item_desc), Paragraph(rescate.telefono_cliente or "—", item_desc)],
            [Paragraph("<b>Vehículo:</b>", item_desc), Paragraph(f"{rescate.vehiculo_marca_modelo or 'N/A'}", item_desc)],
        ]
        if rescate.medida_llanta:
            info_data.append([Paragraph("<b>Medida:</b>", item_desc), Paragraph(f"<font color='#df000a'><b>{rescate.medida_llanta}</b></font>", item_desc)])
        if rescate.unidad:
            info_data.append([Paragraph("<b>Unidad:</b>", item_desc), Paragraph(f"{rescate.unidad.numero_economico} - {rescate.unidad.nombre}", item_desc)])
        if rescate.operador:
            info_data.append([Paragraph("<b>Técnico:</b>", item_desc), Paragraph(rescate.operador.nombre_completo, item_desc)])
        if rescate.ubicacion_texto:
            info_data.append([Paragraph("<b>Ubicación:</b>", item_desc), Paragraph(rescate.ubicacion_texto, item_desc)])

        t_info = Table(info_data, colWidths=[20*mm, 52*mm])
        t_info.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 1),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(t_info)
        story.append(Spacer(1, 2*mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#9ca3af'), spaceAfter=2*mm))

        # Tabla de Detalles
        items_data = [
            [Paragraph("<b>CANT / CONCEPTO</b>", item_desc), Paragraph("<b>IMPORTE</b>", item_num)]
        ]
        for d in rescate.detalles.all():
            items_data.append([
                Paragraph(f"{d.cantidad}x {d.descripcion}", item_desc),
                Paragraph(f"${float(d.subtotal):,.2f}", item_num)
            ])

        t_items = Table(items_data, colWidths=[48*mm, 24*mm])
        t_items.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor('#9ca3af')),
        ]))
        story.append(t_items)
        story.append(Spacer(1, 2*mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#9ca3af'), spaceAfter=2*mm))

        # Totales
        tot_data = [
            [Paragraph("Subtotal:", item_desc), Paragraph(f"${float(rescate.subtotal):,.2f}", item_num)]
        ]
        if rescate.descuento > 0:
            tot_data.append([
                Paragraph("Descuento:", item_desc),
                Paragraph(f"-${float(rescate.descuento):,.2f}", item_num)
            ])
        tot_data.append([
            Paragraph("<b>TOTAL PAGADO:</b>", ParagraphStyle('TotB', parent=item_desc, fontSize=8, fontName='Helvetica-Bold')),
            Paragraph(f"<b>${float(rescate.total):,.2f} MXN</b>", ParagraphStyle('TotN', parent=item_num, fontSize=8, fontName='Helvetica-Bold', textColor=colors.HexColor('#df000a')))
        ])
        tot_data.append([
            Paragraph("Forma de pago:", item_desc),
            Paragraph(f"{rescate.get_metodo_pago_display().upper()}{f' ({rescate.tipo_tarjeta.upper()})' if rescate.tipo_tarjeta else ''}", item_num)
        ])

        t_tot = Table(tot_data, colWidths=[36*mm, 36*mm])
        t_tot.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(t_tot)
        story.append(Spacer(1, 3*mm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#df000a'), spaceAfter=2*mm))

        story.append(Paragraph("<b>¡GRACIAS POR SU PREFERENCIA!</b>", subtitle_style))
        story.append(Paragraph("Seguridad y confianza en su camino", text_center))
        story.append(Paragraph("Centro Llantero EmirS a su servicio", text_center))

        doc.build(story)
        pdf_content = buf.getvalue()
        buf.close()

        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="Ticket_Rescate_{rescate.folio}.pdf"'
        return response
