"""
SQL Generator Bridge for Alpha Beta Command Center

This script serves as a bridge between the PowerShell jobs and the list_gen_v2 
SQL generation logic. It replaces the stored procedure calls with direct usage
of the athenaGPT-based SQL generation system.

Usage:
    python sql_generator_bridge.py --mode {list_generation|list_filter} --prompt "user prompt" --username "user@athenahealth.com"

Returns JSON response in same format as original stored procedures to maintain 
compatibility with existing PowerShell scripts.
"""

import argparse
import json
import sys
import os
from pathlib import Path

# Add list_gen_v2 to path to import query_generator
current_dir = Path(__file__).parent
list_gen_v2_dir = current_dir.parent / "list_gen_v2"
sys.path.insert(0, str(list_gen_v2_dir))

try:
    from query_generator import generate_sql
except ImportError as e:
    print(f"ERROR: Could not import query_generator from list_gen_v2: {e}", file=sys.stderr)
    sys.exit(1)


def generate_sql_for_list_generation(user_prompt: str, username: str) -> dict:
    """
    Generate SQL for list_generation functionality.
    
    Returns JSON matching the format expected by list_generation_power_shell.ps1:
    {
        "generated_sql": "SELECT ...",
        "forcedContextIDs": []
    }
    """
    try:
        # Generate SQL using the list_gen_v2 logic
        generated_sql = generate_sql(user_prompt)
        
        if not generated_sql or generated_sql.strip() == '':
            print(json.dumps({
                "error": "No SQL was generated from the prompt",
                "generated_sql": "",
                "sql_explanation": ""
            }))
            sys.exit(1)
        
        # Generate explanation of the SQL using athenaGPT ChatAgent directly with internal analysis
        explanation_prompt = f"""Analyze this SQL query internally (don't show your analysis), then provide ONLY a clean business explanation.

SQL Query:
{generated_sql}

Internally review: CTEs, LIMIT clauses (especially the final one), ORDER BY, filters, and exclusions. Pay special attention to the FINAL LIMIT clause which determines actual output count.

Provide ONLY this clean output with simple bullet points:
• What feature this is for
• What customers this will find
• How many customers (based on final LIMIT clause)
• Any special filters or priorities
• Any special exclusions (such as previously invited clients)

Do not show stages, headers, or analysis steps. Only output clean bullet points under 200 words."""
        
        try:
            # Import ChatAgent for direct text generation (not SQL generation)
            from agpt_api_docs.chat_agent import ChatAgent
            
            # Create a ChatAgent instance with system message for explanation generation
            explanation_agent = ChatAgent(
                system_message="You are a helpful assistant that explains SQL queries in simple, business-friendly language."
            )
            
            # Generate explanation using send_message method
            sql_explanation = explanation_agent.send_message(explanation_prompt).strip()
            
        except Exception as explanation_error:
            print(f"Warning: Failed to generate SQL explanation: {explanation_error}", file=sys.stderr)
            sql_explanation = "Unable to generate explanation for this query."
        
        # For list_generation mode, we need to return forcedContextIDs as well
        # Extract any forced context IDs if they exist in the generated SQL
        forced_contexts = []
        if "forced_ids" in generated_sql.lower():
            # Simple pattern matching for forced contexts - could be enhanced
            import re
            context_matches = re.findall(r'\b\d{4,}\b', user_prompt)
            forced_contexts = context_matches[:10]  # Limit to first 10 found
        
        # Return JSON response in the same format as the stored procedure, plus explanation
        response = {
            "generated_sql": generated_sql,
            "forcedContextIDs": forced_contexts,
            "sql_explanation": sql_explanation
        }
        
        print(json.dumps(response))
        sys.exit(0)
        
    except Exception as e:
        error_response = {
            "error": f"Failed to generate SQL: {str(e)}",
            "generated_sql": "",
            "sql_explanation": ""
        }
        print(json.dumps(error_response))
        sys.exit(1)


def main():
    """Main entry point for the bridge script."""
    parser = argparse.ArgumentParser(
        description="SQL Generator Bridge for Alpha Beta Command Center"
    )
    parser.add_argument(
        "--mode", 
        required=True,
        choices=["list_generation"],
        help="Mode of operation (list_generation only)"
    )
    parser.add_argument(
        "--prompt", 
        required=True,
        help="User prompt for SQL generation"
    )
    parser.add_argument(
        "--username", 
        required=True,
        help="Username for logging purposes"
    )
    parser.add_argument(
        "--verbose", 
        action="store_true",
        help="Enable verbose output for debugging"
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        print(f"Bridge script called with:", file=sys.stderr)
        print(f"  Mode: {args.mode}", file=sys.stderr)
        print(f"  Username: {args.username}", file=sys.stderr)
        print(f"  Prompt: {args.prompt[:100]}...", file=sys.stderr)
    
    # Generate SQL for list_generation mode
    response = generate_sql_for_list_generation(args.prompt, args.username)
    
    # Output JSON response to stdout for PowerShell to capture (compact format to avoid newlines)
    print(json.dumps(response))


if __name__ == "__main__":
    main()
