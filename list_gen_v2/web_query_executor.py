"""Web interface for SQL generation, execution, and Excel export.

This provides a user-friendly web interface for the complete workflow.
"""
import os
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import streamlit as st
import pandas as pd

from query_executor import QueryRunner


# Page configuration
st.set_page_config(
    page_title="SQL Query Generator & Executor",
    page_icon="📊",
    layout="wide"
)

# Initialize session state
if 'results_history' not in st.session_state:
    st.session_state.results_history = []

def main():
    st.title("🚀 SQL Query Generator & Executor")
    st.markdown("Generate SQL from natural language, execute in Snowflake, and export to Excel")
    
    # Sidebar for configuration
    with st.sidebar:
        st.header("⚙️ Configuration")
        
        # Check environment variables
        snowflake_user = os.getenv('SNOWFLAKE_USERNAME')
        snowflake_pass = os.getenv('SNOWFLAKE_PASSWORD')
        
        if snowflake_user and snowflake_pass:
            st.success(f"✅ Snowflake credentials configured for: {snowflake_user}")
        else:
            st.error("❌ Missing Snowflake credentials")
            st.markdown("""
            Please set environment variables:
            - `SNOWFLAKE_USERNAME`
            - `SNOWFLAKE_PASSWORD`
            """)
            return
        
        # Output directory selection
        output_dir = st.text_input(
            "Output Directory", 
            value=str(Path.cwd() / "outputs"),
            help="Directory where Excel files will be saved"
        )
        
        # Advanced options
        with st.expander("Advanced Options"):
            verbose_mode = st.checkbox("Verbose Mode", help="Show detailed SQL generation conversation")
            custom_filename = st.text_input("Custom Filename (optional)", help="Leave blank for auto-generated filename")
    
    # Main interface
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.header("📝 Natural Language Request")
        
        # Example requests
        st.markdown("**Example requests:**")
        examples = [
            "Give me 100 contexts including: 123, 456, 789",
            "Find customers in the retail segment with high usage",
            "Get alpha testing candidates from healthcare organizations",
            "Show me beta users who joined in the last 6 months"
        ]
        
        example_cols = st.columns(2)
        for i, example in enumerate(examples):
            col = example_cols[i % 2]
            if col.button(f"Use Example {i+1}", key=f"example_{i}"):
                st.session_state.user_request = example
        
        # Main input
        user_request = st.text_area(
            "Enter your request:",
            value=st.session_state.get('user_request', ''),
            height=100,
            placeholder="Describe what data you want to retrieve..."
        )
        
        # Action buttons
        button_col1, button_col2, button_col3 = st.columns([1, 1, 2])
        
        with button_col1:
            generate_sql_only = st.button("🔍 Generate SQL Only", type="secondary")
        
        with button_col2:
            execute_full = st.button("🚀 Generate & Execute", type="primary")
        
        if user_request:
            try:
                # Initialize runner
                runner = QueryRunner(output_dir=Path(output_dir))
                
                if generate_sql_only:
                    st.header("📋 Generated SQL")
                    
                    with st.spinner("Generating SQL..."):
                        from query_generator import generate_sql
                        sql = generate_sql(user_request, verbose=verbose_mode)
                    
                    st.code(sql, language="sql")
                    
                    # Allow user to copy
                    st.text_area("Copy SQL:", value=sql, height=200)
                
                elif execute_full:
                    st.header("🎯 Execution Results")
                    
                    # Progress tracking
                    progress_bar = st.progress(0)
                    status_text = st.empty()
                    
                    # Execute the full workflow
                    with st.spinner("Running complete workflow..."):
                        status_text.text("Step 1/3: Generating SQL...")
                        progress_bar.progress(33)
                        
                        result = runner.run_query_request(
                            user_request,
                            filename=custom_filename if custom_filename else None,
                            verbose=verbose_mode
                        )
                        
                        progress_bar.progress(100)
                        status_text.text("Execution complete!")
                    
                    # Display results
                    if result['success']:
                        st.success(f"✅ Successfully retrieved {result['row_count']} rows")
                        
                        # Result summary
                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric("Rows Retrieved", result['row_count'])
                        with col2:
                            st.metric("Execution Time", result['execution_time'])
                        with col3:
                            st.download_button(
                                "📥 Download Excel",
                                data=open(result['excel_file'], 'rb').read(),
                                file_name=Path(result['excel_file']).name,
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            )
                        
                        # Show generated SQL
                        with st.expander("📋 Generated SQL"):
                            st.code(result['sql'], language="sql")
                        
                        # Show sample data if available
                        if result['row_count'] > 0:
                            st.subheader("📊 Sample Results (first 100 rows)")
                            try:
                                # Read the Excel file to show preview
                                preview_df = pd.read_excel(result['excel_file'], nrows=100)
                                st.dataframe(preview_df, use_container_width=True)
                            except Exception as e:
                                st.warning(f"Could not preview data: {str(e)}")
                        
                        # Add to history
                        st.session_state.results_history.append({
                            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            'request': user_request,
                            'row_count': result['row_count'],
                            'file_path': result['excel_file'],
                            'execution_time': result['execution_time']
                        })
                        
                    else:
                        st.error(f"❌ Execution failed: {result['error']}")
                        
                        # Show error details
                        with st.expander("Error Details"):
                            st.code(result['error'])
            
            except Exception as e:
                st.error(f"❌ Unexpected error: {str(e)}")
                st.exception(e)
    
    with col2:
        st.header("📈 Execution History")
        
        if st.session_state.results_history:
            for i, entry in enumerate(reversed(st.session_state.results_history[-10:])):  # Show last 10
                with st.expander(f"Run {len(st.session_state.results_history) - i}"):
                    st.text(f"Time: {entry['timestamp']}")
                    st.text(f"Request: {entry['request'][:50]}...")
                    st.text(f"Rows: {entry['row_count']}")
                    st.text(f"Duration: {entry['execution_time']}")
                    
                    if os.path.exists(entry['file_path']):
                        st.download_button(
                            "📥 Download",
                            data=open(entry['file_path'], 'rb').read(),
                            file_name=Path(entry['file_path']).name,
                            key=f"download_{i}",
                            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        )
        else:
            st.info("No execution history yet")
        
        # Clear history button
        if st.button("🗑️ Clear History"):
            st.session_state.results_history = []
            st.experimental_rerun()


if __name__ == "__main__":
    main()
