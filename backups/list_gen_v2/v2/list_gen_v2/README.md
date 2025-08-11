# SQL Query Generator & Executor

A complete system that generates SQL queries from natural language, executes them in Snowflake, and exports results to Excel.

## 🚀 Features

- **Natural Language to SQL**: Generate complex SQL queries using plain English
- **Snowflake Integration**: Execute queries directly in Snowflake 
- **Excel Export**: Automatically format and export results to Excel
- **Web Interface**: User-friendly Streamlit web application
- **Command Line**: CLI tools for automation and batch processing
- **Smart Formatting**: Auto-adjust column widths and add metadata sheets

## 📋 Prerequisites

1. **Python 3.8+**
2. **Snowflake Credentials**: Set environment variables:
   ```bash
   set SNOWFLAKE_USERNAME=your_username
   set SNOWFLAKE_PASSWORD=your_password
   ```
3. **athenaGPT Access**: Ensure you have access to the internal Azure OpenAI wrapper

## 🛠️ Installation

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Verify Setup**:
   ```bash
   python query_generator.py "Give me 10 sample customers"
   ```

## 💻 Usage

### Web Interface (Recommended)

Start the web application:
```bash
streamlit run web_query_executor.py
```

Then open your browser to `http://localhost:8501`

**Features:**
- Interactive request input with examples
- Real-time SQL generation preview
- One-click execution and Excel download
- Execution history tracking
- Progress indicators

### Command Line Interface

**Generate SQL Only:**
```bash
python query_generator.py "Give me 100 contexts including: 123, 456, 789"
```

**Generate SQL and Execute:**
```bash
python query_executor.py "Find retail customers with high usage" --output customer_list.xlsx
```

**Advanced Options:**
```bash
python query_executor.py "Get alpha testing candidates" --verbose --output-dir ./results/
```

### Python API

```python
from query_executor import QueryRunner

# Initialize runner
runner = QueryRunner(output_dir="./outputs")

# Execute complete workflow
result = runner.run_query_request(
    "Give me 50 healthcare customers for beta testing",
    filename="beta_candidates.xlsx"
)

print(f"Retrieved {result['row_count']} rows")
print(f"Excel file: {result['excel_file']}")
```

## 📁 File Structure

```
├── query_generator.py          # Core SQL generation logic
├── query_executor.py           # Snowflake execution and Excel export  
├── web_query_executor.py       # Streamlit web interface
├── prompt_v3.txt              # SQL generation prompt template
├── alpha_beta_semantic_model - V2.yaml  # Data model definition
├── requirements.txt           # Python dependencies
├── dbAuth.js                  # Database authentication utilities
├── dbUtils.js                 # Database connection utilities  
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Variables
- `SNOWFLAKE_USERNAME`: Your Snowflake username
- `SNOWFLAKE_PASSWORD`: Your Snowflake password

### Snowflake Connection Details
Default connection parameters (configured in `query_executor.py`):
- **Account**: `athenahealth.snowflakecomputing.com`
- **Database**: `CORPANALYTICS_BUSINESS_PROD`
- **Schema**: `SCRATCHPAD_PRDPF`
- **Warehouse**: `CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD`
- **Role**: `CORPANALYTICS_BDB_PRDPF_PROD_RW`

## 📊 Example Requests

The system understands various types of natural language requests:

**Context-based queries:**
- "Give me 100 contexts including: 123, 456, 789"
- "Find contexts with specific IDs: 111, 222, 333 plus 50 similar ones"

**Segment-based queries:**
- "Show me retail customers with high usage"
- "Get healthcare organizations for alpha testing" 
- "Find enterprise customers who joined recently"

**Complex filtering:**
- "Beta testing candidates from the financial sector with active subscriptions"
- "Customers in the west region with more than 1000 users"

## 🎯 Output Files

Generated Excel files include:

**Results Sheet:**
- Query results with auto-formatted columns
- Optimized column widths (max 50 characters)

**Metadata Sheet:**
- Generation timestamp
- Original request text
- Row count
- Execution details

## ⚠️ Troubleshooting

**Common Issues:**

1. **Missing Credentials**
   ```
   Error: Missing Snowflake credentials
   ```
   Solution: Set `SNOWFLAKE_USERNAME` and `SNOWFLAKE_PASSWORD` environment variables

2. **athenaGPT Connection Issues**
   ```
   Error: Could not connect to athenaGPT API
   ```
   Solution: Verify VPN connection and API access

3. **Snowflake Connection Timeout**
   ```
   Error: Database query failed: connection timeout
   ```
   Solution: Check network connectivity and Snowflake status

4. **Large Result Sets**
   - For queries returning >100K rows, consider adding LIMIT clauses
   - Excel has a ~1M row limit per sheet

## 📈 Performance Tips

- Use specific context IDs when possible for faster queries
- Add time-based filters to limit data scope  
- Preview queries with small limits before full execution
- Consider using the "Generate SQL Only" option first for complex requests

## 🔄 Version History

- **v2.0**: Added Snowflake execution and Excel export
- **v1.0**: Initial SQL generation from natural language

## 🆘 Support

For questions or issues, contact the R&D Operations Business Analytics team.
