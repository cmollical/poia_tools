# PowerPoint Generator Web App

This Flask application lets end-users pick a PowerPoint template and returns a deck populated with data from Snowflake. Built for work purposes at athenahealth. The app currently supports:

1. **Boulder Executive Update Decks**: Executive summary slides based on boulder data
2. **Roadmap Preview Deep Dive**: Feature-specific slides for roadmap presentations with optimized text spacing and formatting

## Quick start (dev)

```powershell
# 1. Create and activate virtual env (Windows example)
python -m venv venv
.\venv\Scripts\activate

# 2. Install deps
pip install -r requirements.txt

# 3. Set secrets
$Env:SERVICE_PASS = "<snowflake_password>"
# Optional but recommended in prod
$Env:FLASK_SECRET_KEY = "some_random_key"

# 4. Run
python app.py
# open http://localhost:5000
```

## Project structure
```
PPT/
├── app.py                # Flask server
├── Boulder_by_pillar.py  # Boulder executive update generation logic
├── Roadmap_Preview.py    # Roadmap preview slide generation
├── standalone_roadmap.py # Standalone roadmap generator with improved spacing
├── templates/
│   └── index.html        # Web UI
├── static/
│   ├── style.css
│   └── previews/         # Template previews
├── ppt_templates/        # Pre-provided .pptx templates
│   ├── BOULDER_PPT_TEMPLATE.pptx       # Boulder template
│   └── Roadmap_Preview_Deep_Dive.pptx  # Roadmap template
├── generated/            # Generated decks (auto-created)
├── logs/                 # Logs written by template processors
└── requirements.txt
```

## Recent Updates

* **May 2025**: Improved text spacing in Roadmap Preview slides to prevent title/subtitle/bullet overlap
* **May 2025**: Added special handling for FEATURE-3560 to ensure reliable slide generation
* **May 2025**: Fixed data retrieval issues with Snowflake queries

## Environment variables
| Variable            | Purpose                                                 |
|---------------------|---------------------------------------------------------|
| SERVICE_PASS        | Password for Snowflake user `SVC_JIR_PROPS`. **Required** |
| FLASK_SECRET_KEY    | Session protection / flash messages (optional in dev)  |
| PORT                | Change server port (default 5000)                      |

## Maintenance
* Clean up `uploads/` and `generated/` periodically to avoid disk bloat.
* For production use, deploy behind gunicorn + nginx and enable HTTPS.
