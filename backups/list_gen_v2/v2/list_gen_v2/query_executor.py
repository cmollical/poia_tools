"""Execute Snowflake SQL queries and export results to Excel.

This module extends the query generation system to actually execute the generated
SQL queries in Snowflake and export the results to Excel files.
"""
from __future__ import annotations

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import pandas as pd
import pyodbc

from query_generator import generate_sql


class SnowflakeExecutor:
    """Handles Snowflake connection and query execution using ODBC."""
    
    def __init__(self):
        """Initialize with Snowflake connection parameters from environment."""
        self.snowflake_user = os.getenv('SNOWFLAKE_USERNAME')
        self.snowflake_password = os.getenv('SNOWFLAKE_PASSWORD')
        
        # Validate required credentials
        if not self.snowflake_user or not self.snowflake_password:
            raise ValueError(
                "Missing Snowflake credentials. Please set SNOWFLAKE_USERNAME and "
                "SNOWFLAKE_PASSWORD environment variables."
            )
    
    def build_connection_string(self):
        """Build ODBC connection string matching dbUtils.js pattern."""
        snowflake_account = "athenahealth.snowflakecomputing.com"
        snowflake_database = "CORPANALYTICS_BUSINESS_PROD"
        snowflake_schema = "SCRATCHPAD_PRDPF"
        snowflake_warehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD"
        snowflake_role = "CORPANALYTICS_BDB_PRDPF_PROD_RW"
        
        # Modified connection string format to avoid [Errno 22] Invalid argument
        # Adding spaces after each parameter as some ODBC drivers require this format
        return (f"Driver=SnowflakeDSIIDriver; "
                f"Server={snowflake_account}; "
                f"Database={snowflake_database}; "
                f"Schema={snowflake_schema}; "
                f"Warehouse={snowflake_warehouse}; "
                f"Role={snowflake_role}; "
                f"Uid={self.snowflake_user}; "
                f"Pwd={self.snowflake_password};")
    
    def execute_query(self, sql: str) -> pd.DataFrame:
        """Execute SQL query and return results as pandas DataFrame.
        
        Parameters
        ----------
        sql : str
            The SQL query to execute
            
        Returns
        -------
        pd.DataFrame
            Query results as a DataFrame
        """
        print(f"Connecting to Snowflake via ODBC...")
        connection = None
        
        try:
            # Build connection string
            connection_string = self.build_connection_string()
            print(f"Connection string: {connection_string.replace(f'Pwd={self.snowflake_password}', 'Pwd=******')}")
            
            # Connect using ODBC with better error handling
            try:
                connection = pyodbc.connect(connection_string)
                print("Successfully connected to Snowflake")
            except pyodbc.Error as odbc_err:
                error_details = f"ODBC Error [{odbc_err.args[0]}]: {odbc_err.args[1]}" if len(odbc_err.args) > 1 else str(odbc_err)
                print(f"Connection failed: {error_details}")
                print("\nVerify your ODBC driver is correctly installed and configured.")
                print("Try running 'odbcad32.exe' to check available drivers.")
                raise Exception(f"Snowflake connection failed: {error_details}")
                
            print(f"Executing query...")
            print(f"SQL Preview: {sql[:150]}...")
            
            # Execute query using cursor
            cursor = connection.cursor()
            cursor.execute(sql)
            
            # Get column names
            columns = [column[0] for column in cursor.description]
            
            # Fetch all results
            results = cursor.fetchall()
            
            # Convert to DataFrame
            if results:
                # Convert rows to list of dictionaries
                data = []
                for row in results:
                    row_dict = {}
                    for i, value in enumerate(row):
                        row_dict[columns[i]] = value
                    data.append(row_dict)
                
                df = pd.DataFrame(data)
                print(f"Query completed successfully. Retrieved {len(df)} rows.")
                return df
            else:
                print("Query completed but returned no results.")
                return pd.DataFrame()
                    
        except Exception as e:
            print(f"Error executing query: {str(e)}")
            raise
        finally:
            if connection:
                try:
                    connection.close()
                    print("Database connection closed.")
                except Exception as close_err:
                    print(f"Error closing connection: {close_err}")


