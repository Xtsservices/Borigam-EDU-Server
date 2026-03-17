const mysql = require("mysql2/promise");
require("dotenv").config();

async function checkDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "borigam",
      port: Number(process.env.DB_PORT) || 3306,
    });

    console.log("\n📊 Checking database for content ID 3...\n");
    
    const [rows] = await connection.execute(
      "SELECT id, title, description, content_type, content_text, updated_at FROM course_contents WHERE id = 3"
    );

    if (rows.length === 0) {
      console.log("❌ Content ID 3 not found in database!");
    } else {
      const content = rows[0];
      console.log("✅ Content found in database:");
      console.log("─".repeat(80));
      console.log(`ID: ${content.id}`);
      console.log(`Title: ${content.title}`);
      console.log(`Description: ${content.description}`);
      console.log(`Content Type: ${content.content_type}`);
      console.log(`Updated At: ${content.updated_at}`);
      console.log(`\nContent Text (first 200 chars):\n${content.content_text ? content.content_text.substring(0, 200) : "[NULL]"}`);
      console.log(`\nContent Text (full length): ${content.content_text ? content.content_text.length + " chars" : "[NULL]"}`);
      if (content.content_text) {
        console.log(`\n📝 Full Content Text:\n${content.content_text}`);
      }
    }

    await connection.end();
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

checkDatabase();
