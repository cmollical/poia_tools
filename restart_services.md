PORTS:
alpha_beta_command_center: 3000
provider_zone_services_chat_bot: 5001
study_central_alerting: 3100
list_gen_v2: 3001
ask_amy: 5002
ppt_gen: 8000
prototype_bot: 8501
roia_suite: 8005
roia_suite_frontend: 8006

# Quick Restart Guide for Core Services

This markdown lists the commands needed to bring **all four Node/PM2 services** back online after a reboot or crash.

> **Assumptions**
> * PM2 is installed globally (`npm install -g pm2`).
> * The folder structure is:
>   * `C:\poia_tools\provider_zone_services_chat_bot`
>   * `C:\poia_tools\alpha_beta_command_center`
>   * `C:\poia_tools\study_central_alerting`
> * Each service runs a single JavaScript entry file and is managed by PM2 under the given *name*.

---

## 1. Verify / Start PM2 Daemon (optional)
```powershell
pm2 list          # starts the PM2 daemon if it is not already running
```

---

## 2. Provider-Zone Services Chat Bot (CORA)
```powershell
cd C:\poia_tools\provider_zone_services_chat_bot
pm2 start server.js --name cora
```

---

## 3. Alpha Beta Command Center
```powershell
cd C:\poia_tools\alpha_beta_command_center
pm2 start server.js --name ab-command-center
```

---

## 4. Study Central Alerting – *Dismiss* Service
```powershell
cd C:\poia_tools\study_central_alerting
pm2 start dismissServer.js --name sc-dismiss
```

---

## 5. Study Central Alerting – *Survey* Service
```powershell
cd C:\poia_tools\study_central_alerting
pm2 start surveyAlert.js --name sc-alert
```
---

## 6. List Gen V2 – *Temporary* Service
```powershell
cd C:\poia_tools\list_gen_v2
pm2 start web_sql_tester.py --name "web-sql-tester" --interpreter "c:\\poia_tools\\list_gen_v2\\venv\\Scripts\\pythonw.exe"
```

---

## 6. PPT Generator
```powershell
cd c:\poia_tools\ppt_gen
pm2 start app.py --name "ppt_gen" --interpreter "c:\poia_tools\ppt_gen\venv\Scripts\pythonw.exe" 
```

---

## 7. HTML Prototype Bot
```powershell
cd c:\poia_tools\prototype_bot
pm2 start streamlit_launcher.js --name "prototype_bot"
```

> The HTML Prototype Bot will be available at http://10.4.74.143:8501

---

## 8. ROIA Suite
```powershell
# Start the backend service
cd C:\poia_tools\roia-suite\backend
pm2 start pm2_starter.js --name "roia-suite-backend"

# Start the frontend service
cd C:\poia_tools\roia-suite\frontend
pm2 start start_frontend.js --name "roia-suite-frontend"
```

> ROIA Suite runs with the backend API on port 8005 and the frontend on port 8006. The backend requires a virtual environment with all dependencies installed from requirements.txt.

---

## 8. Ask Amy (RAG Chatbot)
```powershell
cd C:\poia_tools\ask_amy
pm2 start server.js --name ask-amy
```

> Ask Amy runs on port 5002 and uses JWT authentication with the corpanalytics_business_prod.scratchpad_prdpf.cr_app_users table

---

## 9. Scheduled Python Scripts

### Opt-Ins and Opt-Outs Script
```powershell
pm2 start "C:\Users\cmollica\Scripts\Opt_Ins_and_Opt_Outs.py" --name "opt-ins-outs" --interpreter "C:\Users\cmollica\AppData\Local\Programs\Python\Python313\python.exe" --cron "0 7-19 * * *"
```

> This script runs at the top of every hour from 7am to 7pm daily

### Qualtrics Opt-In/Out Responses Script
```powershell
pm2 start "C:\Users\cmollica\Scripts\qualtrics_opt_in_out_responses.py" --name "qualtrics-opt-resp" --interpreter "C:\Users\cmollica\AppData\Local\Programs\Python\Python313\python.exe" --cron "45 6-19 * * *"
```

> This script runs at the 45-minute mark of every hour from 6:45am to 7:45pm daily

