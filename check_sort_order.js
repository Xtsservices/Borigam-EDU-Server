const mysql = require("mysql2/promise");
require("dotenv").config();

async function checkSortOrder() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "borigam",
      port: Number(process.env.DB_PORT) || 3306,
    });

    console.log("\n📊 Checking sort_order values for all section contents...\n");
    
    // Get all sections first
    const [sections] = await connection.execute(
      `SELECT id, title FROM course_sections LIMIT 5`
    );

    for (const section of sections) {
      console.log(`\n📌 Section: "${section.title}" (ID: ${section.id})`);
      console.log("─".repeat(100));
      
      const [contents] = await connection.execute(
        `SELECT id, title, content_type, sort_order, created_at, updated_at 
         FROM course_contents 
         WHERE section_id = ? AND status = 1
         ORDER BY created_at DESC
         LIMIT 10`,
        [section.id]
      );

      if (contents.length === 0) {
        console.log("(No contents in this section)");
      } else {
        console.log("Order by created_at DESC (newest first):");
        contents.forEach((c, i) => {
          console.log(
            `  ${i + 1}. [${c.content_type}] ${c.title}`
          );
          console.log(
            `     ├─ sort_order: ${c.sort_order} | ID: ${c.id}`
          );
          console.log(
            `     └─ Created: ${c.created_at} | Updated: ${c.updated_at}`
          );
        });

        console.log("\n" + "─".repeat(100));
        console.log("Order by sort_order ASC (as displayed):");
        
        const [contentsSorted] = await connection.execute(
          `SELECT id, title, content_type, sort_order 
           FROM course_contents 
           WHERE section_id = ? AND status = 1
           ORDER BY sort_order ASC`,
          [section.id]
        );

        contentsSorted.forEach((c, i) => {
          console.log(
            `  ${i + 1}. ${c.sort_order.toString().padStart(3)} - [${c.content_type.padEnd(8)}] ${c.title}`
          );
        });
      }
    }

    await connection.end();
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkSortOrder();
