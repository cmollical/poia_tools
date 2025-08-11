# Project Status and Future Plan: PowerPoint Deck Generator Web App

## Current Project Status (as of 2025-05-19)

### Core Functionality
- The application is a working Flask web app that allows users to:
  - Select from predefined PowerPoint templates, each with its own dedicated processor module.
  - Generate a new PowerPoint deck populated with data fetched from Snowflake.
  - Download the generated deck directly from the web interface.
- The app uses template-specific processor modules:
  - `Boulder_by_pillar.py` for Boulder Executive Update decks (with `boulder_by_pillar_build_deck` and `boulder_by_pillar_load_data` functions).
  - A modular architecture that allows easy addition of more template processors.

### Project Structure
- The directory structure is organized for clarity, with dedicated folders for templates, uploads, generated files, and static assets.
- The app creates necessary runtime directories on startup if they do not exist.
- Preview images for templates are generated to enhance user experience.

### Dependencies & Integration
- Relies on Flask, Werkzeug, `python-pptx`, pandas, and Snowflake Connector for Python.
- All dependencies are managed via `requirements.txt`.
- Direct integration with Snowflake for data retrieval with appropriate error handling and fallback to mock data.
- The application is currently designed for internal/demo use and is not production-hardened (e.g., no authentication, limited error handling, development server only).

### Limitations / Known Issues
- No authentication or user management.
- Minimal error handling and validation for uploads and data generation.
- No support for concurrent users or production deployment.
- UI is basic and may lack polish or advanced features.
- No automated tests or CI/CD pipeline.

---

## Project Plan: Future Updates & Enhancements

### Short-Term Goals (1-2 months)
1. **Add Additional Template Processors**
   - Create specialized processors for other template types (e.g., Weekly Status Reports, Department Summaries).
   - Ensure consistent naming conventions and interfaces across all processor modules.
2. **Improve Error Handling**
   - Enhance user-friendly error messages for data fetch errors and file generation issues.
   - Implement input validation for template selection.
3. **UI/UX Enhancements**
   - Polish the web interface with improved styling and responsive design.
   - Add progress indicators for long-running tasks.
4. **Basic Authentication**
   - Restrict access to authorized users (simple password or integration with company SSO).
5. **Logging & Monitoring**
   - Enhance existing logging for key actions and errors across all processor modules.

### Medium-Term Goals (3-6 months)
6. **Dynamic Template Configuration**
   - Add ability to configure parameters for each template processor (e.g., date ranges, filtering options).
   - Create a unified interface for template parameters across different processor types.
7. **Support for Additional Data Sources**
   - Allow template processors to select from multiple data sources (e.g., local CSV, other databases).
   - Create a data source abstraction layer to simplify adding new sources.
8. **Template Management**
   - Enable administrators to manage predefined templates via the web interface.
   - Improve preview generation with multi-slide previews for more complex templates.
9. **Testing & CI/CD**
   - Introduce automated tests (unit, integration, UI) for core app and template processors.
   - Set up a CI/CD pipeline for automated deployment to internal environments.
10. **Production Readiness**
   - Harden the app for production: use a production WSGI server, add HTTPS support, and secure file handling.

### Long-Term Goals (6+ months)
9. **Advanced Features**
   - Add support for dynamic slide content (custom user inputs, charts, etc.).
   - Enable scheduling of recurring deck generation (e.g., weekly reports).
   - Integrate with email to send generated decks automatically.
10. **Scalability & Multi-User Support**
    - Refactor for concurrent users and scalability (e.g., Dockerization, cloud deployment).

---

## Next Steps
- Review and prioritize the above goals based on user feedback and business needs.
- Assign responsibilities and set milestones for each phase.
- Begin with short-term improvements to improve usability and reliability.

---
_Last updated: 2025-05-14_
