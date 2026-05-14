"""
Transactional email service.

Sends emails via SMTP. Completely optional — if SMTP is not configured,
all send operations are no-ops that log a warning and return False.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from shared.config.settings import settings
from shared.config.logging import get_logger

logger = get_logger(__name__)


class EmailService:
    """Simple SMTP email sender for transactional emails."""

    @staticmethod
    def send(to: str, subject: str, html_body: str) -> bool:
        """
        Send an email via SMTP.

        Returns True on success, False on failure or if SMTP is not configured.
        Never raises — all errors are logged and swallowed.
        """
        if not settings.smtp_host:
            logger.warning("SMTP not configured, skipping email", to=to, subject=subject)
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.smtp_from or settings.smtp_user
            msg["To"] = to
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587) as server:
                server.starttls()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)

            logger.info("Email sent successfully", to=to, subject=subject)
            return True
        except Exception as e:
            logger.error("Failed to send email", to=to, subject=subject, error=str(e))
            return False
