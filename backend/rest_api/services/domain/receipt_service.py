"""
Receipt/Ticket Generation Service.

Generates printable HTML content for:
- Kitchen tickets (thermal printer compatible)
- Customer receipts with full financial detail
- Daily closing reports
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from html import escape

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from rest_api.models import (
    Branch,
    Check,
    Payment,
    Round,
    RoundItem,
    Table,
    TableSession,
    Product,
)
from rest_api.models.fiscal import FiscalInvoice
from rest_api.models.tenant import Tenant
from shared.config.logging import get_logger
from shared.utils.exceptions import NotFoundError

logger = get_logger(__name__)


# ── HTML Templates ──────────────────────────────────────────────────

_THERMAL_CSS = """
<style>
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 80mm;
    max-width: 80mm;
    padding: 4mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .large { font-size: 16px; }
  .small { font-size: 10px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .double-divider { border-top: 2px solid #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .qty { width: 30px; }
  .price { width: 70px; text-align: right; }
  .item-name { word-wrap: break-word; }
  .notes { font-style: italic; font-size: 10px; padding-left: 30px; }
  @media print {
    body { width: 80mm; }
  }
</style>
"""


def _format_price(cents: int) -> str:
    """Format cents as currency string."""
    return f"${cents / 100:,.2f}"


def _format_datetime(dt: datetime | None) -> str:
    """Format datetime for display."""
    if not dt:
        return ""
    return dt.strftime("%d/%m/%Y %H:%M")


def _format_date(d: date | None) -> str:
    """Format date for display."""
    if not d:
        return ""
    return d.strftime("%d/%m/%Y")


def _wrap_html(title: str, body: str) -> str:
    """Wrap body content in a full HTML document."""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(title)}</title>
  {_THERMAL_CSS}
</head>
<body>
{body}
</body>
</html>"""


class ReceiptService:
    """Generates printable receipts and tickets."""

    def __init__(self, db: Session):
        self._db = db

    # ── Kitchen Ticket ──────────────────────────────────────────────

    def generate_kitchen_ticket(self, round_id: int) -> str:
        """
        Generate a kitchen ticket for a round.

        Returns HTML formatted for thermal printers (58mm/80mm).
        Shows: table code, items with quantities, notes, timestamp, round number.
        """
        round_obj = self._db.scalar(
            select(Round)
            .where(Round.id == round_id)
            .options(selectinload(Round.items))
        )
        if not round_obj:
            raise NotFoundError("Ronda", round_id)

        # Get table info via session
        session = self._db.scalar(
            select(TableSession).where(TableSession.id == round_obj.table_session_id)
        )
        table_code = "?"
        if session:
            table = self._db.scalar(
                select(Table).where(Table.id == session.table_id)
            )
            if table:
                table_code = table.code

        # Build items HTML
        items_html = ""
        for item in round_obj.items:
            name = escape(item.product_name or f"Producto #{item.product_id}")
            items_html += f"""
            <tr>
              <td class="qty bold">{item.qty}x</td>
              <td class="item-name">{name}</td>
            </tr>"""
            if item.notes:
                items_html += f"""
            <tr>
              <td></td>
              <td class="notes">** {escape(item.notes)}</td>
            </tr>"""

        timestamp = _format_datetime(round_obj.submitted_at or round_obj.created_at)

        body = f"""
<div class="center large bold">COCINA</div>
<div class="divider"></div>

<div class="center bold large">Mesa {escape(table_code)}</div>
<div class="center">Ronda #{round_obj.round_number}</div>
<div class="center small">{timestamp}</div>

<div class="double-divider"></div>

<table>
  {items_html}
</table>

<div class="double-divider"></div>
<div class="center small">Total items: {sum(i.qty for i in round_obj.items)}</div>
"""

        return _wrap_html(f"Cocina - Mesa {table_code} - R#{round_obj.round_number}", body)

    # ── Customer Receipt ────────────────────────────────────────────

    def generate_customer_receipt(self, check_id: int) -> str:
        """
        Generate a customer receipt for a check.

        Returns HTML with: restaurant name, branch, table, items with prices,
        subtotal, taxes, tips, total, payment method, fiscal info if available.
        """
        check = self._db.scalar(
            select(Check)
            .where(Check.id == check_id, Check.is_active.is_(True))
        )
        if not check:
            raise NotFoundError("Cuenta", check_id)

        # Get branch and tenant
        branch = self._db.scalar(
            select(Branch).where(Branch.id == check.branch_id)
        )
        tenant = self._db.scalar(
            select(Tenant).where(Tenant.id == check.tenant_id)
        ) if check.tenant_id else None

        # Get table info via session
        session = self._db.scalar(
            select(TableSession).where(TableSession.id == check.table_session_id)
        )
        table_code = "?"
        if session:
            table = self._db.scalar(
                select(Table).where(Table.id == session.table_id)
            )
            if table:
                table_code = table.code

        # Get items from all non-canceled rounds
        items_query = self._db.execute(
            select(RoundItem, Round.round_number)
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.table_session_id == check.table_session_id,
                Round.status != "CANCELED",
            )
            .order_by(Round.round_number, RoundItem.id)
        ).all()

        # Build items HTML
        items_html = ""
        for item, round_number in items_query:
            name = escape(item.product_name or f"Producto #{item.product_id}")
            subtotal = item.qty * item.unit_price_cents
            items_html += f"""
            <tr>
              <td class="qty">{item.qty}x</td>
              <td class="item-name">{name}</td>
              <td class="price">{_format_price(subtotal)}</td>
            </tr>"""

        # Get payments
        payments = self._db.execute(
            select(Payment)
            .where(
                Payment.check_id == check_id,
                Payment.status == "APPROVED",
            )
            .order_by(Payment.created_at)
        ).scalars().all()

        payments_html = ""
        for p in payments:
            method = p.manual_method or p.provider or "N/A"
            payments_html += f"""
            <tr>
              <td>{escape(method)}</td>
              <td class="price">{_format_price(p.amount_cents)}</td>
            </tr>"""

        # Check for fiscal invoice
        fiscal_html = ""
        fiscal_invoice = self._db.scalar(
            select(FiscalInvoice).where(
                FiscalInvoice.check_id == check_id,
                FiscalInvoice.is_active.is_(True),
            )
        )
        if fiscal_invoice:
            fiscal_html = f"""
<div class="divider"></div>
<div class="small">
  <div>Comp. Tipo {escape(fiscal_invoice.invoice_type)} Nro: {fiscal_invoice.invoice_number}</div>
  <div>CAE: {escape(str(fiscal_invoice.cae or ""))}</div>
  <div>Vto CAE: {_format_date(fiscal_invoice.cae_expiry)}</div>
</div>"""

        restaurant_name = escape(tenant.name) if tenant else "Restaurante"
        branch_name = escape(branch.name) if branch else ""
        branch_addr = escape(branch.address or "") if branch else ""
        receipt_date = _format_datetime(check.created_at)

        # Subtotal = total_cents (taxes included in price for most AR restaurants)
        subtotal = check.total_cents

        body = f"""
<div class="center bold large">{restaurant_name}</div>
<div class="center">{branch_name}</div>
<div class="center small">{branch_addr}</div>
<div class="divider"></div>

<div>Mesa: {escape(table_code)}</div>
<div>Fecha: {receipt_date}</div>
<div>Cuenta #{check.id}</div>

<div class="double-divider"></div>

<table>
  <tr class="bold">
    <td class="qty">Qty</td>
    <td>Descripcion</td>
    <td class="price">Importe</td>
  </tr>
  <tr><td colspan="3"><div class="divider"></div></td></tr>
  {items_html}
</table>

<div class="double-divider"></div>

<table>
  <tr class="bold">
    <td>TOTAL</td>
    <td class="price bold large">{_format_price(subtotal)}</td>
  </tr>
</table>

<div class="divider"></div>

<div class="bold small">Pagos:</div>
<table>
  {payments_html}
</table>
<table>
  <tr>
    <td>Total pagado</td>
    <td class="price">{_format_price(check.paid_cents)}</td>
  </tr>
</table>

{fiscal_html}

<div class="divider"></div>
<div class="center small">Gracias por su visita!</div>
<div class="center small">{receipt_date}</div>
"""

        return _wrap_html(f"Recibo - Mesa {table_code}", body)

    # ── Daily Closing Report ────────────────────────────────────────

    def generate_closing_report(
        self,
        branch_id: int,
        report_date: date | None = None,
    ) -> str:
        """
        Generate a daily closing report for a branch.

        Returns HTML with: total revenue, orders count, avg ticket,
        payment method breakdown, top products.
        """
        if report_date is None:
            report_date = date.today()

        # Get branch info
        branch = self._db.scalar(
            select(Branch).where(Branch.id == branch_id)
        )
        if not branch:
            raise NotFoundError("Sucursal", branch_id)

        tenant = self._db.scalar(
            select(Tenant).where(Tenant.id == branch.tenant_id)
        )

        # Date range for the day
        start_dt = datetime.combine(report_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(days=1)

        # Total revenue from approved payments
        total_revenue = self._db.scalar(
            select(func.sum(Payment.amount_cents))
            .where(
                Payment.branch_id == branch_id,
                Payment.status == "APPROVED",
                Payment.created_at >= start_dt,
                Payment.created_at < end_dt,
            )
        ) or 0

        # Orders count (non-canceled rounds)
        orders_count = self._db.scalar(
            select(func.count(Round.id))
            .where(
                Round.branch_id == branch_id,
                Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
                Round.submitted_at >= start_dt,
                Round.submitted_at < end_dt,
            )
        ) or 0

        # Average ticket
        avg_ticket = total_revenue // orders_count if orders_count > 0 else 0

        # Sessions count
        sessions_count = self._db.scalar(
            select(func.count(TableSession.id))
            .join(Table, TableSession.table_id == Table.id)
            .where(
                Table.branch_id == branch_id,
                TableSession.opened_at >= start_dt,
                TableSession.opened_at < end_dt,
            )
        ) or 0

        # Payment method breakdown
        payment_breakdown = self._db.execute(
            select(
                Payment.provider,
                Payment.manual_method,
                func.count(Payment.id).label("count"),
                func.sum(Payment.amount_cents).label("total"),
            )
            .where(
                Payment.branch_id == branch_id,
                Payment.status == "APPROVED",
                Payment.created_at >= start_dt,
                Payment.created_at < end_dt,
            )
            .group_by(Payment.provider, Payment.manual_method)
        ).all()

        breakdown_html = ""
        for row in payment_breakdown:
            method = row.manual_method or row.provider or "N/A"
            breakdown_html += f"""
            <tr>
              <td>{escape(method)}</td>
              <td class="right">{row.count}</td>
              <td class="price">{_format_price(row.total or 0)}</td>
            </tr>"""

        # Top products
        top_products = self._db.execute(
            select(
                RoundItem.product_name,
                func.sum(RoundItem.qty).label("quantity"),
                func.sum(RoundItem.qty * RoundItem.unit_price_cents).label("revenue"),
            )
            .join(Round, RoundItem.round_id == Round.id)
            .where(
                Round.branch_id == branch_id,
                Round.status.in_(["SUBMITTED", "IN_KITCHEN", "READY", "SERVED"]),
                Round.submitted_at >= start_dt,
                Round.submitted_at < end_dt,
            )
            .group_by(RoundItem.product_name)
            .order_by(func.sum(RoundItem.qty).desc())
            .limit(15)
        ).all()

        products_html = ""
        for row in top_products:
            name = escape(row.product_name or "Sin nombre")
            products_html += f"""
            <tr>
              <td>{name}</td>
              <td class="right">{row.quantity}</td>
              <td class="price">{_format_price(row.revenue or 0)}</td>
            </tr>"""

        restaurant_name = escape(tenant.name) if tenant else "Restaurante"
        branch_name = escape(branch.name)

        body = f"""
<div class="center bold large">{restaurant_name}</div>
<div class="center">{branch_name}</div>
<div class="double-divider"></div>

<div class="center bold">CIERRE DEL DIA</div>
<div class="center">{_format_date(report_date)}</div>

<div class="double-divider"></div>

<table>
  <tr>
    <td class="bold">Facturacion total</td>
    <td class="price bold">{_format_price(total_revenue)}</td>
  </tr>
  <tr>
    <td>Pedidos</td>
    <td class="price">{orders_count}</td>
  </tr>
  <tr>
    <td>Ticket promedio</td>
    <td class="price">{_format_price(avg_ticket)}</td>
  </tr>
  <tr>
    <td>Mesas atendidas</td>
    <td class="price">{sessions_count}</td>
  </tr>
</table>

<div class="double-divider"></div>
<div class="bold">Desglose por metodo de pago:</div>
<div class="divider"></div>
<table>
  <tr class="bold small">
    <td>Metodo</td>
    <td class="right">Cant.</td>
    <td class="price">Total</td>
  </tr>
  {breakdown_html}
</table>

<div class="double-divider"></div>
<div class="bold">Productos mas vendidos:</div>
<div class="divider"></div>
<table>
  <tr class="bold small">
    <td>Producto</td>
    <td class="right">Qty</td>
    <td class="price">Ingreso</td>
  </tr>
  {products_html}
</table>

<div class="double-divider"></div>
<div class="center small">Generado: {_format_datetime(datetime.now(timezone.utc))}</div>
"""

        return _wrap_html(f"Cierre - {branch_name} - {_format_date(report_date)}", body)
