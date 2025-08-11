#!/usr/bin/env python
"""
Generate self-signed certificates for HTTPS development
"""
import os
import ipaddress
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import datetime

# Create certs directory if it doesn't exist
os.makedirs('certs', exist_ok=True)

# Generate private key
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

# Write private key to file
with open('certs/key.pem', 'wb') as f:
    f.write(private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ))

# Generate self-signed certificate
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, u"US"),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, u"Massachusetts"),
    x509.NameAttribute(NameOID.LOCALITY_NAME, u"Boston"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"ROIA Suite"),
    x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
])

cert = x509.CertificateBuilder().subject_name(
    subject
).issuer_name(
    issuer
).public_key(
    private_key.public_key()
).serial_number(
    x509.random_serial_number()
).not_valid_before(
    datetime.datetime.utcnow()
).not_valid_after(
    # Valid for 365 days
    datetime.datetime.now() + datetime.timedelta(days=365)
).add_extension(
    x509.SubjectAlternativeName([
        x509.DNSName(u"localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]),
    critical=False,
).sign(private_key, hashes.SHA256())

# Write certificate to file
with open('certs/cert.pem', 'wb') as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print("Self-signed certificates generated successfully in the 'certs' directory.")
print("- Private key: certs/key.pem")
print("- Certificate: certs/cert.pem")
