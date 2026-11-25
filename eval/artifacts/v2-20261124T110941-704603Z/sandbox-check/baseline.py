from pathlib import Path
from docx import Document
assert len(list(Path('/work').iterdir())) == 1
Document().save('check.docx')
