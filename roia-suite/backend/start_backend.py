#!/usr/bin/env python
"""
Startup script for the ROIA-Suite backend service.
This script is used by PM2 to start the uvicorn server.
"""
import os
import sys
import uvicorn
import pathlib

if __name__ == "__main__":
    # Define certificate paths
    cert_dir = pathlib.Path("certs")
    cert_path = cert_dir / "cert.pem"
    key_path = cert_dir / "key.pem"
    
    # Ensure certificates exist
    if not cert_path.exists() or not key_path.exists():
        print("Error: SSL certificates not found. Please run generate_cert.py first.")
        sys.exit(1)
    
    print(f"Starting HTTPS server with certificates from {cert_dir}")
    
    # Run the uvicorn server with SSL
    uvicorn.run(
        "app.main:app", 
        host="0.0.0.0", 
        port=8005, 
        reload=False,
        ssl_keyfile=str(key_path),
        ssl_certfile=str(cert_path)
    )
