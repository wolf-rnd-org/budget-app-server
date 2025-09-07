// r.get("/", async (req, res, next) => {
//   try {
//     const pid = String(req.query.program_id || "").trim();
//     if (!pid) {
//       const all = await listAllCategories();
//       return res.json(all);
//     }

//     const esc = pid.replace(/"/g, '\\"');

    // אם בטבלת categories יש שדה מקושר ל־programs (linked record) בשם {program_id}:
//     // כשהוא linked, הוא בעצם מחזיק recordIds => נסו גם לפי recordId של התוכנית
//     const [program] = await base("programs")
//       .select({ filterByFormula: `{program_id} = "${esc}"`, maxRecords: 1, pageSize: 1 })
//       .all();

//     const filter = program
//       ? `OR(FIND("${program.id}", ARRAYJOIN({program_id})), {program_id} = "${esc}")`
//       : `{program_id} = "${esc}"`;

//     const recs = await base("categories")
//       .select({ filterByFormula: filter, fields: ["name","program_id"] })
//       .all();

//     const out = recs.map(r => ({
//       id: r.id,
//       name: String(r.get("name") ?? ""),
//       program_id: String(r.get("program_id") ?? ""),
//     }));

//     res.json(out);
//   } catch (e) { next(e); }
// });