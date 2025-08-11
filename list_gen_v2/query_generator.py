"""Generate Snowflake SQL queries for alpha/beta list generation using athenaGPT.

This utility leverages athenaGPT (internal Azure OpenAI wrapper) together with 
the curated semantic model defined in `alpha_beta_semantic_model - V2.yaml` to 
translate free-text requests into parameterized SQL for alpha and beta recruiting.

The system uses a simplified prompt (prompt_v3.txt) that produces cleaner and more
consistent SQL queries for generating customer lists for alpha/beta testing.

At this stage we are *only* interested in producing the SQL string – integrating
with Snowflake execution and Excel generation will come later.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Any

import yaml  # type: ignore

# The local helper packaged with the API docs
from agpt_api_docs.chat_agent import ChatAgent

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent
SEMANTIC_MODEL_FILE = ROOT_DIR / "alpha_beta_semantic_model - V2.yaml"

# Detailed template lives in external file so it can be edited without
# touching the code.
PROMPT_TEMPLATE_FILE = ROOT_DIR / "prompt_v3.txt"


def load_semantic_model() -> Dict[str, Any]:
    """Load the YAML semantic model and return as a Python dict."""
    with open(SEMANTIC_MODEL_FILE, "r", encoding="utf-8") as fh:
        model = yaml.safe_load(fh)
    return model


def create_system_prompt() -> str:
    """Construct the system prompt by reading the external template and
    embedding the semantic model JSON.
    """
    model_dict = load_semantic_model()
    semantic_json = json.dumps(model_dict, indent=2)

    with open(PROMPT_TEMPLATE_FILE, "r", encoding="utf-8") as fh:
        template = fh.read()

    return template.format(semantic_json=semantic_json)


def generate_sql(user_request: str, *, verbose: bool = False) -> str:
    """Generate the SQL string for *user_request* via athenaGPT.

    Parameters
    ----------
    user_request:
        Natural language description provided by the end user.
    verbose:
        If True, print the conversation history for debugging.
    """
    system_prompt = create_system_prompt()
    agent = ChatAgent(system_message=system_prompt)
    sql = agent.send_message(user_request)

    if verbose:
        print("\n--- Conversation history ---")
        print(agent.get_history_text())
        print("--- end ---\n")

    return sql.strip()


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Snowflake SQL via athenaGPT.")
    parser.add_argument("prompt", help="Natural language request, wrapped in quotes.")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show conversation history.")
    args = parser.parse_args()

    sql = generate_sql(args.prompt, verbose=args.verbose)
    print(sql)


if __name__ == "__main__":
    main()