---

## 10. Save and Auto-Restart on Reboot (run **once** after all processes are online)
```powershell
pm2 save          # save current process list
pm2 startup       # follow the on-screen instruction to register the PM2 service
```

> Once `pm2 save` has been run, future reboots will automatically restore these four processes. If you change or add processes, run `pm2 save` again.

---

## Useful PM2 Commands
```powershell
pm2 list                 # show all processes
pm2 logs <name>          # view live logs for a process
pm2 restart <name>       # restart a process
pm2 stop <name>          # stop a process
pm2 delete <name>        # remove a process from PM2 (then pm2 save)
pm2 describe <number>    # view details of a process -- you can see what env variables are set for that specific job. if wrong, delete and re-add
pm2 save                 # save current process list
pm2 startup              # follow the on-screen instruction to register the PM2 service
pm2 status               # show status of PM2 service
pm2 monit                # show real-time resource usage of each process
pm2 logs                 # show live logs for all processes
pm2 logs <name>          # view live logs for a process
pm2 logs --lines 100     # view last 100 lines of logs for all processes
pm2 logs <name> --lines 100 # view last 100 lines of logs for a process
pm2 flush                # clear logs
pm2 reload <name>        # reload a process (graceful restart)
pm2 reload all           # reload all processes (graceful restart)
pm2 reload <name> --cron "0 7-19 * * *" # reload a process at the top of every hour from 7am to 7pm daily
pm2 reload all --cron "0 7-19 * * *" # reload all processes at the top of every hour from 7am to 7pm daily
pm2 delete <name>        # remove a process from PM2 (then pm2 save)
pm2 delete all           # remove all processes from PM2 (then pm2 save)
pm2 delete <name> --cron "0 7-19 * * *" # remove a process at the top of every hour from 7am to 7pm daily   
pm2 delete all --cron "0 7-19 * * *" # remove all processes at the top of every hour from 7am to 7pm daily
pm2 delete <name> --cron "0 7-19 * * *" # remove a process at the top of every hour from 7am to 7pm daily
pm2 delete all --cron "0 7-19 * * *" # remove all processes at the top of every hour from 7am to 7pm daily
```




NEW-- PM2 set as windows service
REM If you added PM2_HOME as a system variable, skip the first line
set PM2_HOME=C:\pm2
pm2 list

pm2 start  C:\full\path\to\script.js   --name my-app            REM start new
pm2 restart my-app                                                REM restart
pm2 stop    my-app                                                REM stop
pm2 delete  my-app                                                REM remove
pm2 save                                                         REM update dump file (ALWAYS do after edits)

set PM2_HOME=C:\pm2
pm2 logs                REM live logs for ALL apps
pm2 logs my-app --lines 100

sc query pm2-service-pm2          # status (RUNNING = good)
sc stop  pm2-service-pm2          # stop the whole PM2 daemon
sc start pm2-service-pm2          # start it again

set PM2_HOME=C:\pm2
pm2 list

sc stop  pm2-service-pm2
sc start pm2-service-pm2

set PM2_HOME=C:\pm2
pm2 start C:\full\path\newScript.js --name new-app
pm2 save                     REM <!-- critical: updates startup snapshot -->

7 Common troubleshooting
Symptom	Fix
pm2 list is empty	set PM2_HOME=C:\pm2 (or add system env-var)
Service isn’t running	sc start pm2-service-pm2 & check Event Viewer → Windows Logs → Application
New apps vanish after reboot	Forgot pm2 save → start apps again → pm2 save

System Properties → Advanced → Environment Variables
  New (System)  ⇒  PM2_HOME = C:\pm2



How to add new users
select * from corpanalytics_business_prod.scratchpad_prdpf.cora_login; --cora table
select * from corpanalytics_business_prod.scratchpad_prdpf.cr_app_users;-- other poia tools

INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cora_login
    (user_name, first_name, created_at)
VALUES
    ('efradkin', 'Evan', CURRENT_TIMESTAMP());

INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_app_users
    (username, first_name, created_ts, is_active, email)
VALUES
    ('efradkin', 'Evan', CURRENT_TIMESTAMP(), 1, 'efradking@athenahealth.com');