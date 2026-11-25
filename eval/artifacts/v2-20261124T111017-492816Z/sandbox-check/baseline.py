from pathlib import Path
from docx import Document
assert len(list(Path.cwd().iterdir())) == 1
try:
    Path('/etc/passwd').read_bytes()
except PermissionError:
    pass
else:
    raise AssertionError('host read allowed')
Document().save('check.docx')
