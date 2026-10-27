path = "/var/www/mosa/backend/routes/api.php"
with open(path, "r") as f:
    c = f.read()

# Hapus 4 route: approve, assign-tags, scan-tag, batch-scan
lines_to_remove = [
    "    Route::post('/shipping-documents/{id}/approve',        [ShippingDocumentController::class, 'approve']);\n",
    "    Route::post('/shipping-documents/{id}/assign-tags',    [ShippingDocumentController::class, 'assignTags']);\n",
    "    Route::post('/shipping-documents/{id}/scan-tag',       [ShippingDocumentController::class, 'scanTag']);\n",
    "    Route::post('/shipping-documents/{id}/batch-scan',     [ShippingDocumentController::class, 'batchScanTags']);\n",
]

removed = 0
for line in lines_to_remove:
    if line in c:
        c = c.replace(line, "")
        removed += 1
    else:
        print(f"NOT FOUND: {line.strip()}")

# Update komentar shipping documents
c = c.replace(
    "    // PM: buat, approve, cancel\n    // PIC: assign-tags, scan-tag, batch-scan, complete",
    "    // PM: buat, cancel\n    // PIC/Gate: tag di-auto-assign saat gate scan; complete = Approve"
)

with open(path, "w") as f:
    f.write(c)

print(f"api.php patch OK: {removed} routes removed")