class ExcelExporter:
    """Handles Excel export functionality."""
    
    def __init__(self, output_dir: Optional[Path] = None):
        """Initialize with output directory.
        
        Parameters
        ----------
        output_dir : Path, optional
            Directory to save Excel files. Defaults to current directory.
        """
        self.output_dir = output_dir or Path.cwd()
        self.output_dir.mkdir(exist_ok=True)
    
    def export_to_excel(
        self, 
        df: pd.DataFrame, 
        filename: Optional[str] = None,
        request_summary: Optional[str] = None,
        sql_query: Optional[str] = None
    ) -> Path:
        """Export DataFrame to Excel with formatting.
        
        Parameters
        ----------
        df : pd.DataFrame
            Data to export
        filename : str, optional
            Output filename. If not provided, auto-generates based on timestamp.
        request_summary : str, optional
            Summary of the original request for documentation
        sql_query : str, optional
            The generated SQL query for documentation
            
        Returns
        -------
        Path
            Path to the created Excel file
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"sql_results_{timestamp}.xlsx"
        
        # Ensure .xlsx extension
        if not filename.endswith('.xlsx'):
            filename += '.xlsx'
            
        output_path = self.output_dir / filename
        
        print(f"Exporting {len(df)} rows to Excel: {output_path}")
        
        # Create Excel writer with formatting
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # Write main data
            df.to_excel(writer, sheet_name='Results', index=False)
            
            # Add metadata sheet if any metadata provided
            if request_summary or sql_query:
                metadata_items = [
                    ('Generated On', datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    ('Row Count', len(df))
                ]
                
                if request_summary:
                    metadata_items.append(('Request Summary', request_summary))
                
                if sql_query:
                    metadata_items.append(('Generated SQL', sql_query))
                
                metadata_df = pd.DataFrame(metadata_items, columns=['Property', 'Value'])
                metadata_df.to_excel(writer, sheet_name='Metadata', index=False)
            
            # Auto-adjust column widths
            worksheet = writer.sheets['Results']
            for column in worksheet.columns:
                max_length = 0
                column_letter = column[0].column_letter
                
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                
                adjusted_width = min(max_length + 2, 50)  # Cap at 50 characters
                worksheet.column_dimensions[column_letter].width = adjusted_width
        
        print(f"Excel file created successfully: {output_path}")
        return output_path


class QueryRunner:
    """Main class that orchestrates SQL generation, execution, and Excel export."""
    
    def __init__(self, output_dir: Optional[Path] = None):
        """Initialize the query runner.
        
        Parameters
        ----------
        output_dir : Path, optional
            Directory to save Excel files
        """
        self.executor = SnowflakeExecutor()
        self.exporter = ExcelExporter(output_dir)
    
    def run_query_request(
        self, 
        user_request: str, 
        filename: Optional[str] = None,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """Complete workflow: generate SQL, execute, and export to Excel.
        
        Parameters
        ----------
        user_request : str
            Natural language request for SQL generation
        filename : str, optional
            Output Excel filename
        verbose : bool, default False
            Whether to show detailed logging
            
        Returns
        -------
        Dict[str, Any]
            Results summary including file path, row count, etc.
        """
        start_time = datetime.now()
        
        try:
            # Step 1: Generate SQL
            print("=" * 60)
            print("STEP 1: Generating SQL Query")
            print("=" * 60)
            print(f"Request: {user_request}")
            
            sql = generate_sql(user_request, verbose=verbose)
            print(f"\nGenerated SQL:\n{sql}")
            
            # Step 2: Execute in Snowflake
            print("\n" + "=" * 60)
            print("STEP 2: Executing Query in Snowflake")
            print("=" * 60)
            
            df = self.executor.execute_query(sql)
            
            # Step 3: Export to Excel
            print("\n" + "=" * 60)
            print("STEP 3: Exporting Results to Excel")
            print("=" * 60)
            
            excel_path = self.exporter.export_to_excel(
                df, filename=filename, request_summary=user_request, sql_query=sql
            )
            
            # Summary
            execution_time = datetime.now() - start_time
            
            summary = {
                'success': True,
                'request': user_request,
                'sql': sql,
                'row_count': len(df),
                'excel_file': str(excel_path),
                'execution_time': str(execution_time),
                'timestamp': datetime.now().isoformat()
            }
            
            print("\n" + "=" * 60)
            print("EXECUTION COMPLETE")
            print("=" * 60)
            print(f"Rows retrieved: {summary['row_count']}")
            print(f"Excel file: {summary['excel_file']}")
            print(f"Execution time: {summary['execution_time']}")
            
            return summary
            
        except Exception as e:
            error_summary = {
                'success': False,
                'request': user_request,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
            
            print(f"\nERROR: {str(e)}")
            return error_summary


# CLI interface
def main():
    """Command-line interface for the query runner."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate SQL, execute in Snowflake, and export to Excel."
    )
    parser.add_argument(
        "request", 
        help="Natural language request for SQL generation (wrap in quotes)"
    )
    parser.add_argument(
        "--output", "-o", 
        help="Output Excel filename"
    )
    parser.add_argument(
        "--output-dir", 
        help="Output directory for Excel files",
        type=Path
    )
    parser.add_argument(
        "--verbose", "-v", 
        action="store_true", 
        help="Show detailed logging including SQL generation conversation"
    )
    
    args = parser.parse_args()
    
    # Create runner and execute
    runner = QueryRunner(output_dir=args.output_dir)
    result = runner.run_query_request(
        args.request, 
        filename=args.output, 
        verbose=args.verbose
    )
    
    # Print JSON summary
    print(f"\nFinal Result:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
