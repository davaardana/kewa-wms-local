import sys

path = "/var/www/mosa/backend/app/Services/GateEngineService.php"
with open(path, "r") as f:
    c = f.read()

# 1. resolveShippingDocument exact ID: tambah 'draft'
c = c.replace(
    "!in_array($shippingDoc->status, ['approved', 'in_progress'], true)",
    "!in_array($shippingDoc->status, ['draft', 'approved', 'in_progress'], true)"
)

# 2. skip stale-edge check untuk draft
c = c.replace(
    "// Edge config may be stale \xe2\x80\x94 re-resolve by scanned EPCs if needed\n        if ($shippingDoc && !$shippingDoc->tags->contains(\n            fn ($tag) => in_array($tag->tag_epc, $epcList, true)\n        )) {\n            $shippingDoc = null;\n        }",
    "// Edge config may be stale \xe2\x80\x94 re-resolve by scanned EPCs if needed\n        // draft: tags belum ada (auto-assign on gate) \xe2\x80\x94 skip cek ini\n        if ($shippingDoc && $shippingDoc->status !== 'draft' && !$shippingDoc->tags->contains(\n            fn ($tag) => in_array($tag->tag_epc, $epcList, true)\n        )) {\n            $shippingDoc = null;\n        }"
)

# 3. fallback EPC query: tambah 'draft', cocok by item_id
c = c.replace(
    "->whereIn('status', ['approved', 'in_progress'])\n                ->whereHas('tags', fn ($q) => $q->whereIn('tag_epc', $epcList))",
    "->whereIn('status', ['draft', 'approved', 'in_progress'])\n                ->whereHas('items', fn ($q) => $q->whereHas('item', fn ($qi) => $qi->whereIn(\n                    'id', \\App\\Models\\RfidTag::whereIn('epc', $epcList)->pluck('item_id')->unique()->all()\n                )))"
)

# 4. recordGateCustody: handle draft -> in_progress
c = c.replace(
    "if ($shippingDoc->status === 'approved') {\n            $shippingDoc->update(['status' => 'in_progress']);\n        }",
    "// v2: auto-assign tags ke shipping_document_tags untuk dokumen draft\n        if ($shippingDoc->status === 'draft') {\n            $docItems = $shippingDoc->items->keyBy('item_id');\n            foreach ($allCumulativeEpcs as $epc) {\n                if (!$allCumulativeTags->has($epc)) continue;\n                $tagModel = $allCumulativeTags->get($epc);\n                $itemId   = $tagModel->item_id;\n                if (!$docItems->has($itemId)) continue;\n                $docItem = $docItems->get($itemId);\n                $alreadyAssigned = \\App\\Models\\ShippingDocumentTag::where('shipping_document_id', $shippingDoc->id)\n                    ->where('tag_epc', $epc)->exists();\n                if ($alreadyAssigned) continue;\n                \\App\\Models\\ShippingDocumentTag::create([\n                    'shipping_document_id'      => $shippingDoc->id,\n                    'shipping_document_item_id' => $docItem->id,\n                    'rfid_tag_id'               => $tagModel->id,\n                    'tag_epc'                   => $epc,\n                    'status'                    => 'scanned',\n                    'scanned_at'                => now(),\n                ]);\n                $docItem->increment('scanned_qty');\n            }\n        }\n\n        if (in_array($shippingDoc->status, ['draft', 'approved'], true)) {\n            $shippingDoc->update(['status' => 'in_progress']);\n        }"
)

with open(path, "w") as f:
    f.write(c)

print("GateEngineService patch 1-4 OK")
