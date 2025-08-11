
## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1849 - Implement Robust PowerPoint Slide Generation for Roadmap Previews (Status: Done)

**Description:**
Developed and refined a system for generating PowerPoint slides based on the "Roadmap_Preview_Deep_Dive.pptx" template. This involved:
    - Direct shape targeting (e.g., "Title 6", "Text Placeholder 1", "Text Placeholder 7") for accurate content placement.
    - Parsing roadmap language to extract title (golden text) and subtitle.
    - Correctly displaying and formatting the timeframe in the top right corner (centered).
    - Integrating with Snowflake to pull feature data for slide content.
    - Resolving text box overlapping and content duplication issues.
    - Implementing a two-step fix process using `timeframe_title_fix.py` and `timeframe_box_fix.py` (or `timeframe_text_fix.py`).
    - Modifying `app.py` to orchestrate the new generation logic.

## Acceptance Criteria
- Slides are generated with correct title, subtitle, and bullet points from feature data.
- Timeframe is accurately displayed and centered in the top right corner.
- No overlapping text or duplicated content issues are present.
- System uses direct shape targeting for reliable content placement.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1850 - Fix Timeframe Display and Content Formatting in Generated Slides (Status: Done)

**Description:**
Addressed an issue where generated PowerPoint slides showed incorrect timeframe text (e.g., "Communicated delivery aligns with selected Target") and suffered from overlapping text elements. The fix involved specialized scripts for the timeframe box and ensuring proper text alignment.

## Acceptance Criteria
- Timeframe text in generated slides is correct and accurately reflects the intended period.
- Text within the timeframe box is centered.
- No text elements overlap on the slide.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1851 - Update .gitignore in PPT Project to Exclude JiraIssueCreation Folder (Status: Done)

