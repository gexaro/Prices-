
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
        localName,
        originalPrice: rawPrice,
        price: price.value,
        priceValid: price.valid,
        issues,
        needsReview: issues.some(issue =>
          issue.includes("مراجعة") ||
          issue.includes("انزياح") ||
          issue.includes("صفراً") ||
          issue.includes("مفقود")
        )
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
