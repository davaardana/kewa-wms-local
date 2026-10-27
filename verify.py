import subprocess

files = {
    "GateEngine": "/var/www/mosa/backend/app/Services/GateEngineService.php",
    "Controller": "/var/www/mosa/backend/app/Http/Controllers/Api/ShippingDocumentController.php",
    "api.php": "/var/www/mosa/backend/routes/api.php",
    "FE": "/var/www/mosa/frontend/src/pages/ShippingDocuments.jsx",
}

checks = {
    "GateEngine": ["draft", "isDraft", "in_array.*draft.*approved.*in_progress", "auto-assign"],
    "Controller": ["v2", "skip cek pre-assignment", "di-approve"],
    "api.php": ["approve", "assign-tags", "scan-tag", "batch-scan"],
    "FE": ["canApprove", "canAssignTags", "handleApprove", "Approve", "v2"],
}

import re

for label, path in files.items():
    with open(path) as f:
        lines = f.readlines()
    print(f"\n=== {label} ({path}) ===")
    patterns = checks[label]
    for i, line in enumerate(lines, 1):
        for p in patterns:
            if re.search(p, line, re.IGNORECASE):
                print(f"  L{i:4}: {line.rstrip()}")
                break
