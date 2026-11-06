
(function () {
  "use strict";

  function parseRows(input) {
    const text = String(input || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i++;

        row.push(cell);

        if (row.some(value => value.trim())) {
          rows.push(row);
        }

        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);

    if (row.some(value => value.trim())) {
      rows.push(row);
    }

    if (quoted) {
      throw new Error("يوجد حقل نصي غير مكتمل بين علامتي اقتباس.");
    }

    return rows;
  }

  function cleanPrice(value) {
    const original = String(value ?? "").trim();

    // إزالة العلامات التي وافق المستخدم على تجاهلها.
        const cleaned = original
      .replace(/\s*العلبة\s*$/i, "")
      .replace(/[*^]/g, "")
      .replace(/[“”"']/g, "")
      .replace(/[٬،,]/g, "")
      .replace(/\s+/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) {
      return {
        value: null,
        original,
        valid: false
      };
    }

    const number = Number(cleaned);

    return {
      value: Number.isFinite(number) ? number : null,
      original,
      valid: Number.isFinite(number)
    };
  }

  function parseMedicineName(value) {
    const original = String(value || "").trim();
    let working = original.replace(/[💉]/g, " ");

    const formPatterns = [
      [/(?<![A-Za-z])(tab|tabs|tablet|tablets)\b\.?/i, "أقراص"],
      [/\b(cap|caps|capsule|capsules)\b\.?/i, "كبسولات"],
      [/\b(syrp|syrup|syrups)\b\.?/i, "شراب"],
      [/\b(amp|amps|ampoule|ampoules)\b\.?/i, "أمبول"],
      [/\b(vial|vials)\b\.?/i, "فيال"],
      [/\b(inj|injection|syringe)\b\.?/i, "حقن"],
      [/\b(cream)\b\.?/i, "كريم"],
      [/\b(oint|ointment)\b\.?/i, "مرهم"],
      [/\b(gel)\b\.?/i, "جل"],
      [/\b(spray)\b\.?/i, "بخاخ"],
      [/\b(drp|drops|drop)\b\.?/i, "قطرات"],
      [/\b(supp|suppository)\b\.?/i, "تحاميل"],
      [/\b(pdr|powder)\b\.?/i, "مسحوق"],
      [/\b(inhaler)\b\.?/i, "بخاخ استنشاق"],
      [/\b(orally|oral)\b\.?/i, "فموي"],       [/\b(sol|solution)\b\.?/i, "محلول"]
    ];

    let dosageForm = "";

    for (const [pattern, label] of formPatterns) {
      if (pattern.test(working)) {
        dosageForm = label;
        working = working.replace(pattern, " ");
        break;
      }
    }

    const strengthPattern =
      /(?:^|\s)(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?){0,3}%?)(?=\s|$)/;

    const match = working.match(strengthPattern);
    let strength = "";

    if (match) {
      strength = match[1].replace(/\s/g, "");
      working = working.replace(match[0], " ");
    }

    const brandName = working
      .replace(/\b(IV|IM)\b/gi, " ")
      .replace(/[💉]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s+\-.,]+|[\s+\-.,]+$/g, "")
      .trim();
    return {
      original,
      brandName,
      strength,
      dosageForm
    };
  }

  function parse(input) {
    const rows = parseRows(input);

    if (rows.length < 2) {
      throw new Error("ملف CSV لا يحتوي على بيانات كافية.");
    }

    const headers = rows[0].map(value => value.trim());

    const required = [
      "Description",
      "Name",
      "الاسم",
      "Price"
    ];

    const indexes = {};

    required.forEach(name => {
      indexes[name] = headers.indexOf(name);

      if (indexes[name] < 0) {
        throw new Error("العمود المطلوب غير موجود: " + name);
      }
    });

    const records = [];

    rows.slice(1).forEach((row, index) => {
      const rowNumber = index + 2;

      const get = name =>
        String(row[indexes[name]] ?? "").trim();

      const description = get("Description");
      const name = get("Name");
      const localName = get("الاسم");
           const parsedName = parseMedicineName(name);
       const rawPrice = get("Price");

      const price = cleanPrice(rawPrice);
      const issues = [];

      if (!name) {
        issues.push("اسم الدواء مفقود");
      }

      if (!rawPrice) {
        issues.push("السعر مفقود");
      } else if (!price.valid) {
        issues.push("السعر يحتاج مراجعة");
      }

      if (!description) {
        issues.push("الوصف العلمي أو الشركة غير متوفر");
      }

      if (price.valid && price.value === 0) {
        issues.push("السعر يساوي صفراً");
      }

      // اكتشاف السجل المعروف الذي تبدلت فيه خانات الاسم والسعر.
      if (
        /^\d+$/.test(name) &&
        /[a-zA-Z\u0600-\u06FF]/.test(rawPrice)
      ) {
        issues.push("احتمال انزياح الأعمدة");
      }

      records.push({
        rowNumber,
        timestamp: String(row[0] ?? "").trim(),
        description,
        name,
                parsedName,
        localName,
        originalPrice: rawPrice,
        price: price.value,
        priceValid: price.valid,
        issues,
                needsReview: issues.length > 0
      });
    });

    return {
      headers,
      total: records.length,
      records,
      reviewCount: records.filter(item => item.needsReview).length
    };
  }

  window.PricesCSV = { parse };
})();
