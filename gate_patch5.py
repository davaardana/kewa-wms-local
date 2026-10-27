path = "/var/www/mosa/backend/app/Services/GateEngineService.php"
with open(path, "r") as f:
    c = f.read()

old5 = (
    "        $assignedTags  = $shippingDoc->tags->keyBy('tag_epc');\n"
    "        $assignedEpcs  = $assignedTags->keys()->all();\n"
    "        $expectedItems = $shippingDoc->items->mapWithKeys(fn ($i) => [$i->item_id => (int) $i->expected_qty]);\n"
    "        $assignedItemCounts = $shippingDoc->items->mapWithKeys(fn ($item) => [\n"
    "            $item->item_id => $assignedTags->filter(fn ($tag) => (int) $tag->shipping_document_item_id === (int) $item->id)->count(),\n"
    "        ]);\n"
    "\n"
    "        foreach ($expectedItems as $itemId => $requiredQty) {\n"
    "            $assignedQty = $assignedItemCounts->get($itemId, 0);\n"
    "            if ($assignedQty !== $requiredQty) {\n"
    "                $mismatch = true;\n"
    '                $mismatchDetails[] = "Jumlah tag ter-assign untuk item #{$itemId} adalah {$assignedQty}/{$requiredQty}; lengkapi assignment sebelum gate.";\n'
    "            }\n"
    "        }\n"
    "\n"
    "        foreach ($epcList as $epc) {\n"
    "            if (!$assignedTags->has($epc)) {\n"
    "                $mismatch = true;\n"
    '                $mismatchDetails[] = "Tag EPC \'{$epc}\' tidak di-assign ke dokumen #{$shippingDoc->document_number}.";\n'
    "                continue;\n"
    "            }"
)

new5 = (
    "        // v2: draft tidak punya pre-assigned tags\n"
    "        $isDraft = $shippingDoc->status === 'draft';\n"
    "\n"
    "        $assignedTags  = $shippingDoc->tags->keyBy('tag_epc');\n"
    "        $assignedEpcs  = $assignedTags->keys()->all();\n"
    "        $expectedItems = $shippingDoc->items->mapWithKeys(fn ($i) => [$i->item_id => (int) $i->expected_qty]);\n"
    "\n"
    "        if (!$isDraft) {\n"
    "            $assignedItemCounts = $shippingDoc->items->mapWithKeys(fn ($item) => [\n"
    "                $item->item_id => $assignedTags->filter(fn ($tag) => (int) $tag->shipping_document_item_id === (int) $item->id)->count(),\n"
    "            ]);\n"
    "            foreach ($expectedItems as $itemId => $requiredQty) {\n"
    "                $assignedQty = $assignedItemCounts->get($itemId, 0);\n"
    "                if ($assignedQty !== $requiredQty) {\n"
    "                    $mismatch = true;\n"
    '                    $mismatchDetails[] = "Jumlah tag ter-assign untuk item #{$itemId} adalah {$assignedQty}/{$requiredQty}; lengkapi assignment sebelum gate.";\n'
    "                }\n"
    "            }\n"
    "        }\n"
    "\n"
    "        foreach ($epcList as $epc) {\n"
    "            if (!$isDraft && !$assignedTags->has($epc)) {\n"
    "                $mismatch = true;\n"
    '                $mismatchDetails[] = "Tag EPC \'{$epc}\' tidak di-assign ke dokumen #{$shippingDoc->document_number}.";\n'
    "                continue;\n"
    "            }"
)

if old5 in c:
    c = c.replace(old5, new5)
    with open(path, "w") as f:
        f.write(c)
    print("patch5 OK")
else:
    print("patch5 NOT FOUND")
    # show context around assignedTags
    idx = c.find("$assignedTags  = $shippingDoc->tags->keyBy")
    print(repr(c[idx:idx+400]))
