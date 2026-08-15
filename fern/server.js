import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve everything in the fern folder
app.use(express.static(__dirname));

// Open fern.html when visiting /
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "fern.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fern server running at http://localhost:${PORT}`);
});
