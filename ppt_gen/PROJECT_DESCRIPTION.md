# PowerPoint Deck Generator Web App

## Overview
This project is a Flask-based web application designed to generate PowerPoint decks from user-selected templates, populated with data fetched from Snowflake. The application provides a simple web interface for users to select from predefined templates, with each template type having its own dedicated processor module. Currently, it supports the Boulder Executive Update template, with the architecture designed for easy expansion to additional template types in the future.

## Main Files
- **app.py**: The core of the application. It defines the Flask app, manages template selection and routing to the appropriate template processor, and serves the web interface and download endpoints.
- **Boulder_by_pillar.py**: The Boulder Executive Update template processor that pulls Boulder data from Snowflake and generates the PowerPoint presentation with slides organized by pillar.

## Key Features
- **Template Selection**: Users can choose from existing PowerPoint templates with specialized processors.
- **Modular Architecture**: Each template type has its own dedicated processor module, making it easy to add new template types.
- **Automated Deck Generation**: Upon form submission, the app routes to the appropriate processor to generate a new presentation deck using data from Snowflake.
- **Downloadable Output**: The generated deck is saved and streamed back to the user as a downloadable file.
- **Preview Generation**: The app generates preview images for templates to enhance user experience.

## Project Structure
```
PPT/
├── app.py                  – Flask app (main entrypoint)
├── Boulder_by_pillar.py    – Boulder Executive Update template processor
├── templates/              – Jinja2 templates for Flask UI
│   └── index.html          – Main page
├── static/
│   └── style.css           – Optional styling
├── ppt_templates/          – Predefined .pptx templates
│   └── BOULDER_PPT_TEMPLATE.pptx – Boulder template file
├── generated/              – Generated decks ready for download
└── static/previews/        – Preview images for templates
```

## Dependencies
- Flask
- Werkzeug
- python-pptx
- pandas
- Snowflake Connector for Python
- pywin32 (for preview generation)

See `requirements.txt` for a full list of dependencies.

## How It Works
1. User visits the main page and selects a PowerPoint template.
2. Based on the selected template, the app routes to the appropriate processor module:
   - For Boulder templates, it uses `Boulder_by_pillar.py` which has specialized logic for Boulder data and formatting.
   - Additional template processors can be added for other template types.
3. The processor module fetches relevant data from Snowflake and generates the PowerPoint presentation.
4. The generated file is saved in the `generated/` directory and provided as a download to the user.

## Usage
- Run the app locally with:
  ```bash
  python app.py
  ```
- Access the web interface at [http://localhost:5000](http://localhost:5000)

**Note:** This app is for internal/demo use only. Do not use the built-in Flask server in production environments.

## Authors & Maintainers
- [Your Name Here]

---
_Last updated: 2025-05-14_
