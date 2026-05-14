"""Abstract payment gateway interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class PaymentResult:
    success: bool
    payment_id: Optional[str] = None
    external_id: Optional[str] = None
    status: str = "unknown"  # approved, pending, rejected, failed
    redirect_url: Optional[str] = None
    error_message: Optional[str] = None
    amount_cents: Optional[int] = None
    external_reference: Optional[str] = None
    status_detail: Optional[str] = None


@dataclass
class PaymentPreference:
    title: str
    amount_cents: int
    currency: str = "ARS"
    external_reference: str = ""
    payer_email: Optional[str] = None
    back_urls: Optional[dict] = None
    notification_url: Optional[str] = None


class PaymentGateway(ABC):
    """Abstract interface for payment gateways.

    Implementations: MercadoPagoGateway (current), future: StripeGateway, etc.
    """

    @abstractmethod
    async def create_preference(self, preference: PaymentPreference) -> PaymentResult:
        """Create a payment preference/intent. Returns redirect URL."""
        ...

    @abstractmethod
    async def verify_payment(self, payment_id: str) -> PaymentResult:
        """Verify payment status by ID."""
        ...

    @abstractmethod
    def verify_webhook_signature(self, signature: str, request_id: str, data_id: str) -> bool:
        """Verify webhook signature for incoming notifications."""
        ...

    @abstractmethod
    async def handle_webhook(self, payload: dict) -> PaymentResult:
        """Process incoming webhook notification."""
        ...