**Description:**
Added `JiraIssueCreation/` to the `.gitignore` file located in the `josefahaz/pptgenerator` workspace (`c:\Users\jhazlett\athenahealth\R&D Operations Business Analytics - Documents\General\Active Python Scripts\PPT\`). This prevents the `JiraIssueCreation` folder, if present in that project, from being tracked by Git.

## Acceptance Criteria
- The `.gitignore` file in the PPT project root contains the entry `JiraIssueCreation/`.
- The `JiraIssueCreation` folder, if present within the PPT project, is ignored by Git.
---
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1852 - Add Feature Key to PowerPoint Slide Notes (Status: Done)

**Description:**
Modified the PowerPoint generation script (`timeframe_title_fix.py`) to automatically insert the feature key (e.g., "FEATURE-12345") into the notes section of the first slide for each generated presentation. This helps in tracking and referencing the source feature for each slide.

## Acceptance Criteria
- The feature key is present in the notes section of the first slide of each generated PowerPoint.
- No extra labels or prefixes are added to the feature key in the notes.
- The script runs without errors when adding notes.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1853 - Fix Timeframe Display Logic in PowerPoint Slides (Status: Done)

**Description:**
Refactored the timeframe determination logic in `timeframe_title_fix.py`. The script now correctly prioritizes dynamic calculation using `TARGET_GA_RELEASE` and `INDEX_RELEASES_AWAY` fields fetched from Snowflake, leveraging the `format_roadmap_timeframe` function from `standalone_roadmap.py`. It falls back to `EXTERNALROADMAPTIMEFRAME` only if dynamic calculation is not possible and the `EXTERNALROADMAPTIMEFRAME` is not the placeholder text. A final default ("Summer 2025") is used if no other valid timeframe is found. This ensures the timeframe displayed on slides aligns with the standalone roadmap logic.

## Acceptance Criteria
- Timeframe is calculated using `TARGET_GA_RELEASE` and `INDEX_RELEASES_AWAY` when available.
- `EXTERNALROADMAPTIMEFRAME` is used as a fallback if it's valid and not the placeholder.
- The placeholder text "Communicated delivery aligns with selected Target GA Release" is ignored as a valid timeframe.
- A default timeframe ("Summer 2025") is used if no other valid timeframe can be determined.
- The `SQL_FEATURE_BY_KEY` query in `timeframe_title_fix.py` correctly fetches `TARGET_GA_RELEASE` and `INDEX_RELEASES_AWAY`.
- The script handles potential null/NaN values for timeframe fields gracefully.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1854 - Resolve SQL Error in Snowflake Cortex API Call for Bullet Points (Status: Done)

**Description:**
Addressed multiple SQL errors in the `SNOWFLAKE.CORTEX.COMPLETE` function call within `load_feature_data` in `timeframe_title_fix.py`. The initial "too many arguments" error was fixed by bundling options. Subsequent "Invalid argument types" and "Provisioned Throughput" errors were investigated. The current working solution involves passing the model name (e.g., 'claude-3-7-sonnet') and the prompt, with options (`system_prompt`, `temperature`, `max_tokens`) passed as an escaped JSON string. This configuration now successfully generates bullet points.

## Acceptance Criteria
- The `SNOWFLAKE.CORTEX.COMPLETE` function call executes without SQL errors (e.g., "too many arguments", "invalid argument types").
- The script successfully generates or fetches bullet points from Cortex when the Snowflake service is available and provisioned.
- The options for the Cortex call are passed in a format accepted by Snowflake (currently an escaped JSON string).
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1855 - Persistent Instructional Text on Generated Slides (Status: Done)

**Description:**
Despite various attempts to clear or cover instructional text originating from the slide master/layout of templates like "Roadmap_Preview_Deep_Dive.pptx", this text continues to appear on the final generated slides. This affects the professional appearance of the output by overlapping with or appearing alongside the dynamically inserted feature data. The issue has been observed with multiple cleanup strategies, including keyword matching, setting opaque backgrounds, and attempting to clear unused placeholders by type (which was hindered by import issues). The latest "aggressive cleanup" of all unpopulated shapes was an attempt to address this.

## Acceptance Criteria
- Generated slides must not contain any default instructional placeholder text from the original template.
- Dynamically inserted feature data (title, subtitle, timeframe, bullets) must be clearly visible without being obscured by or overlapping with template instructional text.
- The solution should be robust for the "Roadmap_Preview_Deep_Dive.pptx" template and adaptable to other templates.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1856 - Unreliable Placeholder Enum Imports (`MSO_PLACEHOLDER`/`PP_PLACEHOLDER`) (Status: Done)

**Description:**
Multiple attempts (Steps 1165-1194) to import standard placeholder type enumerations (like `MSO_PLACEHOLDER` or `PP_PLACEHOLDER`) from various modules within the `python-pptx` library (`pptx.enum.shapes`, `pptx.enum`, `pptx.enum.mso_placeholder`, `pptx.constants`) have resulted in `ImportError`, `ModuleNotFoundError`, or `AttributeError`. This prevents the use of reliable placeholder type checking for cleanup logic, forcing workarounds.

## Acceptance Criteria
- A reliable method to import or access placeholder type enumerations (e.g., `TITLE`, `BODY`, `CONTENT`) from the `python-pptx` library must be established and documented for the project's Python environment.
- The script should be able to compare a shape's placeholder type against these enum values without runtime errors.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1857 - Enhance Placeholder Identification for Cross-Template Compatibility (Status: Done)

**Description:**
The current placeholder identification in `Roadmap_Preview.py` relies on a combination of specific keywords (e.g., "externalroadmaplanguage"), shape names (e.g., "Title 6"), and heuristics developed during debugging. To support a wider range of roadmap templates effectively, this logic needs to be more flexible and less dependent on hardcoded names or exact text matches found only in specific templates.

## Acceptance Criteria
- The system can identify common roadmap elements (title, subtitle, timeframe, bullet points/description areas) in at least two significantly different roadmap PowerPoint templates.
- Placeholder identification should prioritize official placeholder types (e.g., `TITLE`, `BODY`) once the import issue (Bug #2) is resolved.
- Fallback mechanisms should use configurable patterns or improved, less template-specific heuristics for shape identification.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1858 - Implement Strategy for Handling Slide Master/Layout Default Text (Status: Done)

**Description:**
A core challenge (Bug #1) is the appearance of unwanted instructional text from the underlying slide master or layout. This story is to implement a definitive solution, which might involve correctly identifying and clearing all unused placeholders, ensuring populated placeholders fully obscure underlying master elements, or another robust method. This is distinct from just populating found placeholders and is about ensuring a clean final slide.

## Acceptance Criteria
- A clear method is implemented that demonstrably prevents default master/layout text from appearing on generated slides where content has been populated.
- The method does not negatively impact the formatting or content of populated placeholders.
- The solution is documented and explains how it interacts with the slide master/layout system.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1861 - Unwanted static phrase on generated slides (Status: Done)

**Description:**
Generated slides from the `Roadmap_Preview_Deep_Dive.pptx` template included an unexpected phrase ("With this feature, customers can..."). Investigation revealed this originated from default text within a placeholder on the Slide Master or a specific Slide Layout. The fix involved the user manually editing the `Roadmap_Preview_Deep_Dive.pptx` template file to remove this phrase from the Slide Master/Layout.

## Acceptance Criteria
- Generated slides no longer contain the unwanted static phrase "With this feature, customers can...".
- The `Roadmap_Preview_Deep_Dive.pptx` template's Slide Master/Layout is confirmed to be free of this default text.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1862 - Extra return characters in text boxes on generated slides (Status: Done)

**Description:**
All text boxes (title, subtitle, bullets) on slides generated from the `Roadmap_Preview_Deep_Dive.pptx` template displayed an extra leading blank line or return character, causing unwanted vertical space. This was resolved by modifying the `timeframe_title_fix.py` script to refine paragraph handling during text insertion. The fix involved explicitly clearing all paragraphs and runs from the text frame before adding new content.

## Acceptance Criteria
- Text boxes on generated slides do not contain extra leading blank lines or return characters.
- Text content is correctly aligned and formatted without unexpected spacing in `timeframe_title_fix.py`.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1863 - Template slide not deleted from generated presentation (Status: Done)

**Description:**
The initial template slide from `Roadmap_Preview_Deep_Dive.pptx` was incorrectly included in the final generated presentation. Debugging revealed that an `AttributeError: 'PresentationPart' object has no attribute 'slides'` in `timeframe_title_fix.py` was causing the slide deletion logic to fail. The fix involved correcting the `AttributeError` by removing the erroneous attribute access and ensuring the correct `python-pptx` methods for slide deletion were used. Diagnostic `logger` calls in the affected section were permanently replaced with `print` statements to `sys.stderr` for stability.

## Acceptance Criteria
- The leading template slide is consistently removed from the final generated PowerPoint presentation.
- The slide deletion logic in `timeframe_title_fix.py` executes without error.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1869 - PPTX PackageNotFoundError when generating Roadmap_Preview_Deep_Dive slides (Status: Done)

**Description:**
After making changes to `timeframe_title_fix.py` (specifically removing debug print statements related to slide deletion), the application started throwing a `pptx.exc.PackageNotFoundError`. The error indicates that the presentation file, expected to be created by `timeframe_title_fix.py`, was not found when `timeframe_box_fix.py` attempted to open it. This was due to the `prs.save(output_path)` and `return output_path` lines being inadvertently removed or not reached at the end of the `timeframe_title_fix` function.

## Acceptance Criteria
- The `timeframe_title_fix` function must reliably save the generated PowerPoint presentation to the specified `output_path`.
- The `timeframe_title_fix` function must return the correct `output_path` of the saved presentation.
- The application should no longer throw a `PackageNotFoundError` during the two-step slide generation process for `Roadmap_Preview_Deep_Dive.pptx`.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1870 - Refine Cortex AI prompt for improved bullet point generation in PowerPoint slides (Status: Done)

**Description:**
The bullet points generated by the Cortex AI for feature slides in the `Roadmap_Preview_Deep_Dive.pptx` template are often too generic or not impactful enough. This task involves iteratively refining the prompt sent to the Snowflake Cortex AI (`SNOWFLAKE.CORTEX.AI_COMPLETE`) within `timeframe_title_fix.py` to produce more detailed, benefit-oriented, and appropriately formatted bullet points (e.g., 15-25 words, starting with action verbs, focusing on tangible outcomes for healthcare providers). This includes experimenting with different prompt structures and potentially different LLM models available via Cortex.

## Acceptance Criteria
- Cortex-generated bullet points in `Roadmap_Preview_Deep_Dive.pptx` slides are consistently detailed and highlight specific user benefits or key functionality.
- Bullet points adhere to specified formatting guidelines (e.g., length, starting with action verbs, sentence case, no bullet symbols from AI).
- The prompt is robust in handling various feature data inputs.
- The selected Cortex model (e.g., `claude-3-7-sonnet`, `llama3.1-405b`) and function (`SNOWFLAKE.CORTEX.AI_COMPLETE`) are confirmed to be optimal for this task.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Story: ROIA-1871 - Adjust title and subtitle spacing on PowerPoint slides (Status: Done)

**Description:**
The spacing between the main title (e.g., 'Title 6') and the subtitle (e.g., 'Text Placeholder 1') on slides generated from the `Roadmap_Preview_Deep_Dive.pptx` template is too large. This task involves using the `python-pptx` library in `timeframe_title_fix.py` to programmatically adjust the paragraph spacing properties (e.g., `space_after` for the title's last paragraph, `space_before` for the subtitle's first paragraph) to achieve a more visually appealing layout.

## Acceptance Criteria
- The vertical space between the title and subtitle on generated slides is visibly reduced.
- The adjusted spacing looks professional and consistent across slides with varying title/subtitle lengths.
- The solution is implemented in `timeframe_title_fix.py` by modifying text frame paragraph properties.
---

## Epic: PowerPoint Automation [ROIA-1848]

### Bug: ROIA-1872 - Investigate and address Cascade AI tool call failures for code modifications (Status: Done)

**Description:**
During pair programming sessions, Cascade AI's attempts to use code modification tools (e.g., `replace_file_content`, `edit_file`) frequently fail due to system-level parsing errors or other issues with the tool call mechanism. This forces manual implementation of suggested code changes, reducing efficiency. This bug is to track the issue from the user's perspective and highlight the impact on workflow.

## Acceptance Criteria
- Cascade AI tool calls for code modification are consistently successful when parameters are correctly formulated by the AI.
- The need for manual intervention to apply AI-suggested code changes is significantly reduced.
- (Internal) Root cause of tool call failures is identified and addressed by the Windsurf engineering team.
---

