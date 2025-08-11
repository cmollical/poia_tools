"""Simple Streamlit front-end to test SQL generation via athenaGPT."""
from pathlib import Path
import streamlit as st

# Ensure list_gen_v2 is on import path if running from parent dir
import sys
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from query_generator import generate_sql  # noqa: E402

st.set_page_config(page_title="Alpha/Beta SQL Generator", layout="wide")

st.title("Alpha/Beta List Generation – SQL Tester")

prompt = st.text_area("Enter your natural-language request:", height=200)

verbose = st.checkbox("Show conversation history (verbose)")

if st.button("Generate SQL", disabled=not prompt.strip()):
    with st.spinner("Calling athenaGPT …"):
        try:
            sql = generate_sql(prompt.strip(), verbose=verbose)
            st.subheader("Generated SQL")
            st.code(sql, language="sql")
        except Exception as e:
            st.error(f"Error: {e}")
