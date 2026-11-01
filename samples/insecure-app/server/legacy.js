const express = require("express");
const mongoose = require("mongoose");
const { exec } = require("child_process");

const app = express();
app.use(express.json());
const User = mongoose.model("User", new mongoose.Schema({ email: String, password: String }));

// PLANTED: NoSQL injection - attacker can send {"password": {"$ne": null}}
app.post("/legacy/login", async (req, res) => {
  const user = await User.findOne(req.body);
  res.json({ ok: !!user });
});

// PLANTED: command injection
app.get("/legacy/thumbnail", (req, res) => {
  exec(`convert uploads/${req.query.file} -resize 100x100 thumb.png`, () => res.send("ok"));
});

app.listen(4000);

// PLANTED: SSRF - fetches any URL the visitor passes
app.get("/legacy/preview", async (req, res) => {
  const page = await fetch(req.query.url);
  res.send(await page.text());
});
